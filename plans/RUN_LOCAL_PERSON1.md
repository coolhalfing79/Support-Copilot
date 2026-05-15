# Person 1 Local Run Guide (No DevOps Setup)

This guide lets anyone clone the repo and run the Person 1 backend foundation locally on Windows, then open:

- `http://localhost:8000/health`
- `http://localhost:8000/docs`

## Prerequisites

- Windows 10/11
- Docker Desktop (running)
- Python 3.12 (recommended for this repo)

## 1) Clone and move to project

```powershell
git clone <your-repo-url> D:\SemiColon2026
cd D:\SemiColon2026
```

## 2) Start PostgreSQL + pgvector in Docker

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

Check readiness:

```powershell
docker exec copilot-pgvector pg_isready -U postgres -d copilot
```

If not ready, wait a few seconds and run again.

## 3) Apply DB schema (and optional seed)

```powershell
Get-Content "D:\SemiColon2026\infra\scripts\init_db.sql" -Raw | docker exec -i copilot-pgvector psql -U postgres -d copilot
Get-Content "D:\SemiColon2026\infra\scripts\seed_data.sql" -Raw | docker exec -i copilot-pgvector psql -U postgres -d copilot
```

## 4) Create Python venv with 3.12

```powershell
cd D:\SemiColon2026\backend
Remove-Item -Recurse -Force .venv -ErrorAction SilentlyContinue
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -V
```

Expected output: `Python 3.12.x`

## 5) Install dependencies (Person 1 scope)

```powershell
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -r requirements-person1.txt
```

## 6) Configure environment

```powershell
Copy-Item .env.example .env -Force
```

Make sure `.env` contains:

```env
DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/copilot
```

## 7) Run tests

```powershell
.\.venv\Scripts\python.exe -m pytest -q
```

## 8) Start backend

```powershell
.\.venv\Scripts\python.exe -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

Now open:

- `http://localhost:8000/health`
- `http://localhost:8000/docs`

---

## Troubleshooting

- **Docker error `pipe/docker_engine` not found**  
  Start Docker Desktop and wait until engine is running.

- **Python/pydantic build issues on 3.13**  
  Recreate venv with `py -3.12` and install `requirements-person1.txt`.

- **Port 5432 already in use**  
  Stop local PostgreSQL service or remap Docker port and update `DATABASE_URL`.
