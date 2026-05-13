# Person 8 — DevOps & Infrastructure

## Role: DevOps Engineer (Infrastructure Lead)

---

## Task Overview

Set up the complete infrastructure for the application including Docker Compose orchestration, container images, database initialization scripts, Nginx configuration, environment management, and deployment documentation. This person ensures the entire system can be started with a single command and runs smoothly.

**Priority:** CRITICAL — Enables all other team members to work
**Start Time:** Hour 0 (immediate — minimal dependencies)
**Primary Completion Target:** Hours 2-4

---

## Tech Stack

| Component | Technology | Version |
|-----------|-----------|---------|
| Containerization | Docker + Docker Compose | 24+ / 2.27+ |
| Reverse Proxy | Nginx | 1.25+ |
| Database | PostgreSQL | 15.x |
| Cache | Redis | 7.x |
| Vector DB | ChromaDB | 0.4.x |
| Monitoring | Docker health checks | — |

---

## Detailed Task Breakdown

### 8.1 Directory Structure

```
infra/
├── docker-compose.yml           # Service orchestration
├── Dockerfile.backend            # Backend container
├── Dockerfile.frontend           # Frontend container
├── nginx/
│   └── nginx.conf                # Reverse proxy configuration
├── scripts/
│   ├── init_db.sql               # Database initialization
│   └── seed_data.sql             # Demo seed data
├── .env.example                  # Environment template
└── README.md                     # Infrastructure documentation
```

### 8.2 Docker Compose Orchestration

**File:** `infra/docker-compose.yml`

```yaml
version: '3.8'

services:
  # ==========================================
  # Frontend
  # ==========================================
  frontend:
    build:
      context: ../frontend
      dockerfile: ../infra/Dockerfile.frontend
    ports:
      - "3000:80"
    depends_on:
      backend:
        condition: service_healthy
    networks:
      - copilot-network
    restart: unless-stopped

  # ==========================================
  # Backend API
  # ==========================================
  backend:
    build:
      context: ../backend
      dockerfile: ../infra/Dockerfile.backend
    ports:
      - "8000:8000"
    environment:
      - APP_NAME=AI L2 Support Copilot
      - DEBUG=true
      - DATABASE_URL=postgresql+asyncpg://postgres:postgres@db:5432/copilot
      - REDIS_URL=redis://redis:6379/0
      - GEMINI_API_KEY=${GEMINI_API_KEY}
      - GEMINI_MODEL=gemini-2.0-flash
      - GEMINI_EMBEDDING_MODEL=text-embedding-004
      - JIRA_URL=${JIRA_URL:-}
      - JIRA_EMAIL=${JIRA_EMAIL:-}
      - JIRA_API_TOKEN=${JIRA_API_TOKEN:-}
      - JIRA_PROJECT_KEY=${JIRA_PROJECT_KEY:-SUP}
      - CHROMA_HOST=chromadb
      - CHROMA_PORT=8000
      - CHROMA_COLLECTION=knowledge_chunks
      - CORS_ORIGINS=["http://localhost:3000","http://localhost:8000"]
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_healthy
      chromadb:
        condition: service_started
    volumes:
      - backend-data:/app/data
    networks:
      - copilot-network
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
    restart: unless-stopped

  # ==========================================
  # PostgreSQL Database
  # ==========================================
  db:
    image: postgres:15-alpine
    ports:
      - "5432:5432"
    environment:
      - POSTGRES_USER=postgres
      - POSTGRES_PASSWORD=postgres
      - POSTGRES_DB=copilot
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./scripts/init_db.sql:/docker-entrypoint-initdb.d/01-init.sql
    networks:
      - copilot-network
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped

  # ==========================================
  # Redis Cache
  # ==========================================
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis-data:/data
    networks:
      - copilot-network
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped

  # ==========================================
  # ChromaDB Vector Database
  # ==========================================
  chromadb:
    image: chromadb/chroma:0.4.24
    ports:
      - "8001:8000"
    volumes:
      - chroma-data:/chroma/chroma
    networks:
      - copilot-network
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/api/v1/heartbeat"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 30s
    restart: unless-stopped

volumes:
  pgdata:
    driver: local
  redis-data:
    driver: local
  chroma-data:
    driver: local
  backend-data:
    driver: local

networks:
  copilot-network:
    driver: bridge
```

