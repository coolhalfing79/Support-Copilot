# Support-Copilot

Support-Copilot is an AI-driven support automation platform that leverages RAG (Retrieval-Augmented Generation) to assist support agents. It provides a chat interface for users and an administrative dashboard for ticket management and Jira integration.

## 🚀 Quick Start

Follow the steps below for your operating system to set up the development environment.

### 📋 Prerequisites
- **Git**
- **Docker & Docker Compose**
- **Node.js 20+**
- **Python 3.11+**
- **Jira Cloud Account** (for integration testing)
- **Google Gemini API Key**

---

### 💻 macOS / Linux Setup

Copy and paste the following into your terminal:

```bash
# 1. Clone the repository
git clone https://github.com/your-repo/Support-Copilot.git
cd Support-Copilot

# 2. Setup Backend
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env # Update .env with your Gemini & Jira keys

# 3. Setup Frontend
cd ../frontend
npm install
cp .env.example .env

# 4. Start Infrastructure (PostgreSQL & ChromaDB)
cd ..
docker-compose up -d

# 5. Initialize Database
cd backend
source .venv/bin/activate
python scripts/create_tables.py
```

### 🪟 Windows Setup (PowerShell)

Copy and paste the following into your PowerShell:

```powershell
# 1. Clone the repository
git clone https://github.com/your-repo/Support-Copilot.git
cd Support-Copilot

# 2. Setup Backend
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env # Update .env with your Gemini & Jira keys

# 3. Setup Frontend
cd ..\frontend
npm install
copy .env.example .env

# 4. Start Infrastructure (PostgreSQL & ChromaDB)
cd ..
docker-compose up -d

# 5. Initialize Database
cd backend
.\.venv\Scripts\Activate.ps1
python scripts\create_tables.py
```

---

## 🛠 Running the Application

### Backend
From the `backend` directory with the virtual environment active:
```bash
uvicorn main:app --reload
```

### Frontend
From the `frontend` directory:
```bash
npm run dev
```

### Infrastructure
Use Docker Compose to manage the database and vector store:
```bash
docker-compose up -d  # Start
docker-compose down   # Stop
```

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
