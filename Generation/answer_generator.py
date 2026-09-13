"""Answer generation from retrieved RAG chunks using Anthropic."""

import json
import logging
import os
from typing import Any, Dict, List

import requests

logger = logging.getLogger("generation.answer")

ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages"
DEFAULT_MODEL = "claude-haiku-4-5-20251001"


def _parse_generation_response(text: str, retrieved_chunks: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Parse Claude's JSON response without inventing an answer on failure."""
    normalized_text = text.strip()
    if normalized_text.startswith("```") and normalized_text.endswith("```"):
        normalized_text = normalized_text[3:-3].strip()
        if normalized_text.lower().startswith("json"):
            normalized_text = normalized_text[4:].strip()
    try:
        parsed = json.loads(normalized_text)
    except json.JSONDecodeError as exc:
        object_start = normalized_text.find("{")
        object_end = normalized_text.rfind("}")
        if object_start == -1 or object_end <= object_start:
            raise ValueError("Anthropic returned non-JSON answer content") from exc
        try:
            parsed = json.loads(normalized_text[object_start:object_end + 1])
        except json.JSONDecodeError as nested_exc:
            raise ValueError("Anthropic returned non-JSON answer content") from nested_exc

    answer = parsed.get("answer")
    citations = parsed.get("citations")
    if not isinstance(answer, str) or not answer.strip():
        raise ValueError("Anthropic response did not contain a usable answer")
    if not isinstance(citations, list):
        raise ValueError("Anthropic response did not contain citations")

    normalized_citations = []
    valid_chunk_ids = {str(chunk["chunk_id"]) for chunk in retrieved_chunks}
    for citation in citations:
        if not isinstance(citation, dict):
            raise ValueError("Anthropic citations must be objects")
        part = citation.get("part")
        chunk_ids = citation.get("chunk_ids")
        if not isinstance(part, str) or not isinstance(chunk_ids, list):
            raise ValueError("Each citation requires part and chunk_ids")
        if not chunk_ids or not all(str(chunk_id) in valid_chunk_ids for chunk_id in chunk_ids):
            raise ValueError("Anthropic citation referenced an unknown chunk ID")
        normalized_citations.append({
            "part": part,
            "chunk_ids": [str(chunk_id) for chunk_id in chunk_ids],
        })

    return {"answer": answer.strip(), "citations": normalized_citations}


def generate_answer(
    query: str,
    retrieved_chunks: List[Dict[str, Any]],
    model: str | None = None,
) -> Dict[str, Any]:
    """Generate a strictly grounded answer and chunk-ID citations.

    ``retrieved_chunks`` must contain ``chunk_id`` and ``text`` fields. Errors
    are raised to the API layer so callers can return an explicit error while
    preserving the original retrieval results.
    """
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise RuntimeError("anthropic_api_key_missing")
    if not retrieved_chunks:
        raise ValueError("no_retrieved_chunks")

    context = "\n\n".join(
        f"[{chunk['chunk_id']}]\n{chunk['text']}" for chunk in retrieved_chunks
    )
    prompt = f"""Answer the user's question using only the retrieved chunks below.
Do not use outside knowledge. If the chunks do not support an answer, say so clearly.
Return JSON only with this exact shape:
{{"answer":"...", "citations":[{{"part":"sentence or claim", "chunk_ids":["chunk-1"]}}]}}
Every substantive answer claim must have one or more chunk IDs from the supplied context.

User question:
{query}

Retrieved chunks:
{context}
"""

    response = requests.post(
        ANTHROPIC_API_URL,
        headers={
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        },
        json={
            "model": model or os.environ.get("ANTHROPIC_MODEL", DEFAULT_MODEL),
            "max_tokens": 700,
            "temperature": 0,
            "messages": [{"role": "user", "content": prompt}],
        },
        timeout=45,
    )
    if not response.ok:
        try:
            error_message = response.json().get("error", {}).get("message", "unknown upstream error")
        except Exception:
            error_message = "unknown upstream error"
        raise RuntimeError(f"anthropic_request_failed:{response.status_code}:{error_message}")

    payload = response.json()
    content = payload.get("content")
    if not isinstance(content, list):
        raise ValueError("Anthropic response did not contain message content")
    text = "".join(item.get("text", "") for item in content if item.get("type") == "text")
    return _parse_generation_response(text, retrieved_chunks)
