#!/bin/bash
# =============================================================
#  Casino- Deploy Webhook Listener
#  Listens on port 9000 for POST requests from GitHub Actions
#  and runs the full deploy pipeline.
#
#  Requirements: socat, git, node, npm, pm2
#  Install socat:  apt install -y socat
#
#  Usage (direct):
#    DEPLOY_SECRET="your-secret-here" ./deploy-webhook.sh
#
#  Usage (systemd): see deploy-webhook.service
# =============================================================

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT_PATH="$SCRIPT_DIR/$(basename "${BASH_SOURCE[0]}")"

PORT="${DEPLOY_PORT:-9000}"
APP_DIR="${APP_DIR:-/root/app}"
LOG_FILE="${LOG_FILE:-/var/log/casino-deploy.log}"
LOCK_FILE="${LOCK_FILE:-/tmp/casino-deploy.lock}"
DEPLOY_SECRET="${DEPLOY_SECRET:?DEPLOY_SECRET environment variable is required}"

log() {
    # File only — never stdout. A --handle invocation's stdout IS the raw
    # TCP socket (that's how socat's EXEC wiring works), so anything written
    # here ahead of the final HTTP response line corrupts the response into
    # something no HTTP client can parse (curl: "Received HTTP/0.9").
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >> "$LOG_FILE"
}

do_deploy() {
    log "========================================="
    log "🚀 Deploy triggered"
    log "========================================="

    cd "$APP_DIR" || { log "❌ Failed to cd to $APP_DIR"; return 1; }

    # Every command's output below goes to $LOG_FILE only (redirected by the
    # caller, see handle_request) — never to stdout, which for a --handle
    # invocation is the live TCP socket.

    # Pull latest code
    log "📥 Pulling latest code..."
    git pull origin main 2>&1 || { log "❌ git pull failed"; return 1; }

    # --- Bot build ---
    log "📦 Installing bot dependencies..."
    npm install 2>&1 || { log "❌ npm install (bot) failed"; return 1; }

    log "🔨 Building bot..."
    npm run build 2>&1 || { log "❌ npm run build (bot) failed"; return 1; }

    # --- Prisma ---
    log "🗄️  Running Prisma db push..."
    npx prisma db push --accept-data-loss 2>&1 || { log "❌ prisma db push failed"; return 1; }

    # --- Dashboard build ---
    log "📦 Installing dashboard dependencies..."
    (cd dashboard && npm install) 2>&1 || { log "❌ npm install (dashboard) failed"; return 1; }

    log "🔨 Building dashboard..."
    (cd dashboard && npm run build) 2>&1 || { log "❌ npm run build (dashboard) failed"; return 1; }

    # --- Restart PM2 ---
    log "♻️  Restarting PM2 processes..."
    pm2 restart ecosystem.config.js 2>&1 || { log "❌ pm2 restart failed"; return 1; }
    pm2 save 2>&1

    log "✅ Deploy complete!"
    log "========================================="
    return 0
}

handle_request() {
    # Read the HTTP request
    local line
    local content_length=0
    local secret=""
    local body=""

    # Read request line
    read -r line

    # Read headers
    while read -r line; do
        line="${line%%$'\r'}"
        [ -z "$line" ] && break

        # Extract Content-Length
        if [[ "$line" =~ ^[Cc]ontent-[Ll]ength:\ *([0-9]+) ]]; then
            content_length="${BASH_REMATCH[1]}"
        fi

        # Extract our secret header
        if [[ "$line" =~ ^[Xx]-[Dd]eploy-[Ss]ecret:\ *(.*) ]]; then
            secret="${BASH_REMATCH[1]}"
        fi
    done

    # Read body if present
    if [ "$content_length" -gt 0 ]; then
        read -rN "$content_length" body
    fi

    # Validate secret
    if [ "$secret" != "$DEPLOY_SECRET" ]; then
        log "⛔ Unauthorized request (bad secret)"
        echo -ne "HTTP/1.1 403 Forbidden\r\nContent-Length: 12\r\n\r\nUnauthorized"
        return
    fi

    # Serialize deploys and wait for the real result: a flock around
    # do_deploy means overlapping webhook calls (e.g. several pushes in
    # quick succession) queue up and run one at a time instead of racing
    # git pull / npm install / pm2 restart against each other on the same
    # directory. Waiting for it to finish (instead of backgrounding) means
    # the HTTP response — and therefore the GitHub Actions job — actually
    # reflects whether the deploy succeeded, instead of always saying 200
    # the instant the secret checks out.
    (
        flock -w 600 200 || { log "❌ Timed out waiting for deploy lock"; exit 1; }
        do_deploy
    ) >>"$LOG_FILE" 2>&1 200>"$LOCK_FILE"
    local status=$?

    if [ "$status" -eq 0 ]; then
        echo -ne "HTTP/1.1 200 OK\r\nContent-Length: 15\r\n\r\nDeploy started!"
    else
        echo -ne "HTTP/1.1 500 Internal Server Error\r\nContent-Length: 14\r\n\r\nDeploy failed!"
    fi
}

# --- Entrypoint ---
# When socat calls this script with --handle, process the HTTP request.
# Otherwise, start the socat listener.
if [ "${1:-}" = "--handle" ]; then
    handle_request
else
    log "🎧 Webhook listener starting on port $PORT..."
    socat TCP-LISTEN:"$PORT",reuseaddr,fork EXEC:"$SCRIPT_PATH --handle"
fi
