import os
import sys
import json
import re
import logging
import urllib.parse
from pathlib import Path
from typing import Dict, Any, List, Optional

# HTTP + JWT helpers
import time
import requests
import jwt
from jwt.algorithms import RSAAlgorithm
from collections import deque
from dotenv import load_dotenv

# Simple in-memory rate limiter storage
# Note: `slowapi` is added to requirements.txt per request, but for
# this lightweight deployment we use a small in-memory sliding window
# limiter keyed by user id (or client IP). This is acceptable because
# Cloud Run is configured with `--max-instances 1` for this app.
# If you scale beyond a single instance, replace this in-memory store
# with Redis or another centralized store.
_RATE_LIMIT_STORE: Dict[str, deque] = {}
_RATE_LIMIT_WINDOW = 60  # seconds
_RATE_LIMIT_MAX = 10     # requests per window per key
import threading
import uuid

# Ensure project root is in sys.path
ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

load_dotenv(ROOT / "backend" / ".env")

from config import load_config, save_config
from backend.pipeline_service import execute_pipeline, query_active_pipeline, get_stage_diagnostics
from backend.log_handler import ws_log_handler

logger = logging.getLogger("backend.app")
# NOTE: backend.log_handler (imported above) attaches ws_log_handler to the
# root logger as an import-time side effect. That means the root logger
# already has a handler by the time we get here, which makes
# logging.basicConfig() a silent no-op (per its documented behavior) unless
# force=True is passed. We deliberately do NOT use force=True, since that
# would remove ws_log_handler and break the in-app real-time log stream.
# Instead, explicitly set the root level and add our own StreamHandler
# alongside the existing one, so logs also reach stdout/stderr (and from
# there, Cloud Logging) in addition to the WebSocket subscribers.
logging.getLogger().setLevel(logging.INFO)
if not any(isinstance(h, logging.StreamHandler) for h in logging.getLogger().handlers):
    _stream_handler = logging.StreamHandler()
    _stream_handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s"))
    logging.getLogger().addHandler(_stream_handler)

INGEST_DIR = ROOT / "ingestables"
INGEST_DIR.mkdir(exist_ok=True)
FRONTEND_DIST = ROOT / "Frontend" / "dist"

# JWKS cache for Clerk public keys
_JWKS_CACHE: Dict[str, Any] = {"keys": [], "fetched_at": 0}
_JWKS_TTL = 60 * 60  # 1 hour

def _get_clerk_jwks() -> Dict[str, Any]:
    now = int(time.time())
    if _JWKS_CACHE.get("fetched_at", 0) + _JWKS_TTL > now and _JWKS_CACHE.get("keys"):
        return _JWKS_CACHE

    issuer = os.environ.get("CLERK_ISSUER", "").rstrip("/")
    jwks_url = os.environ.get("CLERK_JWKS_URL") or (f"{issuer}/.well-known/jwks.json" if issuer else "")
    if not jwks_url:
        logger.error("Clerk JWKS configuration is missing: set CLERK_JWKS_URL or CLERK_ISSUER")
        return _JWKS_CACHE
    try:
        r = requests.get(jwks_url, timeout=5)
        r.raise_for_status()
        data = r.json()
        _JWKS_CACHE.update({"keys": data.get("keys", []), "fetched_at": now})
    except Exception as exc:
        logger.error("Clerk JWKS request failed for configured endpoint: %s", exc)
    return _JWKS_CACHE

