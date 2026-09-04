#!/usr/bin/env bash
# =============================================================================
#  Read-only audit of what setup_server.sh and the deploys put on this VPS.
#
#      ./check_server.sh
#
#  Changes nothing. Prints a pass/fail line per item, and never prints the
#  contents of an env file or a key -- only whether it exists and which
#  variable names are set.
# =============================================================================
set -uo pipefail

ROOT="${FORTUNA_ROOT:-/opt/fortuna}"
APP_USER="${APP_USER:-deploy}"

pass=0
fail=0
ok()   { printf '  \033[32mOK  \033[0m %s\n' "$*"; pass=$((pass + 1)); }
no()   { printf '  \033[31mMISS\033[0m %s\n' "$*"; fail=$((fail + 1)); }
note() { printf '       %s\n' "$*"; }
sec()  { printf '\n\033[1;36m%s\033[0m\n' "$*"; }

have() { command -v "$1" >/dev/null 2>&1; }

# as_app runs a command as the deploy user when we are root, directly otherwise.
as_app() {
    if [ "$(id -un)" = "$APP_USER" ]; then
        "$@"
    else
        sudo -iu "$APP_USER" "$@"
    fi
}

sec "Commands"
for c in node npm pm2 nginx redis-server jq rsync git curl; do
    if have "$c"; then ok "$c  $("$c" --version 2>&1 | head -1)"; else no "$c"; fi
done
if have certbot; then ok "certbot  $(certbot --version 2>&1)"; else no "certbot (installed in setup step 9)"; fi

sec "Services"
for s in redis-server nginx fail2ban "pm2-$APP_USER"; do
    if systemctl is-enabled "$s" >/dev/null 2>&1; then
        ok "$s  enabled, $(systemctl is-active "$s" 2>&1)"
    else
        no "$s  not enabled"
    fi
done

sec "Directories"
for d in "$ROOT" "$ROOT/releases" "$ROOT/shared" "$ROOT/shared/logs" "/home/$APP_USER/.ssh"; do
    if [ -d "$d" ]; then ok "$d  $(stat -c '%U:%G %a' "$d")"; else no "$d"; fi
done

sec "Deploy user access"
AK="/home/$APP_USER/.ssh/authorized_keys"
if [ -s "$AK" ]; then
    ok "$AK  $(wc -l < "$AK") key(s), mode $(stat -c '%a' "$AK")"
    # Fingerprints only -- never the key material.
    ssh-keygen -l -f "$AK" 2>/dev/null | sed 's/^/       /'
else
    no "$AK  empty or missing -- CI cannot log in"
fi

sec "Environment files"
for f in bot.env dashboard.env; do
    p="$ROOT/shared/$f"
    if [ ! -f "$p" ]; then
        no "$p"
        continue
    fi
    mode="$(stat -c '%a' "$p")"
    owner="$(stat -c '%U:%G' "$p")"
    if [ -s "$p" ]; then
        ok "$p  $owner $mode"
    else
        no "$p  exists but is EMPTY -- fill it before deploying"
    fi
    [ "$mode" = "600" ] || note "!! mode is $mode, should be 600"
    [ "$owner" = "$APP_USER:$APP_USER" ] || note "!! owner is $owner, should be $APP_USER:$APP_USER"
    # Names only. Values stay out of the terminal and out of any scrollback.
    keys="$(grep -oE '^[A-Z_][A-Z0-9_]*=' "$p" 2>/dev/null | tr -d '=' | tr '\n' ' ')"
    [ -n "$keys" ] && note "set: $keys"
    grep -qE '^[A-Z_]+=$' "$p" 2>/dev/null && note "!! some variables are present but blank"
done

sec "System"
tz="$(timedatectl show -p Timezone --value 2>/dev/null)"
[ "$tz" = "UTC" ] && ok "timezone $tz" || no "timezone is $tz, should be UTC (node-cron dailies key off wall clock)"
if swapon --show 2>/dev/null | grep -q .; then
    # Multiple swap areas are normal (Linode ships one, setup_server.sh adds
    # another), so list them separated rather than run together.
    ok "swap  $(swapon --show=NAME,SIZE --noheadings | awk '{printf "%s(%s) ", $1, $2}')"
else
    no "swap not active"
fi
if have ufw && ufw status 2>/dev/null | grep -q "Status: active"; then
    ok "ufw active"
    ufw status 2>/dev/null | grep -E '^[0-9]|ALLOW' | sed 's/^/       /'
else
    no "ufw inactive"
fi
grep -q '# fortuna-managed' /etc/redis/redis.conf 2>/dev/null \
    && ok "redis maxmemory cap applied" || no "redis maxmemory block not in /etc/redis/redis.conf"

sec "Release state"
if [ -L "$ROOT/current" ]; then
    ok "current -> $(readlink -f "$ROOT/current")"
else
    no "$ROOT/current  no release activated yet (expected before the first deploy)"
fi
n="$(find "$ROOT/releases" -maxdepth 1 -mindepth 1 -type d 2>/dev/null | wc -l)"
note "$n release(s) in $ROOT/releases"
[ -n "${n:-}" ] && [ "$n" -gt 0 ] && find "$ROOT/releases" -maxdepth 1 -mindepth 1 -type d -printf '       %f\n' 2>/dev/null
du -sh "$ROOT" 2>/dev/null | sed 's/^/       total /'

sec "Processes"
if as_app pm2 jlist >/dev/null 2>&1; then
    as_app pm2 list 2>/dev/null | sed 's/^/  /'
else
    no "pm2 not reachable as $APP_USER (normal before the first deploy)"
fi

sec "Web"
if [ -L /etc/nginx/sites-enabled/fortuna ]; then
    ok "/etc/nginx/sites-enabled/fortuna"
    nginx -t >/dev/null 2>&1 && ok "nginx config valid" || no "nginx -t fails"
else
    no "/etc/nginx/sites-enabled/fortuna  (setup step 9)"
fi
if [ -d /etc/letsencrypt/live ]; then
    ok "TLS certs: $(ls /etc/letsencrypt/live 2>/dev/null | tr '\n' ' ')"
else
    no "no TLS certificate yet (setup step 9)"
fi
curl -fsS -o /dev/null --max-time 5 http://127.0.0.1:3000/ 2>/dev/null \
    && ok "dashboard answering on 127.0.0.1:3000" \
    || no "dashboard not answering on 127.0.0.1:3000"

printf '\n\033[1m%d ok, %d missing\033[0m\n' "$pass" "$fail"
