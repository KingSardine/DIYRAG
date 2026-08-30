# Deploying DiyRAG to Google Cloud Run — Notes

When deploying this project to Cloud Run, please use the following flags to ensure correct behavior for the in-memory job store and runtime sizing:

- `--max-instances 1` — REQUIRED for the current in-memory job store; the background job state is stored in-process and will not be shared across instances. If you need autoscaling or multiple instances, replace the in-memory job store with a centralized store (Redis, Cloud SQL, or Cloud Memorystore) before changing this flag.
- `--memory 2Gi` — Recommended starting memory; adjust based on observed usage and embedding/model memory requirements.
- `--min-instances 0` (or `1` if you prefer instant warm start) — keep at 0 to save costs, or 1 for lower latency.
- `--concurrency 80` — reasonable default for small workloads; tune based on CPU and latency characteristics.

Example deploy command:

```bash
gcloud run deploy diyrag \
  --source . \
  --region us-central1 \
  --port 8080 \
  --allow-unauthenticated \
  --set-secrets CLERK_SECRET_KEY=CLERK_SECRET_KEY:latest,OPENAI_API_KEY=OPENAI_API_KEY:latest \
  --memory 2Gi \
  --max-instances 1 \
  --min-instances 0 \
  --concurrency 80
```

Notes:
- The current implementation uses an in-memory job store with TTL-based eviction for jobs older than 1 hour. This is fine for small demos or single-instance services, but not suitable for horizontally scaled production.
- For robust background processing, consider Cloud Run Jobs, Pub/Sub + subscriber workers, or a Redis-backed job store.

