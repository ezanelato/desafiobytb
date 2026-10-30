CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    role TEXT NOT NULL CHECK (role IN ('customer', 'agent', 'admin')),
    title TEXT NOT NULL DEFAULT '',
    department TEXT NOT NULL DEFAULT '',
    password_salt TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tickets (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL REFERENCES users(id),
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('INC', 'REQ')),
    category TEXT NOT NULL,
    priority TEXT NOT NULL CHECK (priority IN ('Crítica', 'Alta', 'Média', 'Baixa')),
    status TEXT NOT NULL DEFAULT 'OPEN',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    due_at TIMESTAMPTZ NOT NULL,
    resolution_notes TEXT NOT NULL DEFAULT ''
);
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS resolution_notes TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS tickets_owner_updated_idx ON tickets(owner_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS tickets_status_due_idx ON tickets(status, due_at);
CREATE SEQUENCE IF NOT EXISTS ticket_identifier_seq START 21000;
SELECT setval(
    'ticket_identifier_seq',
    GREATEST(
        20999,
        COALESCE(
            (SELECT max(substring(id FROM '-([0-9]+)$')::BIGINT)
             FROM tickets
             WHERE id ~ '^(INC|REQ)-[0-9]+$'),
            20999
        )
    ),
    TRUE
);

CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL REFERENCES users(id),
    subject TEXT NOT NULL DEFAULT 'Novo atendimento',
    category TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL CHECK (status IN ('OPEN_AI', 'WAITING_ANALYST', 'IN_PROGRESS_HUMAN', 'CLOSED')),
    assignee_id TEXT REFERENCES users(id),
    priority TEXT NOT NULL DEFAULT '',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    message_count INTEGER NOT NULL DEFAULT 0,
    needs_attention BOOLEAN NOT NULL DEFAULT FALSE,
    resolution_owner TEXT NOT NULL DEFAULT '',
    handoff_summary TEXT NOT NULL DEFAULT '',
    ticket_id TEXT REFERENCES tickets(id)
);
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS handoff_summary TEXT NOT NULL DEFAULT '';
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS ticket_id TEXT REFERENCES tickets(id);
CREATE INDEX IF NOT EXISTS conversations_status_updated_idx ON conversations(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS conversations_owner_updated_idx ON conversations(owner_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS conversations_ticket_idx ON conversations(ticket_id) WHERE ticket_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'analyst')),
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    decisions JSONB NOT NULL DEFAULT '[]'::jsonb,
    options JSONB NOT NULL DEFAULT '[]'::jsonb,
    critical BOOLEAN NOT NULL DEFAULT FALSE,
    ticket_id TEXT REFERENCES tickets(id),
    draft_ticket_id TEXT
);
CREATE INDEX IF NOT EXISTS messages_conversation_created_idx ON messages(conversation_id, created_at);
UPDATE conversations c
SET ticket_id = linked.ticket_id
FROM (
    SELECT DISTINCT ON (conversation_id) conversation_id, ticket_id
    FROM messages
    WHERE ticket_id IS NOT NULL
    ORDER BY conversation_id, created_at DESC
) AS linked
WHERE c.id = linked.conversation_id AND c.ticket_id IS NULL;

CREATE TABLE IF NOT EXISTS ticket_drafts (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    owner_id TEXT NOT NULL REFERENCES users(id),
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    consumed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS knowledge_articles (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    category TEXT NOT NULL,
    excerpt TEXT NOT NULL,
    content TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS skills (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_events (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    actor_id TEXT NOT NULL,
    action TEXT NOT NULL,
    reason TEXT NOT NULL,
    confidence DOUBLE PRECISION NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_conversation_created_idx ON audit_events(conversation_id, created_at DESC);

CREATE TABLE IF NOT EXISTS model_usage (
    id TEXT PRIMARY KEY,
    usage_day DATE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS model_usage_day_idx ON model_usage(usage_day);
