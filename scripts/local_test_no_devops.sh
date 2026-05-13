#!/usr/bin/env bash
# local_test_no_devops.sh — macOS setup script equivalent of the PowerShell version
set -euo pipefail

# ── Flags ────────────────────────────────────────────────────────────────────
START_SERVER=false
SKIP_SEED=false
FORCE_RECREATE_VENV=false

for arg in "$@"; do
    case $arg in
        --start-server)      START_SERVER=true ;;
        --skip-seed)         SKIP_SEED=true ;;
        --force-recreate-venv) FORCE_RECREATE_VENV=true ;;
        *) echo "Unknown argument: $arg"; exit 1 ;;
    esac
done

# ── Helpers ──────────────────────────────────────────────────────────────────
step()    { echo ""; echo "==> $*"; }
success() { echo "$*"; }
die()     { echo "ERROR: $*" >&2; exit 1; }

require_command() {
    local name="$1" hint="$2"
    command -v "$name" &>/dev/null || die "Required command '$name' not found. $hint"
}

# ── Resolve docker (handles Docker Desktop on macOS) ─────────────────────────
resolve_docker() {
    if command -v docker &>/dev/null; then
        echo "docker"
        return
    fi
    for candidate in \
        "/Applications/Docker.app/Contents/Resources/bin/docker" \
        "$HOME/.docker/bin/docker"; do
        [[ -x "$candidate" ]] && { echo "$candidate"; return; }
    done
    echo ""
}

# ── Ensure Homebrew ───────────────────────────────────────────────────────────
ensure_homebrew() {
    if ! command -v brew &>/dev/null; then
        step "Installing Homebrew"
        /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
        # Add brew to PATH for Apple Silicon
        if [[ -x /opt/homebrew/bin/brew ]]; then
            eval "$(/opt/homebrew/bin/brew shellenv)"
        fi
    fi
}

# ── Ensure a tool is installed via Homebrew ───────────────────────────────────
ensure_installed_brew() {
    local cmd="$1" formula="$2" display="$3"
    if command -v "$cmd" &>/dev/null; then
        success "$display already installed."
        return
    fi
    ensure_homebrew
    step "Installing $display"
    brew install "$formula"
    command -v "$cmd" &>/dev/null || \
        die "$display installed but '$cmd' still unavailable. Open a new terminal and re-run."
}

# ── Ensure Docker Desktop is running ─────────────────────────────────────────
ensure_docker_running() {
    step "Checking Docker daemon"
    local docker_exe
    docker_exe="$(resolve_docker)"
    [[ -n "$docker_exe" ]] || die "Docker CLI not found. Install Docker Desktop from https://www.docker.com/products/docker-desktop/"

    if "$docker_exe" info &>/dev/null; then
        success "Docker daemon is running."
        return
    fi

    step "Starting Docker Desktop"
    open -a Docker 2>/dev/null || die "Could not start Docker Desktop. Start it manually and re-run."

    local deadline=$(( $(date +%s) + 120 ))
    while (( $(date +%s) < deadline )); do
        sleep 3
        if "$docker_exe" info &>/dev/null; then
            success "Docker daemon is running."
            return
        fi
    done
    die "Docker daemon not ready after 120s. Open Docker Desktop and re-run."
}

# ── Wait for PostgreSQL readiness ─────────────────────────────────────────────
wait_for_postgres() {
    local container="$1" timeout_sec="$2"
    step "Waiting for PostgreSQL readiness"
    local docker_exe
    docker_exe="$(resolve_docker)"
    local deadline=$(( $(date +%s) + timeout_sec ))
    while (( $(date +%s) < deadline )); do
        if "$docker_exe" exec "$container" pg_isready -U postgres -d copilot &>/dev/null; then
            success "PostgreSQL is ready."
            return
        fi
        sleep 2
    done
    die "Timed out waiting for PostgreSQL container readiness."
}