### 8.3 Backend Dockerfile

**File:** `infra/Dockerfile.backend`

```dockerfile
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for better caching
COPY ../backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY ../backend/ .

# Create data directory
RUN mkdir -p /app/data

# Expose port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# Run the application
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

### 8.4 Frontend Dockerfile

**File:** `infra/Dockerfile.frontend`

```dockerfile
# Build stage
FROM node:20-alpine AS build

WORKDIR /app

# Copy package files
COPY ../frontend/package.json ../frontend/package-lock.json* ./
RUN npm ci

# Copy source code
COPY ../frontend/ .

# Build the application
RUN npm run build

# Production stage
FROM nginx:alpine

# Copy built files
COPY --from=build /app/dist /usr/share/nginx/html

# Copy nginx configuration
COPY ./nginx/nginx.conf /etc/nginx/conf.d/default.conf

# Expose port
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
    CMD wget -qO- http://localhost:80/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
```

### 8.5 Nginx Configuration

**File:** `infra/nginx/nginx.conf`

```nginx
server {
    listen 80;
    server_name localhost;
    
    # Root directory for frontend
    root /usr/share/nginx/html;
    index index.html;
    
    # SPA routing - handle React Router
    location / {
        try_files $uri $uri/ /index.html;
    }
    
    # Proxy API requests to backend
    location /api/ {
        proxy_pass http://backend:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # WebSocket support
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        
        # Timeouts for streaming
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }
    
    # Static assets caching
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
    
    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;
}
```

### 8.6 Database Initialization Script

**File:** `infra/scripts/init_db.sql`

```sql
-- Database initialization for AI L2 Support Copilot
-- This script is run automatically on first container start

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(100) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'agent' CHECK (role IN ('agent', 'manager', 'admin')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Sessions table
CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255),
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'resolved', 'escalated')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Messages table
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    confidence_score FLOAT,
    sources JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Tickets table
CREATE TABLE IF NOT EXISTS tickets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    jira_issue_key VARCHAR(50),
    jira_issue_id VARCHAR(100),
    session_id UUID REFERENCES sessions(id) ON DELETE SET NULL,
    summary TEXT NOT NULL,
    description TEXT,
    severity VARCHAR(20) NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
    product_module VARCHAR(255),
    environment TEXT,
    error_messages TEXT,
    steps_to_reproduce TEXT,
    troubleshooting_attempted TEXT,
    conversation_summary TEXT,
    doc_references JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Knowledge Sources table
CREATE TABLE IF NOT EXISTS knowledge_sources (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    url VARCHAR(500) UNIQUE NOT NULL,
    title VARCHAR(500),
    source_type VARCHAR(20) NOT NULL DEFAULT 'web_page' CHECK (source_type IN ('web_page', 'pdf', 'docx', 'markdown')),
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'indexed', 'error')),
    chunk_count INTEGER DEFAULT 0,
    last_indexed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Knowledge Chunks table
