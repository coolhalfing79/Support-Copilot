-- Database initialization script for AI L2 Support Copilot
-- Requires: PostgreSQL 15+ with pgvector extension available in the image (e.g. pgvector/pgvector:pg15)

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";

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

-- Messages table (no updated_at — matches architecture entity)
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    confidence_score DOUBLE PRECISION,
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

-- Knowledge Sources table (updated_at required for trigger below)
CREATE TABLE IF NOT EXISTS knowledge_sources (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    url VARCHAR(500) UNIQUE NOT NULL,
    title VARCHAR(500),
    source_type VARCHAR(20) NOT NULL DEFAULT 'web_page' CHECK (source_type IN ('web_page', 'pdf', 'docx', 'markdown')),
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'indexed', 'error')),
    chunk_count INTEGER DEFAULT 0,
    max_pages INTEGER DEFAULT 200,
    last_indexed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Knowledge Chunks table (chunk_metadata avoids SQLAlchemy reserved name `metadata` in ORM)
CREATE TABLE IF NOT EXISTS knowledge_chunks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    source_id UUID NOT NULL REFERENCES knowledge_sources(id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL,
    content TEXT NOT NULL,
    embedding_vector VECTOR(768),
    chunk_metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_knowledge_chunks_source_chunk UNIQUE (source_id, chunk_index)
);

-- Metrics table (no updated_at — time axis is date + recorded_at)
CREATE TABLE IF NOT EXISTS metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    metric_type VARCHAR(50) NOT NULL CHECK (metric_type IN ('query_count', 'resolution_count', 'escalation_count', 'avg_confidence', 'avg_response_time')),
    date DATE NOT NULL,
    value NUMERIC(10, 4) NOT NULL,
    metadata JSONB,
    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages(session_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_severity ON tickets(severity);
CREATE INDEX IF NOT EXISTS idx_tickets_created_at ON tickets(created_at);
CREATE INDEX IF NOT EXISTS idx_knowledge_sources_status ON knowledge_sources(status);
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_source_id ON knowledge_chunks(source_id);
CREATE INDEX IF NOT EXISTS idx_metrics_date ON metrics(date);
CREATE INDEX IF NOT EXISTS idx_metrics_type ON metrics(metric_type);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);

-- updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop triggers if re-running init in dev (idempotent-ish)
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
DROP TRIGGER IF EXISTS update_sessions_updated_at ON sessions;
DROP TRIGGER IF EXISTS update_tickets_updated_at ON tickets;
DROP TRIGGER IF EXISTS update_knowledge_sources_updated_at ON knowledge_sources;

CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_sessions_updated_at
    BEFORE UPDATE ON sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tickets_updated_at
    BEFORE UPDATE ON tickets
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_knowledge_sources_updated_at
    BEFORE UPDATE ON knowledge_sources
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