# ── Find a compatible Python (3.11 or 3.12) ───────────────────────────────────
ensure_python_compatible() {
    # All output except the final "echo $candidate" must go to stderr,
    # because this function is called as PYTHON_CMD="$(ensure_python_compatible)"
    for candidate in python3.12 python3.11 python3 python; do
        if command -v "$candidate" &>/dev/null; then
            local ver
            ver=$("$candidate" -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')" 2>/dev/null) || continue
            local major minor
            major="${ver%%.*}"; minor="${ver##*.}"
            if [[ "$major" == "3" ]] && (( minor >= 11 && minor <= 12 )); then
                echo "Using Python $ver via $candidate." >&2
                echo "$candidate"   # ← only this reaches PYTHON_CMD
                return 0
            fi
        fi
    done

    # Try installing via Homebrew — redirect all output to stderr
    ensure_homebrew >&2 2>&1
    echo "==> Installing Python 3.12 via Homebrew" >&2
    brew install python@3.12 >&2

    # Resolve the full path from Homebrew prefix
    local brew_python
    brew_python="$(brew --prefix python@3.12 2>/dev/null)/bin/python3.12"
    if [[ ! -x "$brew_python" ]]; then
        brew_python="python3.12"
    fi
    if ! command -v "$brew_python" &>/dev/null && [[ ! -x "$brew_python" ]]; then
        echo "ERROR: Python 3.12 installed but not found. Open a new terminal and re-run." >&2
        exit 1
    fi
    echo "$brew_python"   # ← only this reaches PYTHON_CMD
    return 0
}

# ── Paths ─────────────────────────────────────────────────────────────────────
REPO_ROOT="$HOME/SemiColon2026"
BACKEND_DIR="$REPO_ROOT/backend"
SCRIPTS_DIR="$REPO_ROOT/infra/scripts"
INIT_SQL="$SCRIPTS_DIR/init_db.sql"
SEED_SQL="$SCRIPTS_DIR/seed_data.sql"
ENV_EXAMPLE="$BACKEND_DIR/.env.example"
ENV_FILE="$BACKEND_DIR/.env"
VENV_DIR="$BACKEND_DIR/.venv"
VENV_PYTHON="$VENV_DIR/bin/python"
CONTAINER_NAME="copilot-pgvector"
DB_PORT=5433

# ── Validate repo layout ──────────────────────────────────────────────────────
step "Validating repository files"
[[ -d "$REPO_ROOT"    ]] || die "Repo path not found: $REPO_ROOT"
[[ -d "$BACKEND_DIR"  ]] || die "Backend path not found: $BACKEND_DIR"
[[ -f "$INIT_SQL"     ]] || die "Missing SQL init file: $INIT_SQL"
[[ -f "$ENV_EXAMPLE"  ]] || die "Missing .env.example at: $ENV_EXAMPLE"

# ── Prerequisites ─────────────────────────────────────────────────────────────
step "Checking prerequisites"
PYTHON_CMD="$(ensure_python_compatible)"
ensure_docker_running
DOCKER_EXE="$(resolve_docker)"
[[ -n "$DOCKER_EXE" ]] || die "Docker CLI not found after prerequisites check."

# ── PostgreSQL container ──────────────────────────────────────────────────────
step "Preparing PostgreSQL + pgvector container"

EXISTS=$("$DOCKER_EXE" ps -a --filter "name=^/${CONTAINER_NAME}$" --format "{{.Names}}" 2>/dev/null || true)

if [[ -n "$EXISTS" ]]; then
    RUNNING=$("$DOCKER_EXE" ps --filter "name=^/${CONTAINER_NAME}$" --format "{{.Names}}" 2>/dev/null || true)
    if [[ -n "$RUNNING" ]]; then
        success "Container already running."
    else
        # If the existing stopped container was bound to a different port, remove it and recreate
        BOUND_PORT=$("$DOCKER_EXE" inspect "$CONTAINER_NAME" \
            --format '{{range $k,$v := .HostConfig.PortBindings}}{{range $v}}{{.HostPort}}{{end}}{{end}}' 2>/dev/null || echo "")
        if [[ "$BOUND_PORT" == "$DB_PORT" ]]; then
            "$DOCKER_EXE" start "$CONTAINER_NAME" || die "Starting Postgres container failed."
        else
            echo "Existing container uses port $BOUND_PORT, but DB_PORT=$DB_PORT. Removing and recreating."
            "$DOCKER_EXE" rm "$CONTAINER_NAME" || die "Removing stale container failed."
            EXISTS=""
        fi
    fi
fi

if [[ -z "$EXISTS" ]]; then
    "$DOCKER_EXE" pull pgvector/pgvector:pg15 || die "Pulling pgvector image failed."
    "$DOCKER_EXE" run -d \
        --name "$CONTAINER_NAME" \
        -e POSTGRES_USER=postgres \
        -e POSTGRES_PASSWORD=postgres \
        -e POSTGRES_DB=copilot \
        -p "${DB_PORT}:5432" \
        pgvector/pgvector:pg15 || die "Creating Postgres container failed."
fi

wait_for_postgres "$CONTAINER_NAME" 60

# ── Apply DB schema ───────────────────────────────────────────────────────────
step "Applying database schema"
"$DOCKER_EXE" exec -i "$CONTAINER_NAME" psql -U postgres -d copilot < "$INIT_SQL" \
    || die "Applying init_db.sql failed."
success "Schema initialized."

# ── Seed data ─────────────────────────────────────────────────────────────────
if [[ "$SKIP_SEED" == "false" ]] && [[ -f "$SEED_SQL" ]]; then
    step "Applying seed data"
    "$DOCKER_EXE" exec -i "$CONTAINER_NAME" psql -U postgres -d copilot < "$SEED_SQL" \
        || die "Applying seed_data.sql failed."
    success "Seed data applied."
fi

# ── Virtual environment ───────────────────────────────────────────────────────
step "Preparing backend virtual environment"

if [[ "$FORCE_RECREATE_VENV" == "true" ]] && [[ -d "$VENV_DIR" ]]; then
    step "Force recreating virtual environment"
    rm -rf "$VENV_DIR"
fi

if [[ -x "$VENV_PYTHON" ]]; then
    VENV_VER=$("$VENV_PYTHON" -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')" 2>/dev/null || echo "unknown")
    if [[ "$VENV_VER" != "3.12" ]] && [[ "$VENV_VER" != "3.11" ]]; then
        step "Existing venv uses Python $VENV_VER; recreating"
        rm -rf "$VENV_DIR"
    fi
fi

if [[ ! -x "$VENV_PYTHON" ]]; then
    "$PYTHON_CMD" -m venv "$VENV_DIR" || die "Creating virtual environment failed."
fi

# ── Python dependencies ───────────────────────────────────────────────────────
step "Installing Python dependencies"
"$VENV_PYTHON" -m pip install --upgrade pip      || die "pip self-upgrade failed."
"$VENV_PYTHON" -m pip install -r "$BACKEND_DIR/requirements.txt" \
    || die "Dependency installation failed."

# ── .env file ─────────────────────────────────────────────────────────────────
step "Preparing .env"
[[ -f "$ENV_FILE" ]] || cp "$ENV_EXAMPLE" "$ENV_FILE"

TARGET_DB_URL="DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:${DB_PORT}/copilot"

if grep -qE "^DATABASE_URL=" "$ENV_FILE"; then
    # Replace existing line (BSD sed on macOS needs '' after -i)
    sed -i '' "s|^DATABASE_URL=.*|${TARGET_DB_URL}|" "$ENV_FILE"
else
    printf '\n%s\n' "$TARGET_DB_URL" >> "$ENV_FILE"
fi

# ── Tests ─────────────────────────────────────────────────────────────────────
step "Running tests"
(cd "$BACKEND_DIR" && "$VENV_PYTHON" -m pytest -q) || die "Pytest failed."

echo ""
success "Setup + local test passed."
echo "API docs: http://localhost:8000/docs"
echo "Health:   http://localhost:8000/health"
echo ""
echo "Postgres container: $CONTAINER_NAME (port $DB_PORT)"

# ── Optionally start server ───────────────────────────────────────────────────
if [[ "$START_SERVER" == "true" ]]; then
    step "Starting FastAPI server"
    cd "$BACKEND_DIR"
    exec "$VENV_PYTHON" -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
else
    echo ""
    echo "To start the API server, run:"
    echo "  bash \"$REPO_ROOT/scripts/local_test_no_devops.sh\" --start-server"
fi
