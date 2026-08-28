# Deployment — Linode VPS

Bot and dashboard both run on one Linode VPS under PM2, behind Nginx, deployed
by GitHub Actions on every push to `main`.

## How it works

```
push to main
  │
  ├─ build     npm ci → typecheck → test → tsc → next build
  ├─ schema    prisma db push + seed          ← only when prisma/** changed
  ├─ ship      rsync artifact → releases/<sha>
  └─ activate  symlink flip → pm2 reload → health gate
                                              └─ fail ⇒ auto-rollback
```

Nothing is built on the VPS. CI ships a finished artifact and the VPS only
unpacks and reloads it.

### Layout

```
/opt/fortuna/
  releases/<sha>/         one directory per deploy, hardlinked to save disk
  current -> releases/<sha>
  shared/
    bot.env               chmod 600, never in git
    dashboard.env         chmod 600, never in git
    logs/
```

`deploy/release.sh` symlinks `shared/bot.env` to `current/.env` and
`shared/dashboard.env` to `current/dashboard/.env` on every deploy. The bot
already calls `dotenv.config()` and Next reads `.env` from its cwd, so no
application code knows any of this is happening.

### Why it is built this way

| Old (DigitalOcean) | Now | Reason |
| --- | --- | --- |
| VPS ran `npm install` + `next build` | CI builds, VPS unpacks | The build pegged the VPS and starved the deploy listener — the cause of the curl-28 ack timeouts |
| `socat` HTTP listener on :9000 | SSH from Actions | ~200 lines of hand-rolled HTTP parsing deleted; only 22/80/443 are open |
| `git pull` over the live tree | `releases/<sha>` + symlink | A bad deploy rolls back in seconds instead of needing a rebuild to escape |
| `NEXTAUTH_SECRET` in `ecosystem.config.js` | `shared/*.env` | That file is committed; secrets cannot live in it |
| `db push --accept-data-loss` on every push | gated on `prisma/**`, flag dropped | A schema change that would drop production data must fail loudly |
| everything as root in `/root/app` | `deploy` user in `/opt/fortuna` | Blast radius |

---

## First-time setup

Bringing up a new VPS is a one-time, order-sensitive sequence with a handful of
traps in it, so it lives in its own file: **[SETUP.md](./SETUP.md)**.

The short version, for orientation only:

```
laptop   1. deploy keypair
VPS      2. run deploy/setup_server.sh
VPS      3. fill shared/bot.env and shared/dashboard.env
web      4. Discord redirect URI   5. Atlas allowlist   6. DNS
GitHub   7. production environment secrets
laptop   8. push to main  →  first deploy
VPS      9. nginx + certbot        10. HARDEN_SSH=1
```

Nginx and TLS come after the first deploy because the config is copied out of a
release directory. SSH hardening is last because it is the only step that can
lock you out.

---

## Day-to-day

**Roll back to the previous release**

```bash
ls -1t /opt/fortuna/releases        # newest first
ln -sfn /opt/fortuna/releases/<sha> /opt/fortuna/current.tmp
mv -Tf /opt/fortuna/current.tmp /opt/fortuna/current
pm2 reload /opt/fortuna/current/ecosystem.config.js --update-env
```

Five releases are kept. A failed health check does this automatically.

**Change an environment variable** — edit `/opt/fortuna/shared/*.env`, then
`pm2 reload /opt/fortuna/current/ecosystem.config.js --update-env`. No deploy
needed. Changing `NEXTAUTH_URL` or anything the dashboard inlines at build
time does need a rebuild, so push or re-run the workflow.

**Run a schema push without a code change** — Actions → Deploy → Run workflow,
tick `run_schema`.

**Logs** — `pm2 logs fortuna-bot`, `pm2 logs fortuna-dashboard`, or the files
under `/opt/fortuna/shared/logs/`. Rotated at 20MB, 14 kept, compressed.

**Restart just one app** — `pm2 reload fortuna-dashboard`.

---

## Things that will bite you

- **The bot must stay `instances: 1, exec_mode: "fork"`.** Cluster mode opens a
  second gateway connection and every interaction gets handled twice. The
  dashboard is the only app that clusters.
- **If the dashboard logs `EADDRINUSE` on startup**, `next start` is spawning
  its own server process instead of listening in-process, so PM2's cluster
  socket sharing does not apply. Set the dashboard to `instances: 1,
  exec_mode: "fork"` in `ecosystem.config.js` and redeploy. You lose
  zero-downtime reloads on the dashboard and nothing else. This is the most
  likely first-deploy hiccup.
- **The runner image must match the VPS's Ubuntu release.** We ship prebuilt
  native modules (node-canvas, the Prisma query engine) that link against the
  host glibc. If you upgrade the VPS past 24.04, change `runs-on:` to match.
  Verify with `lsb_release -ds` on the VPS.
- **All image paths must resolve from `__dirname`, not cwd.** `copyAssets.js`
  puts `src/assets` into `dist/assets` at build time and only `dist` ships. A
  cwd-relative path like `"./src/assets/x.jpg"` works in dev and breaks in
  production, which is exactly what `stock.ts` used to do.
- **Timezone is pinned to UTC** because the `node-cron` dailies key off wall
  clock. Changing it silently moves every payout.
- **`npm test` gates deploys.** If the suite is red, nothing ships. That is the
  point, but confirm it passes locally before relying on it.
- **Redis is a cache, not a store.** It holds buff and item-use cooldowns and
  is LRU-capped at 256MB. Losing it resets cooldowns; it loses no player data.
