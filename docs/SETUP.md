# Fortuna — Linode VPS setup walkthrough

Follow this once, top to bottom, to bring a bare Ubuntu 24.04 Linode up as the
production host for the bot and the dashboard.

For how the deployment works and what to do afterwards, see
[DEPLOYMENT.md](./DEPLOYMENT.md).

**Order matters.** Nginx and TLS come *after* the first deploy, because the
Nginx config is copied out of a release directory that does not exist until
then. SSH hardening is last, because it is the only step that can lock you out.

---

## Before you start

Have these to hand:

- The Linode IP
- DNS control for `fortunabot.dev`
- MongoDB Atlas access (Network Access tab)
- Discord Developer Portal access for the bot's application
- Admin on the GitHub repo (to add secrets)

A note for Windows users: run the laptop-side commands in **Git Bash**, not
PowerShell. They are bash syntax and PowerShell 5.1 mangles some of them.

---

## 1. Deploy key — on your laptop

CI gets its own key. Do not reuse a personal one.

```bash
ssh-keygen -t ed25519 -f ~/.ssh/fortuna_deploy -C "fortuna-ci" -N ""
```

Verify it has no passphrase. This must print a key without prompting:

```bash
ssh-keygen -y -f ~/.ssh/fortuna_deploy
```

> **PowerShell 5.1 drops the `-N ""` argument** when passing it to a native
> executable, so ssh-keygen prompts for a passphrase instead of making a
> passphrase-free key. Use Git Bash. Do not use the `-N '""'` workaround — with
> Git's MSYS build that can set a literal two-character passphrase, and you
> won't discover it until a deploy fails with an unhelpful error. If you must
> use PowerShell, omit `-N` and press Enter twice at the prompts.

Then print the public half and keep it on your clipboard:

```bash
cat ~/.ssh/fortuna_deploy.pub
```

## 2. Bootstrap the VPS

From your laptop, in the repo root:

```bash
scp deploy/setup_server.sh root@<LINODE_IP>:/tmp/
```

Then on the VPS, pasting your public key literally inside the quotes:

```bash
ssh root@<LINODE_IP>
chmod +x /tmp/setup_server.sh
DEPLOY_PUBKEY="ssh-ed25519 AAAA... fortuna-ci" /tmp/setup_server.sh
```

The key must be pasted literally. `$(cat ~/.ssh/fortuna_deploy.pub)` would run
on the VPS, where that file does not exist.

The script is idempotent, so re-run it freely. It does, in order:

```
1  timezone → UTC, NTP on        7  Redis (localhost only, LRU-capped 256MB)
2  base packages + upgrade       8  Nginx
3  node-canvas libs + fonts      9  deploy user, /opt/fortuna skeleton
4  2GB swap                     10  pm2-logrotate + boot service
5  Node 22                      11  UFW (22/80/443)
6  PM2                          12  fail2ban, unattended-upgrades
```

It finishes by printing `Bootstrap complete.` and a numbered "Next" list.

**Two places it looks frozen but isn't:**

- After an apt step, `Scanning processes...` is `needrestart`. It takes 30–60
  seconds. If a purple full-screen dialog appears, press Enter to accept.
- After `v22.x.x` / `10.x.x` prints, `npm install -g pm2@latest` runs with **no
  output at all** for 30–90 seconds. Same for `pm2 install pm2-logrotate`
  later.

Never Ctrl-C during an apt step — that leaves dpkg half-configured and you'd
need `dpkg --configure -a` to recover. To check a slow step is alive, open a
second SSH session:

```bash
ps -eo pid,etime,cmd | grep -E '[n]pm|[a]pt|[p]m2'
```

Before moving on, grab two things off the VPS:

```bash
lsb_release -ds                          # must be Ubuntu 24.04
cat /etc/ssh/ssh_host_ed25519_key.pub    # needed in step 7
```

> If that first line is not 24.04, change `runs-on:` in
> `.github/workflows/deploy.yml` to match. CI ships prebuilt native modules
> (node-canvas, the Prisma query engine) that link against the host's glibc,
> so a mismatch fails at runtime rather than at build time.

## 3. Environment files — on the VPS

```bash
nano /opt/fortuna/shared/bot.env
```

