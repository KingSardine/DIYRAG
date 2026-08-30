# Project Progress — DiyRAG

This document summarizes implemented changes and current status as of August 30, 2026.

## Summary of Key Changes
- Tests
  - Ran Python test suite; all tests pass after fixes to retriever/embeddings.

- Frontend (Vite + React + TypeScript)
  - Integrated Clerk authentication provider and sign-in UI. (Files: `Frontend/src/main.tsx`, `Frontend/src/components/AuthPages.tsx`)
  - Replaced problematic `SignedIn`/`SignedOut` import usage with `useAuth()` guard to prevent runtime import errors. (`Frontend/src/App.tsx`)
  - Added `UserButton` and header integration. (`Frontend/src/components/Header.tsx`)
  - Fixed JSX mismatches and runtime errors in `App.tsx`.
  - Implemented `NodeDetailModal` Stage Inspector diagnostics component. (`Frontend/src/components/NodeDetailModal.tsx`)
  - Ensured Stage Inspector receives up-to-date diagnostics by refreshing after pipeline runs. (`Frontend/src/App.tsx`, change in `handleRunPipeline`).
  - Added `proxyLLM()` frontend wrapper for server LLM proxy. (`Frontend/src/services/api.ts`)

- Backend (FastAPI)
  - Implemented manual Clerk token verification using JWKS in `backend/app.py` and protected critical endpoints (`/api/pipeline/run`, `/api/query`).
  - Added `/api/proxy/llm` endpoint to proxy requests to OpenAI and keep keys server-side.
  - Moved `CLERK_SECRET_KEY` and other secrets to `backend/.env` (removed from frontend env files).
  - Documented verification approaches in `backend/CLERK_SESSION_VERIFICATION.md`.

- Security & Secrets
  - Ensured publishable Clerk key remains in frontend env (`VITE_CLERK_PUBLISHABLE_KEY`) and secret keys are backend-only.

- Utilities and Dev Experience
  - Disabled auto-opening browser in `run.py` to avoid unexpected new tabs during runs.
  - Closed lingering dev server processes and freed ports used by Vite/esbuild/node during troubleshooting.

## Files Changed (representative)
- `run.py` — removed auto-open browser thread.
- `backend/app.py` — added JWKS-based Clerk verification and proxy route.
- `backend/.env` — moved secret keys here (ensure .gitignore contains it).
- `Frontend/src/main.tsx` — wrapped app in `ClerkProvider`.
- `Frontend/src/App.tsx` — auth guard, telemetry updates, diagnostics refresh.
- `Frontend/src/components/NodeDetailModal.tsx` — Stage Inspector UI.
- `Frontend/src/services/api.ts` — added `runPipelineApi`, `fetchDiagnostics`, `proxyLLM`.
- `Frontend/src/components/Header.tsx` — `UserButton` integration.

## Outstanding / Next Work
- Frontend: automatically attach Clerk session tokens to protected API calls (use Clerk `getToken()` or `getAuth()` in `Frontend/src/services/api.ts`).
- Backend: consider switching to Clerk's official Python server SDK for robust session handling.
- Deployment: containerization, Cloud Run/GCP deployment, secret management, and CI/CD workflows.
- Vector DB: choose production vector strategy and persistence (Vertex Matching Engine, Pinecone, Weaviate, or GCS-backed indexes).
- E2E: sign-in -> protected API calls -> pipeline run -> query and LLM proxy testing, and streaming UX verification.

## Useful Commands
- Local frontend dev:
```bash
cd Frontend
npm install
npm run dev
```
- Local backend run:
```bash
python -m venv .venv
.venv/Scripts/Activate.ps1
pip install -r requirements.txt
python run.py
```
- Build & test (suggested CI steps):
```bash
pytest -q --maxfail=1
cd Frontend && npm ci && npm run build
```

## Notes & Rationale
- Manual JWT verification is implemented as a stopgap; Clerk SDK is recommended for production to handle token/session edge cases.
- `runPipelineApi` in `Frontend/src/services/api.ts` simulates telemetry steps for UX while calling the backend; after backend completes, the frontend attempts to fetch diagnostics to update the Stage Inspector.