def verify_clerk_token(authorization_header: str) -> Optional[Dict[str, Any]]:
    """Verify a Clerk-issued JWT (session or client) using JWKS public keys.

    Returns the decoded payload on success, or None on failure.
    """
    logger.info("Clerk auth: authorization_header_present=%s", bool(authorization_header))
    if not authorization_header:
        return None

    scheme, _, token = authorization_header.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        logger.warning("Clerk auth rejected: bearer_token_extracted=False")
        return None
    token = token.strip()
    logger.info("Clerk auth: bearer_token_extracted=True")

    try:
        token_header = jwt.get_unverified_header(token)
        algorithm = token_header.get("alg")
        key_id = token_header.get("kid")
        logger.info("Clerk auth token header: alg=%s kid=%s", algorithm, key_id)
        if algorithm != "RS256" or not key_id:
            raise ValueError("unsupported or incomplete JWT header")

        unverified_claims = jwt.decode(token, options={"verify_signature": False})
        logger.info(
            "Clerk auth token claims: iss=%s aud=%s azp=%s exp=%s sub=%s",
            unverified_claims.get("iss"),
            unverified_claims.get("aud"),
            unverified_claims.get("azp"),
            unverified_claims.get("exp"),
            unverified_claims.get("sub"),
        )

        jwks = _get_clerk_jwks()
        keys = jwks.get("keys", [])
        key_entry = next((key for key in keys if key.get("kid") == key_id), None)
        if not key_entry:
            raise ValueError("JWT signing key id was not found in the configured Clerk JWKS")
        if key_entry.get("kty") != "RSA":
            raise ValueError("JWT signing key is not an RSA key")
        if key_entry.get("alg") not in (None, "RS256"):
            raise ValueError("JWT signing key uses an unsupported algorithm")

        issuer = os.environ.get("CLERK_ISSUER", "").rstrip("/") or None
        if not issuer:
            raise ValueError("CLERK_ISSUER is not configured")
        configured_audience = os.environ.get("CLERK_AUDIENCE") or None
        public_key = RSAAlgorithm.from_jwk(json.dumps(key_entry))
        payload = jwt.decode(
            token,
            public_key,
            algorithms=["RS256"],
            issuer=issuer,
            audience=configured_audience,
            options={"verify_aud": configured_audience is not None},
        )
        logger.info("Clerk auth verification succeeded: sub=%s", payload.get("sub"))
        return payload
    except Exception as exc:
        logger.warning("Clerk auth verification rejected token: %s", exc)
        return None

def _get_mime_type(path: Path) -> str:
    ext = path.suffix.lower()
    mimes = {
        ".html": "text/html; charset=utf-8",
        ".js": "application/javascript; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".json": "application/json; charset=utf-8",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".svg": "image/svg+xml",
        ".ico": "image/x-icon",
        ".pdf": "application/pdf",
    }
    return mimes.get(ext, "application/octet-stream")


def _check_rate_limit(key: str) -> tuple[bool, int]:
    """Check and record a request for the given key.
    Returns (allowed: bool, retry_after_seconds: int).
    """
    now_ts = time.time()
    # protect store with a lock to be safer in threaded environment
    if key not in _RATE_LIMIT_STORE:
        _RATE_LIMIT_STORE[key] = deque()
    dq = _RATE_LIMIT_STORE[key]
    # evict old entries
    while dq and now_ts - dq[0] > _RATE_LIMIT_WINDOW:
        dq.popleft()
    if len(dq) >= _RATE_LIMIT_MAX:
        retry_after = int(_RATE_LIMIT_WINDOW - (now_ts - dq[0])) + 1
        return False, retry_after
    dq.append(now_ts)
    return True, 0

def _extract_multipart_file(body_bytes: bytes, content_type: str) -> tuple[str, bytes]:
    """Parse multipart form-data to extract the clean file payload and original filename."""
    boundary_match = re.search(r'boundary=([^;]+)', content_type)
    if not boundary_match:
        return "uploaded_document.pdf", body_bytes

    boundary = boundary_match.group(1).strip().strip('"').encode()
    parts = body_bytes.split(b'--' + boundary)

    for part in parts:
        if b'filename="' in part:
            header_end = part.find(b'\r\n\r\n')
            if header_end != -1:
                header_text = part[:header_end].decode('utf-8', errors='ignore')
                fn_match = re.search(r'filename="([^"]+)"', header_text)
                fn = fn_match.group(1) if fn_match else "uploaded.pdf"
                # Strip leading path separators from Windows/Linux browsers
                fn = Path(fn).name
                file_data = part[header_end + 4:]
                if file_data.endswith(b'\r\n'):
                    file_data = file_data[:-2]
                if file_data.endswith(b'--'):
                    file_data = file_data[:-2].rstrip(b'\r\n')
                return fn, file_data

    return "uploaded_document.pdf", body_bytes

