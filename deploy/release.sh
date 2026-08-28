#!/usr/bin/env bash
# =============================================================================
#  Activate a release that CI has already rsynced to releases/<sha>.
#
#      release.sh <sha>
#
#  Nothing is built here. CI ships a finished artifact, which is the whole
#  point: the old setup built on the VPS, and a Next.js build pegging a small
#  VPS is what starved the deploy listener and caused the ack timeouts.
#
#  Activation is a symlink flip, so a failed health check rolls back in
#  seconds instead of needing a rebuild to escape a broken tree.
# =============================================================================
set -euo pipefail

# ssh "cmd" runs a non-login shell; don't rely on the profile for pm2/npm.
export PATH="/usr/local/bin:/usr/bin:/bin:$PATH"

ROOT="${FORTUNA_ROOT:-/opt/fortuna}"
KEEP_RELEASES="${KEEP_RELEASES:-5}"
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-120}"
DASHBOARD_URL="${DASHBOARD_URL:-http://127.0.0.1:3000/}"
# How long both apps must stay up before we call the deploy good. Comfortably
# past min_uptime in ecosystem.config.js so a crash-loop can't sneak past, with
# margin for a cluster reload that replaces dashboard workers one at a time.
SETTLE_SECONDS="${SETTLE_SECONDS:-30}"
SETTLE_MARGIN="${SETTLE_MARGIN:-10}"

SHA="${1:?usage: release.sh <sha>}"
RELEASE="$ROOT/releases/$SHA"

log() { printf '[%(%Y-%m-%d %H:%M:%S)T] %s\n' -1 "$*"; }

[ -d "$RELEASE" ] || { log "no such release: $RELEASE"; exit 1; }

# Where to fall back to. Empty on the very first deploy.
PREVIOUS=""
[ -L "$ROOT/current" ] && PREVIOUS="$(readlink -f "$ROOT/current")"

link_shared() {
    local dir="$1"
    ln -sfn "$ROOT/shared/bot.env" "$dir/.env"
    ln -sfn "$ROOT/shared/dashboard.env" "$dir/dashboard/.env"
}

# ln -sfn writes a *new* symlink beside the old one and mv -T swaps it in a
# single rename(2), so `current` is never briefly missing.
activate() {
    ln -sfn "$1" "$ROOT/current.tmp"
    mv -Tf "$ROOT/current.tmp" "$ROOT/current"
}

reload() {
    pm2 startOrReload "$ROOT/current/ecosystem.config.js" --update-env
}

healthy() {
    local deadline=$(( SECONDS + HEALTH_TIMEOUT ))
    until curl -fsS -o /dev/null --max-time 5 "$DASHBOARD_URL"; do
        if [ "$SECONDS" -ge "$deadline" ]; then
            log "dashboard never answered on $DASHBOARD_URL"
            return 1
        fi
        sleep 3
    done
    log "dashboard answering"

    # The bot has no HTTP surface, so ask PM2 instead: every process online,
    # and up long enough that we know it isn't crash-looping.
    sleep "$SETTLE_SECONDS"
    local sick
    sick="$(pm2 jlist | jq -r --argjson min "$(( (SETTLE_SECONDS - SETTLE_MARGIN) * 1000 ))" '
        .[]
        | select(.name == "fortuna-bot" or .name == "fortuna-dashboard")
        | select(.pm2_env.status != "online"
                 or .pm2_env.pm_uptime == null
                 or ((now * 1000) - .pm2_env.pm_uptime) < $min)
        | "\(.name)[\(.pm_id)] status=\(.pm2_env.status) restarts=\(.pm2_env.restart_time)"')"

    if [ -n "$sick" ]; then
        log "unhealthy processes:"
        printf '  %s\n' "$sick"
        return 1
    fi
    log "all processes online and settled"
}

# Hardlinked releases (rsync --link-dest) share file data, so dropping an old
# directory never pulls content out from under the live one.
prune() {
    local current_real old
    current_real="$(readlink -f "$ROOT/current")"
    while IFS= read -r old; do
        old="${old%/}"
        if [ "$(readlink -f "$old")" = "$current_real" ]; then
            continue
        fi
        log "pruning $old"
        rm -rf "$old"
    done < <(ls -1dt "$ROOT"/releases/*/ 2>/dev/null | tail -n "+$((KEEP_RELEASES + 1))")
}

log "activating $SHA"
link_shared "$RELEASE"
activate "$RELEASE"
reload

if healthy; then
    log "release $SHA is healthy"
    pm2 save --force
    prune
    exit 0
fi

if [ -z "$PREVIOUS" ] || [ ! -d "$PREVIOUS" ]; then
    log "UNHEALTHY and no previous release to fall back to"
    log "leaving $SHA in place for inspection: pm2 logs --lines 100"
    exit 1
fi

log "UNHEALTHY -- rolling back to $PREVIOUS"
activate "$PREVIOUS"
reload
log "rolled back. inspect the bad release with: pm2 logs --lines 100"
exit 1
