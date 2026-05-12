# Person 2 Local Test Guide (with Person 1 base)

This validates Person 1 + Person 2 together on Windows.

## Target checks

- Person 1 API:
  - `http://localhost:8000/health`
  - `http://localhost:8000/docs`
- Person 2 AI pipeline:
  - RAG add/search/process works
  - Chroma + Gemini integration works

---

## 1) Prerequisites

- Docker Desktop running
- Python 3.12
- Repo cloned at `C:\Users\shrey\Desktop\semi\Support-Copilot`

---

## 2) Start databases

### PostgreSQL + pgvector

```powershell
docker pull pgvector/pgvector:pg15
docker rm -f copilot-pgvector 2>$null
docker run -d --name copilot-pgvector `
  -e POSTGRES_USER=postgres `
  -e POSTGRES_PASSWORD=postgres `
  -e POSTGRES_DB=copilot `
  -p 5432:5432 `
  pgvector/pgvector:pg15
```

Apply schema + seed:

```powershell
Get-Content "C:\Users\shrey\Desktop\semi\Support-Copilot\infra\scripts\init_db.sql" -Raw | docker exec -i copilot-pgvector psql -U postgres -d copilot
Get-Content "C:\Users\shrey\Desktop\semi\Support-Copilot\infra\scripts\seed_data.sql" -Raw | docker exec -i copilot-pgvector psql -U postgres -d copilot
```

### ChromaDB

```powershell
docker pull chromadb/chroma
docker rm -f copilot-chroma 2>$null
docker run -d --name copilot-chroma -p 8001:8000 chromadb/chroma
```

---

## 3) Python environment

```powershell
cd C:\Users\shrey\Desktop\semi\Support-Copilot\backend
Remove-Item -Recurse -Force .venv -ErrorAction SilentlyContinue
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
```

Install Person 1 base deps:

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements-person1.txt
```

Install Person 2 deps:

```powershell
.\.venv\Scripts\python.exe -m pip install tenacity chromadb langchain==0.1.9 langchain-core==0.1.53 langchain-community==0.0.21 langchain-google-genai==0.0.6 google-generativeai==0.3.2 google-genai
```

---

## 4) Configure environment

```powershell
Copy-Item .env.example .env -Force
```

Edit `C:\Users\shrey\Desktop\semi\Support-Copilot\backend\.env` and ensure:

```env
DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/copilot
CHROMA_HOST=localhost
CHROMA_PORT=8001
CHROMA_COLLECTION=knowledge_chunks
GEMINI_API_KEY=your_real_key_here
GEMINI_MODEL=gemini-2.0-flash
GEMINI_EMBEDDING_MODEL=gemini-embedding-001
```

---

## 5) Run tests

```powershell
.\.venv\Scripts\python.exe -m pytest -q
```

Expected: tests pass (includes Person 2 smoke tests).

---

## 6) Run backend and verify Person 1 endpoints

```powershell
.\.venv\Scripts\python.exe -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

Open:

- `http://localhost:8000/health`
- `http://localhost:8000/docs`

---

## 7) Run Person 2 real end-to-end smoke

In another terminal (current directory **must** be `backend` so `.env` loads):

```powershell
cd C:\Users\shrey\Desktop\semi\Support-Copilot\backend
.\.venv\Scripts\python.exe scripts\person2_e2e_smoke.py
```

Or run as a module (same `cd`, avoids import-path surprises):

```powershell
cd C:\Users\shrey\Desktop\semi\Support-Copilot\backend
.\.venv\Scripts\python.exe -m scripts.person2_e2e_smoke
```

Expected final line:

`Person2 e2e smoke: PASS`

If Gemini text generation quota is exhausted but embeddings/search are working, run the retrieval-only smoke:

```powershell
$env:PERSON2_SKIP_LLM="1"
.\.venv\Scripts\python.exe -m scripts.person2_e2e_smoke
Remove-Item Env:\PERSON2_SKIP_LLM
```

Expected final line:

`Person2 retrieval smoke: PASS`

---

## Troubleshooting

- **`GEMINI_API_KEY missing`**  
  Set it in `.env`.

- **Chroma connection fails**  
  Check `docker ps` and ensure `copilot-chroma` is running on `8001`.

- **Gemini `429 ResourceExhausted` on `generate_content_free_tier_requests`**  
  Embeddings and Chroma can still be valid. Check the project's active Gemini rate limits in Google AI Studio, wait for quota reset, switch `GEMINI_MODEL` to a model with available quota, or enable billing/upgrade the project. Use `PERSON2_SKIP_LLM=1` to verify retrieval-only behavior while quota is blocked.

- **Postgres errors**  
  Re-run init SQL; ensure container name is `copilot-pgvector`.

- **Dependency conflicts**  
  Recreate `.venv` with Python 3.12 and re-run install commands.
