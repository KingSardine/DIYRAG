# Clerk session verification (Python)

This file contains example snippets to verify Clerk sessions on the backend (Python) for protected API endpoints.

Option A — Use Clerk's official Python SDK (recommended)

1. Install the SDK:

```bash
pip install clerk-sdk
```

2. Example (Flask) — verify the session token sent from the client:

```python
from flask import Flask, request, jsonify
from clerk import Clerk

app = Flask(__name__)
clerk = Clerk(api_key="sk_...")  # use your Clerk secret key from env

def require_auth(func):
    def wrapper(*args, **kwargs):
        auth = request.headers.get('Authorization')
        if not auth or not auth.lower().startswith('bearer '):
            return jsonify({'error': 'missing auth'}), 401
        token = auth.split(' ', 1)[1]
        try:
            session = clerk.sessions.verify_session_token(token)
        except Exception:
            return jsonify({'error': 'invalid session'}), 401
        # session is valid, proceed
        return func(*args, **kwargs)
    return wrapper

@app.route('/api/protected')
@require_auth
def protected():
    return jsonify({'ok': True})

```

Option B — Verify JWTs yourself (no SDK)

1. Install dependencies:

```bash
pip install pyjwt requests cryptography
```

2. Example helper (high level):

```python
import requests
import jwt
from jwt.algorithms import RSAAlgorithm

CLERK_JWKS_URL = 'https://clerk.com/.well-known/jwks.json'  # verify current URL from Clerk docs

def get_jwks():
    r = requests.get(CLERK_JWKS_URL)
    r.raise_for_status()
    return r.json()

def verify_token(token, audience=None):
    jwks = get_jwks()
    unverified = jwt.decode(token, options={"verify_signature": False})
    kid = unverified.get('kid')
    key_entry = next((k for k in jwks['keys'] if k['kid'] == kid), None)
    if not key_entry:
        raise Exception('Key not found')
    public_key = RSAAlgorithm.from_jwk(key_entry)
    payload = jwt.decode(token, public_key, algorithms=[key_entry['alg']], audience=audience)
    return payload
```

Notes
- Prefer Clerk's official SDK when possible — it handles key rotation and session verification details.
- Always store secret keys (`sk_...`) in environment variables and never commit them.
- On the client, send the session token in `Authorization: Bearer <token>` when calling protected APIs.
