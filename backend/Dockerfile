FROM python:3.12-slim AS builder

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    FASTEMBED_CACHE_PATH=/app/fastembed_cache

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --upgrade pip \
    && pip install --prefix=/install --no-cache-dir -r requirements.txt

# Pre-download the embedding model to the cache path
RUN PYTHONPATH=/install/lib/python3.12/site-packages python3 -c "from fastembed import TextEmbedding; TextEmbedding(model_name='BAAI/bge-small-en-v1.5')"


FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/install/lib/python3.12/site-packages \
    FASTEMBED_CACHE_PATH=/app/fastembed_cache \
    DATABASE_URL=sqlite+aiosqlite:////app/data/app.db \
    CHROMA_PATH=/app/data/chroma

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /install /install
COPY --from=builder /app/fastembed_cache /app/fastembed_cache

COPY . .

RUN adduser --disabled-password --gecos "" appuser && \
    mkdir -p /app/data/chroma && \
    chown -R appuser:appuser /app/fastembed_cache /app/data

VOLUME ["/app/data"]

USER appuser

EXPOSE 8000

CMD ["python", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
