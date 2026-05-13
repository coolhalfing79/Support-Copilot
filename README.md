# Support-Copilot

Support-Copilot is an AI-driven support automation platform that leverages RAG (Retrieval-Augmented Generation) to assist support agents. It provides a chat interface for users and an administrative dashboard for ticket management and Jira integration.

---

## 🚀 Getting Started

You can set up the project either directly on your machine (**Bare Metal**) for the best development experience or using **Docker Compose** for a quick start.

### 📋 Prerequisites
- **Git**
- **Docker & Docker Compose**
- **Node.js 20+**
- **Python 3.11+**
- **Google Gemini API Key**

---

## 🛠 Option 1: Bare Metal Development (Recommended)

This setup allows for hot-reloading and a better debugging experience.

### 1. Start Infrastructure Services
We use Docker to run the database and vector store while keeping the app code on the host.
```bash
# Start only the required backing services
docker-compose up -d db chroma redis
```

### 2. Backend Setup
```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate  # Windows: .\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
cp .env.example .env       # Update with your Gemini & Jira keys
python scripts/create_tables.py
uvicorn main:app --reload
```

#### Backend `.env` Template
```env
DATABASE_URL="postgresql+asyncpg://postgres:postgres@localhost:5432/copilot"
GEMINI_API_KEY="your-gemini-api-key"
JIRA_URL="https://your-domain.atlassian.net"
JIRA_EMAIL="your-email@example.com"
JIRA_API_TOKEN="your-jira-api-token"
```

### 3. Frontend Setup
```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

#### Frontend `.env` Template
```env
VITE_API_BASE_URL="http://localhost:8000/api/v1"
VITE_WS_URL="ws://localhost:8000/api/v1/chat/ws"
```

---

## 🐳 Option 2: Docker Compose (Alternative)

Run the entire stack (including Backend and Frontend) in containers. Note: This may be slower for active development.

```bash
# Ensure .env files are created in /backend and /frontend first
docker-compose up --build
```
*The app will be available at: Frontend (http://localhost:8080), Backend (http://localhost:8000)*

---

## ⚙️ Manual Infrastructure Setup

If you prefer not to use `docker-compose` for the backing services, ensure the following are running on your machine:

1.  **PostgreSQL 16+** (with [pgvector](https://github.com/pgvector/pgvector) extension)
    -   Default: `localhost:5432`
2.  **Redis 7+**
    -   Default: `localhost:6379`
3.  **ChromaDB**
    -   Default: `localhost:8000` (or as configured in `CHROMA_HOST`)

---

## 🧪 Testing

### Backend
```bash
cd backend
pytest
```

### Frontend
```bash
cd frontend
npm test
```

## 📖 Documentation
- [Jira Integration Plan](plans/jira-integration.md)
- [Architecture Overview](plans/architecture.md)
- [Development Guidelines](GEMINI.md)
