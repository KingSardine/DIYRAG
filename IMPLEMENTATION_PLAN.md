# Implementation Plan — DiyRAG

## Goal
Make the repository deployable and production-ready with incremental deployments for features. Primary target: Google Cloud Platform (Cloud Run) with optional split frontend static hosting.

## Scope
- Containerize backend and frontend
- Add CI/CD for automated build/test/deploy to Cloud Run
- Secure secrets via Secret Manager
- Choose/persist vector storage strategy
- Ensure observability, health checks, and graceful rollback

## High-Level Phases
1. Prep & local reproducibility
   - Add `Dockerfile` for `backend/` and `Frontend/`.
   - Add `docker-compose.yml` for local dev (backend + frontend + optional Postgres).
   - Ensure `run.py` supports non-browser launches (already done).
2. CI & Artifact Registry
   - Add GitHub Actions workflow: lint, tests, build images, push to Artifact Registry, deploy to Cloud Run.
   - Create GCP service account and store key in GitHub Secrets (`GCP_SA_KEY`).
3. Secrets & Config
   - Move all sensitive keys to `backend/.env` for local dev and to Secret Manager for production.
   - Configure Cloud Run to consume secrets via `--set-secrets`.
4. Hosting & Routing
   - Option A: Single Cloud Run service serves API and static `Frontend/dist` (simple).
   - Option B: Frontend as static site on Cloud Storage + Cloud CDN, backend on Cloud Run (better performance/scalability).
5. Vector storage
   - Evaluate: Vertex AI Matching Engine vs Pinecone/Weaviate vs local persisted indexes on GCS/Filestore. Choose based on scale and budget.
6. Observability and Scaling
   - Add `/health` and `/ready` endpoints.
   - Configure Cloud Run CPU/memory and concurrency. Add logs to stdout and integrate with Cloud Logging.
7. Post-deploy
   - End-to-end testing: sign-in (Clerk), protected API calls, pipeline run, LLM proxy.
   - Set up monitoring/alerts (Uptime checks, logs-based alerts).

## Implementation Details
- Docker
  - `backend/Dockerfile`: Python slim image, install requirements, copy `backend/` and `run.py`, run `uvicorn backend.app:app --host 0.0.0.0 --port 8080`.
  - `Frontend/Dockerfile`: multi-stage build: Node build stage -> nginx static serve stage.
  - `docker-compose.yml`: local orchestration (backend, frontend, optional postgres, local vector DB).

- Secrets
  - Local: `backend/.env` (gitignored). Keys: `CLERK_SECRET_KEY`, `OPENAI_API_KEY`, other API keys.
  - Prod: Use Secret Manager and `gcloud run services update --set-secrets`.

- CI/CD (GitHub Actions)
  - Jobs: `test` (pytest + npm build), `build-and-push` (build images and push to Artifact Registry), `deploy` (gcloud run deploy).
  - Use `google-github-actions/auth` for short-lived credentials with a service account JSON stored in `GCP_SA_KEY` secret.

- Cloud Run specifics
  - Use Region: `us-central1` (example)
  - Container port: 8080
  - Memory: 1GiB to start
  - Concurrency: 80 (adjust)
  - Set `--allow-unauthenticated` or lock it down and use IAM or Clerk for application-level auth.

## Rollout strategy
- Feature-branch deploys to a staging Cloud Run service.
- Merge to `main` triggers production deploy.
- Use traffic splitting if using Cloud Run revisions for canary rollout.

## Checklist (files to add)
- `backend/Dockerfile`
- `Frontend/Dockerfile`
- `docker-compose.yml`
- `.github/workflows/ci-cd.yml`
- `README_DEPLOY_GCP.md` (deploy steps)
- Optional: `k8s/` manifests (if migrating to GKE)

## Timeline (suggested)
- Day 0–1: Add Dockerfiles, minimal docker-compose, and test locally.
- Day 1–2: Add GitHub Actions workflow, create GCP service account and Artifact Registry.
- Day 2–3: Deploy to Cloud Run staging, wire Secret Manager, run E2E tests.
- Day 3–4: Production rollout and monitoring.

## Notes
- Cloud Run request duration limit is 15 minutes; long pipeline runs may need Cloud Run Jobs, Cloud Tasks, or a background worker architecture.
- For small-scale usage, persisting indexes to GCS with a lightweight CPU worker is sufficient. For large scale, evaluate Matching Engine or managed vector DB.