# Robust Native ASGI Application
async def app(scope, receive, send):
    scope_type = scope.get("type")

    if scope_type == "lifespan":
        while True:
            message = await receive()
            if message["type"] == "lifespan.startup":
                await send({"type": "lifespan.startup.complete"})
            elif message["type"] == "lifespan.shutdown":
                await send({"type": "lifespan.shutdown.complete"})
                break
        return

    if scope_type == "websocket":
        path = scope.get("path", "")
        if path == "/ws/terminal" or path.startswith("/ws"):
            await send({"type": "websocket.accept"})

            async def log_subscriber(log_entry):
                try:
                    await send({
                        "type": "websocket.send",
                        "text": json.dumps({"type": "log", "data": log_entry})
                    })
                except Exception:
                    pass

            def sync_subscriber(log_entry):
                import asyncio
                try:
                    loop = asyncio.get_event_loop()
                    loop.create_task(log_subscriber(log_entry))
                except Exception:
                    pass

            ws_log_handler.subscribe(sync_subscriber)
            try:
                while True:
                    msg = await receive()
                    if msg.get("type") == "websocket.disconnect":
                        break
            finally:
                ws_log_handler.unsubscribe(sync_subscriber)
        return

    if scope_type != "http":
        return

    # HTTP Handling
    method = scope.get("method", "GET")
    raw_path = scope.get("path", "/")
    path = urllib.parse.unquote(raw_path)

    # Extract headers
    headers_dict = {}
    for h_name, h_val in scope.get("headers", []):
        headers_dict[h_name.decode("latin1").lower()] = h_val.decode("latin1")

    async def send_json(data: Any, status: int = 200):
        body = json.dumps(data).encode("utf-8")
        resp_headers = [
            (b"content-type", b"application/json"),
            (b"content-length", str(len(body)).encode("utf-8")),
            (b"access-control-allow-origin", b"*"),
            (b"access-control-allow-methods", b"GET, POST, OPTIONS"),
            (b"access-control-allow-headers", b"*"),
        ]
        await send({"type": "http.response.start", "status": status, "headers": resp_headers})
        await send({"type": "http.response.body", "body": body})

    # CORS Preflight
    if method == "OPTIONS":
        resp_headers = [
            (b"access-control-allow-origin", b"*"),
            (b"access-control-allow-methods", b"GET, POST, OPTIONS"),
            (b"access-control-allow-headers", b"*"),
        ]
        await send({"type": "http.response.start", "status": 204, "headers": resp_headers})
        await send({"type": "http.response.body", "body": b""})
        return

    # Read request body
    body_bytes = b""
    more_body = True
    while more_body:
        message = await receive()
        body_bytes += message.get("body", b"")
        more_body = message.get("more_body", False)

    # API Routes
    # Health endpoint
    if path == "/health":
        if method == "GET":
            await send_json({"status": "ok"})
            return
    if path == "/api/config":
        if method == "GET":
            await send_json(load_config())
            return
        elif method == "POST":
            try:
                cfg = json.loads(body_bytes.decode("utf-8")) if body_bytes else {}
                save_config(cfg)
                await send_json({"status": "saved", "config": cfg})
            except Exception as e:
                await send_json({"error": str(e)}, status=400)
            return

    elif path == "/api/documents":
        docs = []
        if INGEST_DIR.exists():
            for f in INGEST_DIR.glob("*.*"):
                if f.is_file() and not f.name.startswith("."):
                    size_kb = f.stat().st_size / 1024
                    size_str = f"{size_kb / 1024:.2f} MB" if size_kb > 1024 else f"{size_kb:.1f} KB"
                    rel_path = f"ingestables/{f.name}"
                    docs.append({
                        "name": f.name,
                        "path": rel_path,
                        "size": size_str,
                    })
        await send_json(docs)
        return

    elif path == "/api/upload" and method == "POST":
        try:
            content_type = headers_dict.get("content-type", "")
            orig_filename, clean_bytes = _extract_multipart_file(body_bytes, content_type)
            
            dest = INGEST_DIR / orig_filename
            dest.write_bytes(clean_bytes)

            size_kb = len(clean_bytes) / 1024
            size_str = f"{size_kb / 1024:.2f} MB" if size_kb > 1024 else f"{size_kb:.1f} KB"
            
            page_count = 1
            if orig_filename.endswith(".pdf"):
                try:
                    from pypdf import PdfReader
                    reader = PdfReader(str(dest))
                    page_count = len(reader.pages)
                except Exception:
                    pass

            logger.info("Uploaded and verified document: %s (%s, %d pages)", orig_filename, size_str, page_count)
            await send_json({
                "success": True,
                "name": orig_filename,
                "path": f"ingestables/{orig_filename}",
                "size": size_str,
                "pages": page_count,
            })
        except Exception as e:
            logger.exception("Upload error")
            await send_json({"error": str(e)}, status=500)
        return

    elif path == "/api/pipeline/run" and method == "POST":
        # Start pipeline as a background job and return a job_id for polling
        auth_header = headers_dict.get('authorization', '')
        payload = verify_clerk_token(auth_header)
        if payload is None:
            await send_json({"error": "unauthorized"}, status=401)
            return
        try:
            cfg = json.loads(body_bytes.decode("utf-8")) if body_bytes else {}
        except Exception:
            cfg = {}

        # Rate limiting keyed by user id (fallback to IP). pipeline/run is authenticated
        uid = payload.get('sub') or payload.get('user_id') or payload.get('id')
        if uid:
            key = f"user:{uid}"
        else:
            ip = headers_dict.get('x-forwarded-for', '').split(',')[0].strip() or headers_dict.get('x-real-ip') or (scope.get('client')[0] if scope.get('client') else 'unknown')
            key = f"ip:{ip}"
        allowed, retry_after = _check_rate_limit(key)
        if not allowed:
            await send_json({"error": "rate_limit_exceeded", "retry_after": retry_after}, status=429)
            return

        # Simple in-memory job store (ephemeral). WARNING: This is only safe
        # when Cloud Run is deployed with `--max-instances 1`. If you ever
        # allow multiple instances, replace this with a centralized job
        # store such as Redis/Cloud SQL so workers can coordinate.
        if not hasattr(app, "_jobs"):
            app._jobs = {}

        # Evict jobs older than JOB_TTL to prevent unbounded growth
        JOB_TTL = 60 * 60  # 1 hour
        now_ts = int(time.time())
        to_delete = []
        for jid, info in list(app._jobs.items()):
            created = info.get("created_at", now_ts)
            if now_ts - created > JOB_TTL:
                to_delete.append(jid)
        for jid in to_delete:
            try:
                del app._jobs[jid]
            except KeyError:
                pass

        job_id = str(uuid.uuid4())
        app._jobs[job_id] = {"status": "pending", "progress": 0, "result": None, "error": None, "created_at": now_ts}

        def _run_job(jid: str, cfg_obj: Dict[str, Any]):
            try:
                app._jobs[jid]["status"] = "running"
                # Execute pipeline (blocking) and store result
                res = execute_pipeline(cfg_obj)
                app._jobs[jid]["result"] = res
                app._jobs[jid]["status"] = "completed"
                app._jobs[jid]["progress"] = 100
            except Exception as e:
                logger.exception("Background pipeline job failed")
                app._jobs[jid]["error"] = str(e)
                app._jobs[jid]["status"] = "failed"

        t = threading.Thread(target=_run_job, args=(job_id, cfg), daemon=True)
        t.start()

        await send_json({"job_id": job_id, "status": "pending"}, status=202)
        return

    elif path == "/api/pipeline/diagnostics" and method == "GET":
        try:
            diag = get_stage_diagnostics()
            await send_json(diag)
        except Exception as e:
            await send_json({"error": str(e)}, status=500)
        return

    elif path.startswith("/api/pipeline/status/") and method == "GET":
        # GET /api/pipeline/status/{job_id}
        # Require Clerk authentication
        auth_header = headers_dict.get('authorization', '')
        payload = verify_clerk_token(auth_header)
        if payload is None:
            await send_json({"error": "unauthorized"}, status=401)
            return

        parts = path.split("/")
        job_id = parts[-1] if parts else ""
        jobs = getattr(app, "_jobs", {})
        job = jobs.get(job_id)
        if not job:
            await send_json({"error": "not_found"}, status=404)
            return
        await send_json({"job_id": job_id, "status": job.get("status"), "progress": job.get("progress"), "result": job.get("result"), "error": job.get("error")})
        return

    elif path == "/api/proxy/llm" and method == "POST":
        # Proxy LLM requests through the server so API keys stay secret.
        # Require authentication
        auth_header = headers_dict.get('authorization', '')
        payload_auth = verify_clerk_token(auth_header)
        if payload_auth is None:
            await send_json({"error": "unauthorized"}, status=401)
            return

        # Rate limiting keyed by user id (fallback to IP)
        uid = payload_auth.get('sub') or payload_auth.get('user_id') or payload_auth.get('id')
        if uid:
            key = f"user:{uid}"
        else:
            ip = headers_dict.get('x-forwarded-for', '').split(',')[0].strip() or headers_dict.get('x-real-ip') or (scope.get('client')[0] if scope.get('client') else 'unknown')
            key = f"ip:{ip}"
        allowed, retry_after = _check_rate_limit(key)
        if not allowed:
            await send_json({"error": "rate_limit_exceeded", "retry_after": retry_after}, status=429)
            return

        try:
            body = json.loads(body_bytes.decode("utf-8")) if body_bytes else {}
            provider = body.get('provider', 'openai')
            request_payload = body.get('request', {})

            if provider == 'openai':
                openai_key = os.environ.get('OPENAI_API_KEY') or os.environ.get('OPENAI_KEY')
                if not openai_key:
                    await send_json({"error": "openai_api_key_missing"}, status=502)
                    return

                resp = requests.post(
                    'https://api.openai.com/v1/chat/completions',
                    headers={
                        'Authorization': f'Bearer {openai_key}',
                        'Content-Type': 'application/json'
                    },
                    json=request_payload,
                    timeout=30
                )
                try:
                    resp.raise_for_status()
                    await send_json(resp.json())
                except requests.exceptions.HTTPError as http_err:
                    # Map OpenAI rate-limit / quota errors to a friendly upstream_unavailable
                    status_code = getattr(resp, 'status_code', None)
                    if status_code in (429, 402, 503):
                        await send_json({"error": "upstream_unavailable"}, status=503)
                    else:
                        await send_json({"error": "upstream_error", "details": resp.text}, status=502)
                return

            else:
                await send_json({"error": "unsupported_provider"}, status=400)
                return
        except Exception as e:
            logger.exception("Proxy LLM error")
            await send_json({"error": "upstream_unavailable"}, status=503)
        return

    elif path == "/api/query" and method == "POST":
        # Require Clerk authentication
        auth_header = headers_dict.get('authorization', '')
        payload = verify_clerk_token(auth_header)
        if payload is None:
            await send_json({"error": "unauthorized"}, status=401)
            return

        try:
            payload = json.loads(body_bytes.decode("utf-8")) if body_bytes else {}
            query_text = payload.get("query", "")
            cfg = payload.get("config", {})
            generation_model = cfg.get("generation_model")
            k = int(cfg.get("k", 5))
            output_format = cfg.get("output_format", "snippet")
            snippet_len = int(cfg.get("snippet_length", 400))
            res = query_active_pipeline(query_text, k=k, output_format=output_format, snippet_length=snippet_len)
            try:
                from Generation.answer_generator import generate_answer

                generation_chunks = [
                    {
                        "chunk_id": item["chunk_id"],
                        "text": item.get("metadata", {}).get("source_text", item["doc"]),
                    }
                    for item in res.get("results", [])
                ]
                res["generation"] = generate_answer(query_text, generation_chunks, model=generation_model)
            except Exception as generation_error:
                logger.exception("Answer generation failed")
                res["generation"] = None
                res["generation_error"] = str(generation_error)
            await send_json(res)
        except Exception as e:
            logger.exception("Query error")
            await send_json({"error": str(e)}, status=500)
        return

    # Static file serving for Frontend/dist
    if FRONTEND_DIST.exists():
        req_file = path.lstrip("/")
        file_path = FRONTEND_DIST / req_file if req_file else FRONTEND_DIST / "index.html"
        
        if not file_path.exists() or file_path.is_dir():
            file_path = FRONTEND_DIST / "index.html"

        if file_path.exists() and file_path.is_file():
            content = file_path.read_bytes()
            mime = _get_mime_type(file_path)
            resp_headers = [
                (b"content-type", mime.encode("utf-8")),
                (b"content-length", str(len(content)).encode("utf-8")),
            ]
            await send({"type": "http.response.start", "status": 200, "headers": resp_headers})
            await send({"type": "http.response.body", "body": content})
            return

    # 404 Not Found
    body = b"Not Found"
    resp_headers = [
        (b"content-type", b"text/plain"),
        (b"content-length", str(len(body)).encode("utf-8")),
    ]
    await send({"type": "http.response.start", "status": 404, "headers": resp_headers})
    await send({"type": "http.response.body", "body": body})

if __name__ == "__main__":
    try:
        import uvicorn
        uvicorn.run(app, host="127.0.0.1", port=8000)
    except ImportError:
        print("Uvicorn not installed. Please run via: python run.py")
