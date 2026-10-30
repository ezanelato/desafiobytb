#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# ------ Carrega as variáveis locais sem incorporá-las ao frontend ------
if [[ -f "$ROOT_DIR/.env" ]]; then
  set -a
  source "$ROOT_DIR/.env"
  set +a
fi

export DATABASE_URL="${DATABASE_URL:-postgres://nexo:nexo@localhost:5432/nexo_assist?sslmode=disable}"
export PORT="${PORT:-8080}"
export GEMINI_MODEL="${GEMINI_MODEL:-gemini-3.5-flash-lite}"
export GEMINI_DAILY_LIMIT="${GEMINI_DAILY_LIMIT:-500}"
export AGENT_SERVICE_URL="${AGENT_SERVICE_URL:-http://127.0.0.1:4112/respond}"
export GOOGLE_API_KEY="${GOOGLE_API_KEY:-${GEMINI_API_KEY:-}}"

POSTGRES_APP_BIN="/Applications/Postgres.app/Contents/Versions/latest/bin"
if [[ -d "$POSTGRES_APP_BIN" ]]; then
  export PATH="$POSTGRES_APP_BIN:$PATH"
fi

if ! command -v pg_isready >/dev/null 2>&1; then
  printf '%s\n' "PostgreSQL não encontrado. Instale o Postgres.app e inicialize o servidor."
  exit 1
fi

if ! pg_isready -d "$DATABASE_URL" >/dev/null 2>&1; then
  printf '%s\n' "PostgreSQL não está pronto ou o banco nexo_assist não foi criado."
  printf '%s\n' "Confira as instruções de configuração local no README.md."
  exit 1
fi

# ------ Inicia API, agent Mastra e Vite como processos locais ------
(cd "$ROOT_DIR/backend" && go run .) &
BACKEND_PID=$!
(cd "$ROOT_DIR" && npm run dev --workspace agent) &
AGENT_PID=$!
(cd "$ROOT_DIR" && npm run dev --workspace frontend) &
FRONTEND_PID=$!

# ------ Encerra os processos filhos ao pressionar Ctrl+C ------
cleanup() {
  kill "$BACKEND_PID" "$AGENT_PID" "$FRONTEND_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

printf '%s\n' "Nexo Assist local: http://localhost:5173"
wait
