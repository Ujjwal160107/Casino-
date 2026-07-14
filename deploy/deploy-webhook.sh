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
PENDING_FILE="${PENDING_FILE:-/tmp/casino-deploy.pending}"
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

    # Record the pre-pull commit so we can run only the build steps whose inputs
    # actually changed. Rebuilding everything on every push — especially the
    # memory-heavy Next.js dashboard build — pegs a small VPS for minutes and
    # starves the listener, which is what makes the *next* webhook's ack time
    # out. Conditional builds keep a bot-only push fast and light.
    local before after
    before="$(git rev-parse HEAD 2>/dev/null)"

    # Pull latest code
    log "📥 Pulling latest code..."
    git pull origin main 2>&1 || { log "❌ git pull failed"; return 1; }

    after="$(git rev-parse HEAD 2>/dev/null)"

    # changed <paths...> → true if anything under those paths changed in the pull.
    # Unknown baseline (fresh clone) → assume changed; nothing pulled → unchanged.
    changed() {
        [ -z "$before" ] && return 0
        [ "$before" = "$after" ] && return 1
        ! git diff --quiet "$before" "$after" -- "$@"
    }

    # --- Bot deps (only when manifests changed) ---
    if changed package.json package-lock.json; then
        log "📦 Installing bot dependencies..."
        npm install 2>&1 || { log "❌ npm install (bot) failed"; return 1; }
    else
        log "📦 Bot dependencies unchanged — skipping npm install."
    fi

    log "🔨 Building bot..."
    npm run build 2>&1 || { log "❌ npm run build (bot) failed"; return 1; }

    # --- Prisma (only when the schema changed) ---
    if changed prisma; then
        log "🗄️  Running Prisma db push..."
        npx prisma db push --accept-data-loss 2>&1 || { log "❌ prisma db push failed"; return 1; }
    else
        log "🗄️  Prisma schema unchanged — skipping db push."
    fi

    # --- Dashboard build (only when the dashboard changed) ---
    # This is the heavy, memory-hungry step; skipping it on bot-only pushes is
    # the single biggest win for deploy speed and listener responsiveness.
    if changed dashboard; then
        log "📦 Installing dashboard dependencies..."
        (cd dashboard && npm install) 2>&1 || { log "❌ npm install (dashboard) failed"; return 1; }
        log "🔨 Building dashboard..."
        (cd dashboard && npm run build) 2>&1 || { log "❌ npm run build (dashboard) failed"; return 1; }
    else
        log "🖥️  Dashboard unchanged — skipping build."
    fi

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

    # Acknowledge immediately, then deploy in the background. The full build
    # (npm install + tsc + prisma + a memory-heavy Next.js build + pm2
    # restart) takes several minutes on this 2GB VPS, and the GitHub Actions
    # curl holds the connection open until we respond — so we must NOT block
    # on the build, or a slow/stalled build hangs the CI run indefinitely.
    #
    # The ack goes out FIRST, before any deploy work, and the deploy is fully
    # detached from the socket: socat wires the TCP socket to this process's
    # stdin (fd 0) and stdout (fd 1). Redirecting 0</dev/null and 1/2→log means
    # no socket fd leaks into the build, so socat closes the ack connection the
    # instant handle_request returns.
    echo -ne "HTTP/1.1 200 OK\r\nContent-Length: 14\r\n\r\nDeploy queued!"

    # Single-flight, COALESCING deploy runner — the fix for curl-28 "0 bytes
    # received" ack timeouts. Root cause: a heavy build pegs this small box and
    # starves the socat listener so it can't ack the *next* webhook. Two guards:
    #
    #   1. flock -n (non-blocking): if a deploy is already running, we do NOT
    #      queue another — we mark work pending and exit. The in-flight runner
    #      re-runs once more when it finishes (picking up the newest commit via
    #      git pull). So N rapid webhooks — including the CI's own retries —
    #      collapse into at most one extra deploy instead of spawning 5 parallel
    #      builds that compound the peg and guarantee the next ack times out.
    #
    #   2. renice + ionice: the deploy (and every npm/tsc/next-build child it
    #      spawns) yields CPU and disk priority, so the listener always has
    #      enough scheduling headroom to send its ack within a second.
    touch "$PENDING_FILE"
    (
        exec 200>"$LOCK_FILE"
        if ! flock -n 200; then
            log "⏳ Deploy already running — coalescing; the in-flight run will pick up the latest commit."
            exit 0
        fi
        renice -n 15 -p "$BASHPID" >/dev/null 2>&1 || true
        ionice -c3 -p "$BASHPID" >/dev/null 2>&1 || true
        # Re-run while new triggers keep arriving, so late pushes aren't dropped.
        while [ -f "$PENDING_FILE" ]; do
            rm -f "$PENDING_FILE"
            do_deploy
        done
    ) >>"$LOG_FILE" 2>&1 0</dev/null &
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
