# Multi-stage Dockerfile: build Vite frontend then run Python backend serving static files

# --- Builder: Node build for Frontend ---
FROM node:18-alpine AS builder
WORKDIR /app
COPY Frontend/package.json Frontend/package-lock.json* ./
COPY Frontend/yarn.lock* ./
RUN if [ -f package-lock.json ]; then npm ci --silent; else npm ci --silent; fi
COPY Frontend/ ./Frontend/
WORKDIR /app/Frontend
RUN npm run build --silent

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

# Copy built frontend assets into backend static folder
COPY --from=builder /app/Frontend/dist /app/Frontend/dist

ENV PYTHONUNBUFFERED=1
EXPOSE 8080

CMD ["uvicorn", "backend.app:app", "--host", "0.0.0.0", "--port", "8080", "--proxy-headers"]