```
DISCORD_TOKEN=
CLIENT_ID=
DATABASE_URL=
EMOJI_GUILD_ID=
TOPGG_TOKEN=
REDIS_URL=redis://127.0.0.1:6379
```

```bash
nano /opt/fortuna/shared/dashboard.env
```

```
DATABASE_URL=
NEXTAUTH_URL=https://fortunabot.dev
NEXTAUTH_SECRET=
DISCORD_CLIENT_ID=
DISCORD_CLIENT_SECRET=
DISCORD_BOT_TOKEN=
TOPGG_TOKEN=
```

Generate a **new** `NEXTAUTH_SECRET` — the old one was committed to this repo
and must not be reused:

```bash
openssl rand -base64 32
```

Lock the files down:

```bash
chmod 600 /opt/fortuna/shared/*.env
chown deploy:deploy /opt/fortuna/shared/*.env
```

## 4. Discord Developer Portal

Under the application's OAuth2 → Redirects, register exactly:

```
https://fortunabot.dev/api/auth/callback/discord
```

Without it, dashboard login fails with an opaque Discord error.

## 5. MongoDB Atlas

Add the Linode IP to the cluster's Network Access list, and remove the dead
droplet's entry.

Leave `0.0.0.0/0` in place. CI itself connects to Atlas for `prisma db push`,
the catalog seed and the dashboard build, and GitHub-hosted runners have no
fixed egress IP. Closing that off means either a self-hosted runner or moving
the schema step onto the VPS over SSH.

## 6. DNS

DNS for `fortunabot.dev` is managed at **Name.com** (nameservers `ns1kpv` …
`ns4bht.name.com`). Only the apex A record needs to change — `www` is a CNAME
pointing at the apex, so it follows on its own. Leave the CNAME alone.

First get the Linode's public IPv4, from the Linode Cloud Manager or on the VPS:

```bash
ip -4 addr show eth0 | grep inet
```

Then at name.com: **My Domains → fortunabot.dev → DNS Records**. Find the `A`
record whose host is blank or `@`, edit its answer to the Linode IP, set TTL to
`300`, and save.

Verify against an authoritative nameserver rather than your local resolver,
which will serve a cached answer:

```bash
nslookup fortunabot.dev ns1kpv.name.com
```

Do this before step 9 — certbot's HTTP-01 challenge fails if the domain does
not yet resolve to the Linode.

## 7. GitHub secrets

Repo → Settings → Environments → **New environment** named `production`. Add:

| Secret | Value |
| --- | --- |
| `DEPLOY_HOST` | Linode IP or hostname |
| `DEPLOY_USER` | `deploy` |
| `DEPLOY_SSH_KEY` | full contents of `~/.ssh/fortuna_deploy`, including the BEGIN/END lines |
| `DEPLOY_SSH_KNOWN_HOSTS` | see below |
| `DEPLOY_SSH_PORT` | optional, defaults to 22 |
| `DATABASE_URL` | Atlas connection string |
| `NEXTAUTH_URL` | `https://fortunabot.dev` |
| `NEXTAUTH_SECRET` | the same value you put in `shared/dashboard.env` |

For `DEPLOY_SSH_KNOWN_HOSTS`, run this **on the VPS** with `HOST` set to the
identical string you used for `DEPLOY_HOST`:

```bash
HOST=<same value as DEPLOY_HOST>
awk -v h="$HOST" '{print h, $1, $2}' /etc/ssh/ssh_host_ed25519_key.pub
```

Paste the whole output line. Reading the key off the filesystem rather than
letting CI trust whatever answers on each run is what stops a DNS or route
hijack from harvesting the deploy key. The label must match `DEPLOY_HOST`
character for character or SSH rejects the connection.

Delete the now-unused `DEPLOY_WEBHOOK_URL` and `DEPLOY_SECRET` secrets.

## 8. First deploy

The workflow triggers on push to `main`. From your laptop:

```bash
git push origin main
```

Watch it in the Actions tab. Expect 6–10 minutes — the first rsync sends the
whole artifact, later ones send only the delta. Then on the VPS:

```bash
sudo -iu deploy pm2 status
sudo -iu deploy pm2 logs --lines 50
```

