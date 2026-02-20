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

set -euo pipefail

PORT="${DEPLOY_PORT:-9000}"
APP_DIR="${APP_DIR:-/root/Casino-}"
LOG_FILE="${LOG_FILE:-/var/log/casino-deploy.log}"
DEPLOY_SECRET="${DEPLOY_SECRET:?DEPLOY_SECRET environment variable is required}"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

do_deploy() {
    log "========================================="
    log "🚀 Deploy triggered"
    log "========================================="

    cd "$APP_DIR" || { log "❌ Failed to cd to $APP_DIR"; return 1; }

    # Pull latest code
    log "📥 Pulling latest code..."
    git pull origin main 2>&1 | tee -a "$LOG_FILE"

    # --- Bot build ---
    log "📦 Installing bot dependencies..."
    npm install 2>&1 | tee -a "$LOG_FILE"

    log "🔨 Building bot..."
    npm run build 2>&1 | tee -a "$LOG_FILE"

    # --- Prisma ---
    log "🗄️  Running Prisma db push..."
    npx prisma db push --accept-data-loss 2>&1 | tee -a "$LOG_FILE"

    # --- Dashboard build ---
    log "📦 Installing dashboard dependencies..."
    cd dashboard
    npm install 2>&1 | tee -a "$LOG_FILE"

    log "🔨 Building dashboard..."
    npm run build 2>&1 | tee -a "$LOG_FILE"
    cd ..

    # --- Restart PM2 ---
    log "♻️  Restarting PM2 processes..."
    pm2 restart ecosystem.config.js 2>&1 | tee -a "$LOG_FILE"
    pm2 save 2>&1 | tee -a "$LOG_FILE"

    log "✅ Deploy complete!"
    log "========================================="
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

    # Respond immediately, then deploy in background
    echo -ne "HTTP/1.1 200 OK\r\nContent-Length: 15\r\n\r\nDeploy started!"

    # Run deploy in background so the HTTP response is sent immediately
    do_deploy &
}

# Export functions for socat subshell
export -f handle_request do_deploy log
export APP_DIR LOG_FILE DEPLOY_SECRET

log "🎧 Webhook listener starting on port $PORT..."

# Listen forever — socat forks a bash subshell for each connection
socat TCP-LISTEN:"$PORT",reuseaddr,fork SYSTEM:"bash -c handle_request"