CREATE TABLE IF NOT EXISTS knowledge_chunks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    source_id UUID NOT NULL REFERENCES knowledge_sources(id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL,
    content TEXT NOT NULL,
    embedding_vector VECTOR(768),
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Metrics table
CREATE TABLE IF NOT EXISTS metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    metric_type VARCHAR(50) NOT NULL CHECK (metric_type IN ('query_count', 'resolution_count', 'escalation_count', 'avg_confidence', 'avg_response_time')),
    date DATE NOT NULL,
    value INTEGER NOT NULL,
    metadata JSONB,
    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX idx_messages_session_id ON messages(session_id);
CREATE INDEX idx_messages_created_at ON messages(created_at);
CREATE INDEX idx_tickets_status ON tickets(status);
CREATE INDEX idx_tickets_severity ON tickets(severity);
CREATE INDEX idx_tickets_created_at ON tickets(created_at);
CREATE INDEX idx_knowledge_sources_status ON knowledge_sources(status);
CREATE INDEX idx_knowledge_chunks_source_id ON knowledge_chunks(source_id);
CREATE INDEX idx_metrics_date ON metrics(date);
CREATE INDEX idx_metrics_type ON metrics(metric_type);
CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_status ON sessions(status);

-- Updated at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply triggers
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_sessions_updated_at BEFORE UPDATE ON sessions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_tickets_updated_at BEFORE UPDATE ON tickets FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_knowledge_sources_updated_at BEFORE UPDATE ON knowledge_sources FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

### 8.7 Demo Seed Data

**File:** `infra/scripts/seed_data.sql`

```sql
-- Demo seed data for AI L2 Support Copilot
-- Run this after init_db.sql to populate demo data

-- Insert demo user
INSERT INTO users (username, email, password_hash, role)
VALUES ('demo-admin', 'admin@example.com', 'not-a-real-hash', 'admin')
ON CONFLICT (username) DO NOTHING;

-- Insert demo sessions
INSERT INTO sessions (user_id, title, status)
SELECT id, 'Payment Gateway Issues', 'active' FROM users WHERE username = 'demo-admin'
ON CONFLICT DO NOTHING;

-- Insert demo messages
INSERT INTO messages (session_id, role, content, confidence_score)
SELECT 
    s.id,
    m.role,
    m.content,
    m.confidence_score
FROM sessions s
CROSS JOIN (
    VALUES 
        ('user', 'How do I fix ERR_TIMEOUT in PaymentGateway?'),
        ('assistant', 'Based on the documentation, ERR_TIMEOUT occurs when the payment processor does not respond within 30 seconds. Try increasing the timeout value in your configuration.', 0.85),
        ('user', 'Where is the configuration file located?'),
        ('assistant', 'The configuration file is typically located at /etc/payment-gateway/config.yaml. Look for the timeout_seconds setting.', 0.78)
) AS m(role, content, confidence_score)
WHERE s.user_id = (SELECT id FROM users WHERE username = 'demo-admin')
ON CONFLICT DO NOTHING;

-- Insert demo knowledge sources
INSERT INTO knowledge_sources (url, title, source_type, status, chunk_count)
VALUES 
    ('https://docs.example.com/payment-gateway/troubleshooting', 'PaymentGateway Troubleshooting Guide', 'web_page', 'indexed', 15),
    ('https://docs.example.com/user-authentication', 'User Authentication Setup', 'web_page', 'indexed', 10),
    ('https://docs.example.com/database-migration', 'Database Migration Guide', 'web_page', 'processing', 0)
ON CONFLICT (url) DO NOTHING;

-- Insert demo tickets
INSERT INTO tickets (
    jira_issue_key, 
    summary, 
    description, 
    severity, 
    status, 
    product_module,
    environment,
    error_messages
)
VALUES 
    ('SUP-001', 'PaymentGateway ERR_TIMEOUT in production', 'Users reporting timeout errors during peak hours', 'high', 'open', 'PaymentGateway', 'production', 'ERR_TIMEOUT: Connection timed out after 30s'),
    ('SUP-002', 'Authentication failure for SSO users', 'SSO login failing for users from specific domains', 'medium', 'in_progress', 'Authentication', 'staging', 'ERR_SSO_TOKEN_EXPIRED'),
    ('SUP-003', 'Database connection pool exhaustion', 'Connection pool reaching maximum during load testing', 'critical', 'resolved', 'Database', 'staging', 'ERR_POOL_EXHAUSTED'),
    ('SUP-004', 'API rate limiting too aggressive', 'Legitimate requests being rate limited', 'low', 'closed', 'API Gateway', 'production', 'ERR_RATE_LIMIT')
ON CONFLICT DO NOTHING;

-- Insert demo metrics
INSERT INTO metrics (metric_type, date, value)
SELECT metric_type, CURRENT_DATE - INTERVAL '1 day' * generate_series(0, 6), value
FROM (
    VALUES 
        ('query_count', 42),
        ('query_count', 38),
        ('query_count', 55),
        ('query_count', 47),
        ('query_count', 62),
        ('query_count', 51),
        ('query_count', 45),
        ('resolution_count', 35),
        ('resolution_count', 30),
        ('resolution_count', 48),
        ('resolution_count', 40),
        ('resolution_count', 52),
        ('resolution_count', 43),
        ('resolution_count', 38)
) AS metrics(metric_type, value)
ON CONFLICT DO NOTHING;
```

### 8.8 Environment Template

**File:** `infra/.env.example`

```env
# ==========================================
# AI L2 Support Copilot - Environment Variables
# ==========================================

# Gemini API (Required)
# Get your API key from: https://aistudio.google.com/app/apikey
GEMINI_API_KEY=your_gemini_api_key_here

# Gemini Model Configuration
GEMINI_MODEL=gemini-2.0-flash
GEMINI_EMBEDDING_MODEL=text-embedding-004

# Jira Configuration (Optional - mock mode if not set)
JIRA_URL=https://your-domain.atlassian.net
JIRA_EMAIL=your-email@example.com
JIRA_API_TOKEN=your-jira-api-token
JIRA_PROJECT_KEY=SUP

# Application Settings
APP_NAME=AI L2 Support Copilot
DEBUG=true

# Database
DATABASE_URL=postgresql+asyncpg://postgres:postgres@db:5432/copilot

# Redis
REDIS_URL=redis://redis:6379/0

# ChromaDB
CHROMA_HOST=chromadb
CHROMA_PORT=8000
CHROMA_COLLECTION=knowledge_chunks

# CORS
CORS_ORIGINS=["http://localhost:3000","http://localhost:8000"]
```

### 8.9 Docker Compose Commands Reference

```bash
# ==========================================
# Quick Start Commands
# ==========================================

# Start all services
docker-compose -f infra/docker-compose.yml up -d

# Start with backend rebuild
docker-compose -f infra/docker-compose.yml up -d --build backend

# Stop all services
docker-compose -f infra/docker-compose.yml down

# Stop and remove volumes (WARNING: deletes all data)
docker-compose -f infra/docker-compose.yml down -v

# View logs
docker-compose -f infra/docker-compose.yml logs -f backend
docker-compose -f infra/docker-compose.yml logs -f frontend

# View specific service logs
docker-compose -f infra/docker-compose.yml logs -f db

# ==========================================
# Database Commands
# ==========================================

# Access PostgreSQL shell
docker-compose -f infra/docker-compose.yml exec db psql -U postgres -d copilot

# Run seed data
docker-compose -f infra/docker-compose.yml exec db psql -U postgres -d copilot -f /docker-entrypoint-initdb.d/02-seed.sql

# ==========================================
# Backend Commands
# ==========================================

# Access backend container shell
docker-compose -f infra/docker-compose.yml exec backend sh

# Run backend tests in container
docker-compose -f infra/docker-compose.yml exec backend pytest

# ==========================================
# Maintenance
# ==========================================

# Check service status
docker-compose -f infra/docker-compose.yml ps

# Restart a specific service
docker-compose -f infra/docker-compose.yml restart backend

# View resource usage
docker stats

# Clean up unused images
docker image prune -a
```

### 8.10 Infrastructure README

**File:** `infra/README.md`

```markdown
# AI L2 Support Copilot - Infrastructure

## Quick Start

1. Copy the environment template:
   ```bash
   cp infra/.env.example .env
   ```

2. Edit `.env` and add your Gemini API key:
   ```
   GEMINI_API_KEY=your_api_key_here
   ```

3. Start all services:
   ```bash
   docker-compose -f infra/docker-compose.yml up -d
   ```

4. Access the application:
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:8000
   - API Docs: http://localhost:8000/docs
   - Admin View: http://localhost:3000/admin
   - User View: http://localhost:3000/user

## Services

| Service | Port | Description |
|---------|------|-------------|
| Frontend | 3000 | React SPA served by Nginx |
| Backend | 8000 | FastAPI REST + WebSocket API |
| PostgreSQL | 5432 | Primary database |
| Redis | 6379 | Session cache |
| ChromaDB | 8001 | Vector database |

## Development

### Local Development (without Docker)

1. Start infrastructure services:
   ```bash
   docker-compose -f infra/docker-compose.yml up -d db redis chromadb
   ```

2. Install backend dependencies:
   ```bash
   cd backend && pip install -r requirements.txt
   ```

3. Run backend:
   ```bash
   cd backend && uvicorn main:app --reload --port 8000
   ```

4. Install frontend dependencies:
   ```bash
   cd frontend && npm install
   ```

5. Run frontend:
   ```bash
   cd frontend && npm run dev
   ```

### Running Tests

```bash
# Backend tests
docker-compose -f infra/docker-compose.yml exec backend pytest

# Frontend tests
cd frontend && npm run test
```

## Demo Data

Seed data is automatically loaded on first run. To reload:

```bash
docker-compose -f infra/docker-compose.yml exec db psql -U postgres -d copilot -f /docker-entrypoint-initdb.d/02-seed.sql
```

## Troubleshooting

### Backend won't start
- Check that PostgreSQL is running: `docker-compose ps db`
- Verify database connection: `docker-compose exec db pg_isready`

### Frontend shows 404
- Ensure backend is running: `docker-compose ps backend`
- Check Nginx config: `docker-compose exec frontend cat /etc/nginx/conf.d/default.conf`

### ChromaDB connection failed
- Wait for ChromaDB to initialize (takes ~30 seconds)
- Check logs: `docker-compose logs chromadb`
```

### 8.11 Health Check Endpoints

Ensure the backend `/health` endpoint is working. Person 1 should have already created this in `main.py`:

```python
@app.get("/health")
async def health_check():
    return {"status": "healthy", "version": "1.0.0"}
```

### 8.12 Docker Compose Extensions

**File:** `docker-compose.dev.yml` (optional development override)

```yaml
version: '3.8'

services:
  backend:
    volumes:
      - ../backend:/app
    command: uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

---

## Acceptance Criteria

- [ ] `docker-compose up -d` starts all 5 services successfully
- [ ] All services pass health checks
- [ ] Frontend is accessible at localhost:3000
- [ ] Backend API is accessible at localhost:8000
- [ ] Swagger docs at localhost:8000/docs work
- [ ] Database is initialized with all tables
- [ ] Seed data is loaded on first run
- [ ] Nginx correctly proxies API requests to backend
- [ ] WebSocket connections work through Nginx
- [ ] `.env.example` has all required variables documented
- [ ] `README.md` has complete setup instructions

---

## Dependencies

| Dependency | Owner | Status |
|------------|-------|--------|
| None | — | Can start immediately |

## Deliverables To

| Recipient | What They Get |
|-----------|--------------|
| Everyone | Running infrastructure, container setup |
| Person 1 | Database init scripts |
| Person 2 | ChromaDB running |
| Person 5, 6 | Frontend serving correctly |

---

## Tips for AI-Assisted Implementation

1. Start with `docker-compose.yml` — this is the foundation
2. Test each service individually before combining
3. Use Alpine-based images for smaller size
4. Add health checks for all services
5. The seed data script is critical for demo day
6. Document everything — the team will rely on your setup
7. Test the full startup sequence multiple times
8. Keep the Dockerfiles simple — avoid unnecessary complexity