Slash commands register themselves per guild when the bot reaches `ready`
(`src/index.ts:66`). There is no separate registration step.

## 9. Nginx and TLS — on the VPS

A release exists now, so the config is on disk:

```bash
cp /opt/fortuna/current/deploy/nginx_app.conf /etc/nginx/sites-available/fortuna
ln -sf /etc/nginx/sites-available/fortuna /etc/nginx/sites-enabled/fortuna
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

apt install -y certbot python3-certbot-nginx
certbot --nginx -d fortunabot.dev -d www.fortunabot.dev
```

Once `https://fortunabot.dev` loads, uncomment the
`Strict-Transport-Security` line in `/etc/nginx/sites-available/fortuna` and
`systemctl reload nginx`. Certbot installs its own renewal timer; confirm with
`systemctl list-timers | grep certbot`.

## 10. Lock down SSH — last

Open a **second terminal** and confirm you can still log in as a key-based
sudo user. Only then:

```bash
sudo HARDEN_SSH=1 /opt/fortuna/current/deploy/setup_server.sh
```

This disables root login and password authentication. It is last and separate
from the main bootstrap because it is the one step that can strand you outside
the VPS.

---

## Verify

`deploy/check_server.sh` audits everything the setup and the deploys put on the
VPS and prints a pass/fail line per item. It changes nothing, so run it at any
point — after the bootstrap, after the first deploy, or months later. Items
belonging to a step you have not reached yet will read MISS, which is expected.

Before the first deploy, copy it up alongside the bootstrap script:

```bash
scp deploy/check_server.sh root@<LINODE_IP>:/tmp/
ssh root@<LINODE_IP> 'chmod +x /tmp/check_server.sh && /tmp/check_server.sh'
```

Afterwards it ships with every release:

```bash
/opt/fortuna/current/deploy/check_server.sh
```

It never prints the contents of an env file or a key — only whether they exist,
their permissions, which variable names are set, and key fingerprints.

### What it looks at

```
/opt/fortuna/                    releases, current symlink, shared/, logs
/home/deploy/.ssh/authorized_keys CI's public key
/etc/redis/redis.conf            the fortuna-managed memory cap
/etc/nginx/sites-enabled/fortuna  site config
/etc/letsencrypt/live/           TLS certificates
/etc/systemd/system/             pm2-deploy.service (survives reboot)
/swapfile                        2GB
```

Then check it end to end by hand: run a slash command in Discord, and log into
the dashboard with Discord OAuth.

---

## If something goes wrong

| Symptom | Cause | Fix |
| --- | --- | --- |
| Actions: `Host key verification failed` | `DEPLOY_SSH_KNOWN_HOSTS` label doesn't match `DEPLOY_HOST` | Redo the awk command in step 7 with the exact `DEPLOY_HOST` value |
| Actions: `Permission denied (publickey)` | Wrong key in `DEPLOY_SSH_KEY`, or it has a passphrase | Re-check with `ssh-keygen -y -f ~/.ssh/fortuna_deploy`; confirm the pubkey is in `/home/deploy/.ssh/authorized_keys` |
| Dashboard logs `EADDRINUSE` | `next start` spawns its own server, so PM2 cluster socket sharing doesn't apply | Set the dashboard to `instances: 1, exec_mode: "fork"` in `ecosystem.config.js` and redeploy. Costs zero-downtime reloads, nothing else. Most likely first-deploy hiccup. |
| Deploy fails at the health gate | App crashed on boot | `sudo -iu deploy pm2 logs --lines 100`. From the second deploy on, `release.sh` rolls back automatically; on the very first there is nothing to roll back to, so the broken release stays up for inspection |
| `certbot` fails the challenge | DNS not propagated, or Nginx not serving :80 | `dig +short fortunabot.dev`, then `nginx -t && systemctl status nginx` |
| Dashboard login: opaque Discord error | Redirect URI not registered | Step 4 |
| Bot online but no slash commands | Bot lacks `applications.commands` scope in the guild | Re-invite with the correct scope; registration happens on `ready` |
| Generated images show blank boxes for emoji | Colour emoji font missing | `apt install -y fonts-noto-color-emoji && fc-cache -f`, then reload the bot |
