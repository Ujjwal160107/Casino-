#!/usr/bin/env bash
# =============================================================================
#  One-time bootstrap for a fresh Ubuntu 24.04 Linode.
#
#      sudo DEPLOY_PUBKEY="ssh-ed25519 AAAA... fortuna-deploy" ./setup_server.sh
#
#  Idempotent: safe to re-run. It never touches SSH access rules by default;
#  see HARDEN_SSH at the bottom for the lockdown step, which is deliberately
#  separate so a half-finished run can't lock you out of your own VPS.
# =============================================================================
set -euo pipefail

[ "$(id -u)" -eq 0 ] || { echo "run as root (sudo)"; exit 1; }

ROOT="${FORTUNA_ROOT:-/opt/fortuna}"
APP_USER="${APP_USER:-deploy}"
NODE_MAJOR="${NODE_MAJOR:-22}"
SWAP_SIZE="${SWAP_SIZE:-2G}"

step() { printf '\n\033[1;36m>>> %s\033[0m\n' "$*"; }

step "Clock and timezone"
# The bot runs node-cron dailies. A VPS on a different timezone than the last
# one silently moves every payout to a different wall-clock hour, so pin UTC.
timedatectl set-timezone UTC
timedatectl set-ntp true

step "Base packages"
export DEBIAN_FRONTEND=noninteractive
# 24.04 runs needrestart after every apt transaction and will block on a
# full-screen "which services should be restarted?" prompt. DEBIAN_FRONTEND
# does not cover it -- this does. `a` restarts affected services automatically.
export NEEDRESTART_MODE=a
apt-get update
apt-get upgrade -y
apt-get install -y \
    curl git jq rsync unzip ca-certificates build-essential \
    ufw fail2ban unattended-upgrades

step "node-canvas system libraries and fonts"
# canvas is a native addon used by imageService/imageUtils/profileStyles. The
# prebuilt .node we ship links against these at runtime, and without a colour
# emoji font every emoji on a generated profile card renders as a blank box.
apt-get install -y \
    libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev \
    fonts-liberation fonts-dejavu-core fonts-noto-color-emoji
fc-cache -f >/dev/null

step "Swap (${SWAP_SIZE})"
if ! swapon --show | grep -q '/swapfile'; then
    fallocate -l "$SWAP_SIZE" /swapfile
    chmod 600 /swapfile
    mkswap /swapfile
    swapon /swapfile
    grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
    # Prefer RAM; swap is an OOM backstop, not a working surface.
    sysctl -w vm.swappiness=10
    grep -q '^vm.swappiness' /etc/sysctl.conf || echo 'vm.swappiness=10' >> /etc/sysctl.conf
else
    echo "swapfile already present"
fi

step "Node.js ${NODE_MAJOR}"
if ! node -v 2>/dev/null | grep -q "^v${NODE_MAJOR}\."; then
    curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
    apt-get install -y nodejs
fi
node -v && npm -v

step "PM2"
npm install -g pm2@latest
# Modules attach to a specific user's PM2 daemon, so pm2-logrotate is
# configured further down, once $APP_USER exists.

step "Redis"
apt-get install -y redis-server
# Ubuntu already binds 127.0.0.1 with protected-mode on. This only caps memory
# so a runaway key set can't OOM the VPS; the data here is cooldown/buff cache.
if ! grep -q '# fortuna-managed' /etc/redis/redis.conf; then
    cat >> /etc/redis/redis.conf <<'REDIS'

# fortuna-managed
maxmemory 256mb
maxmemory-policy allkeys-lru
REDIS
fi
systemctl enable --now redis-server
systemctl restart redis-server

step "Nginx"
apt-get install -y nginx
systemctl enable --now nginx

step "Deploy user and ${ROOT}"
id -u "$APP_USER" >/dev/null 2>&1 || adduser --disabled-password --gecos "" "$APP_USER"
install -d -m 700 -o "$APP_USER" -g "$APP_USER" "/home/$APP_USER/.ssh"
if [ -n "${DEPLOY_PUBKEY:-}" ]; then
    touch "/home/$APP_USER/.ssh/authorized_keys"
    grep -qxF "$DEPLOY_PUBKEY" "/home/$APP_USER/.ssh/authorized_keys" \
        || echo "$DEPLOY_PUBKEY" >> "/home/$APP_USER/.ssh/authorized_keys"
    chmod 600 "/home/$APP_USER/.ssh/authorized_keys"
    chown "$APP_USER:$APP_USER" "/home/$APP_USER/.ssh/authorized_keys"
    echo "installed deploy public key"
else
    echo "!! DEPLOY_PUBKEY not set -- add CI's public key to"
    echo "!! /home/$APP_USER/.ssh/authorized_keys before the first deploy"
fi

install -d -m 755 -o "$APP_USER" -g "$APP_USER" \
    "$ROOT" "$ROOT/releases" "$ROOT/shared" "$ROOT/shared/logs"
# 600: these hold the bot token, the Atlas URI and the NextAuth secret.
for f in bot.env dashboard.env; do
    [ -f "$ROOT/shared/$f" ] \
        || install -m 600 -o "$APP_USER" -g "$APP_USER" /dev/null "$ROOT/shared/$f"
done

step "PM2 log rotation and boot service for ${APP_USER}"
# Logs are otherwise unbounded; the old VPS accumulated a multi-hundred-MB
# error_full.log this way. Modules live in the daemon of whichever user runs
# them, so these must be $APP_USER's, not root's.
sudo -iu "$APP_USER" pm2 install pm2-logrotate || true
sudo -iu "$APP_USER" pm2 set pm2-logrotate:max_size 20M
sudo -iu "$APP_USER" pm2 set pm2-logrotate:retain 14
sudo -iu "$APP_USER" pm2 set pm2-logrotate:compress true
env PATH="$PATH:/usr/bin" pm2 startup systemd -u "$APP_USER" --hp "/home/$APP_USER"

step "Firewall"
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable
ufw status verbose

step "fail2ban and unattended upgrades"
systemctl enable --now fail2ban
dpkg-reconfigure -f noninteractive unattended-upgrades

if [ "${HARDEN_SSH:-0}" = "1" ]; then
    step "SSH lockdown"
    # Only run this once you have confirmed, in a SECOND terminal, that you can
    # still log in as a non-root user with a key. It is the one step here that
    # can strand you outside your own VPS.
    cat > /etc/ssh/sshd_config.d/99-fortuna.conf <<'SSHD'
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
SSHD
    chmod 644 /etc/ssh/sshd_config.d/99-fortuna.conf
    sshd -t && systemctl reload ssh
    echo "root login and password auth disabled"
else
    echo
    echo "SSH hardening skipped. Once you can log in as a key-based sudo user"
    echo "in a second terminal, re-run with: HARDEN_SSH=1 ./setup_server.sh"
fi

cat <<DONE

Bootstrap complete.

Next (full detail in docs/DEPLOYMENT.md):
  1. Fill $ROOT/shared/bot.env and $ROOT/shared/dashboard.env
  2. Register https://fortunabot.dev/api/auth/callback/discord in the
     Discord developer portal
  3. Add this VPS's IP to the MongoDB Atlas access list
  4. Point DNS at this VPS
  5. Add the GitHub secrets, then push to main
  6. AFTER the first deploy, install the nginx config and run:
     certbot --nginx -d fortunabot.dev -d www.fortunabot.dev
  7. Last: re-run this script with HARDEN_SSH=1

DONE
