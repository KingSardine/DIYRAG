# Multi-stage Dockerfile: build Vite frontend then run Python backend serving static files

# --- Builder: Node build for Frontend ---
FROM node:22-alpine AS builder
ARG VITE_CLERK_PUBLISHABLE_KEY
WORKDIR /app
COPY Frontend/package.json Frontend/package-lock.json* Frontend/yarn.lock* ./
RUN if [ -f package-lock.json ]; then \
            npm ci --silent; \
        else \
            npm install --silent; \
        fi
COPY Frontend/ ./Frontend/
WORKDIR /app/Frontend
# Provide the build arg to the single RUN invocation so the value is NOT persisted as an image ENV layer.
RUN VITE_CLERK_PUBLISHABLE_KEY=${VITE_CLERK_PUBLISHABLE_KEY} npm run build --silent

# --- Runtime: Python backend ---
FROM python:3.11-slim
WORKDIR /app
# Install system deps for common libraries
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    gcc \
    libmagic1 \
    && rm -rf /var/lib/apt/lists/*

# Install Python deps
COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

# Copy backend code
COPY backend /app/backend
COPY run.py /app/run.py
COPY config.py /app/config.py
COPY config.yaml /app/config.yaml

# Runtime answer-generation module and local PDF corpus used by the configured pipeline.
COPY Generation /app/Generation
COPY ingestables /app/ingestables

# Copy library packages required by the backend so top-level imports (e.g. `from Ingestion...`) work
COPY Ingestion /app/Ingestion
COPY Chunking /app/Chunking
COPY Embedding /app/Embedding
COPY PreProcessing /app/PreProcessing
COPY Retrieval /app/Retrieval
COPY VectorDB /app/VectorDB

# Copy built frontend assets into backend static folder
COPY --from=builder /app/Frontend/dist /app/Frontend/dist

ENV PYTHONUNBUFFERED=1
EXPOSE 8080

CMD ["uvicorn", "backend.app:app", "--host", "0.0.0.0", "--port", "8080", "--proxy-headers"]