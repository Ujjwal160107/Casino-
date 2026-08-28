// PM2 process definitions for the Linode box.
//
// This file is COMMITTED, so no secrets live here. Each release gets
// `.env` and `dashboard/.env` symlinked in from /opt/fortuna/shared by
// deploy/release.sh; dotenv (bot) and Next (dashboard) already read those,
// so nothing in src/ has to change.
const ROOT = process.env.FORTUNA_ROOT || "/opt/fortuna";
const CURRENT = `${ROOT}/current`;
const LOGS = `${ROOT}/shared/logs`;

module.exports = {
    apps: [
        {
            name: "fortuna-bot",
            cwd: CURRENT,
            script: `${CURRENT}/dist/index.js`,
            // Must stay fork/1. Cluster mode would open a second gateway
            // connection and every interaction would be handled twice.
            instances: 1,
            exec_mode: "fork",
            node_args: "--max-old-space-size=1536",
            max_memory_restart: "1800M",
            env: { NODE_ENV: "production" },
            out_file: `${LOGS}/bot-out.log`,
            error_file: `${LOGS}/bot-error.log`,
            time: true,
            // A crash-loop should show up as "errored" for the deploy health
            // gate to catch, not restart quietly forever.
            min_uptime: "20s",
            max_restarts: 10,
            restart_delay: 2000,
        },
        {
            name: "fortuna-dashboard",
            cwd: `${CURRENT}/dashboard`,
            // Next's bin directly rather than `npm start`, because PM2 can
            // only run a real Node script under the cluster module — that is
            // what makes `pm2 reload` roll workers one at a time instead of
            // dropping the site for the length of a boot.
            script: `${CURRENT}/dashboard/node_modules/next/dist/bin/next`,
            args: "start -p 3000",
            instances: 2,
            exec_mode: "cluster",
            max_memory_restart: "700M",
            env: { NODE_ENV: "production", PORT: 3000 },
            out_file: `${LOGS}/dashboard-out.log`,
            error_file: `${LOGS}/dashboard-error.log`,
            time: true,
            min_uptime: "20s",
            max_restarts: 10,
            restart_delay: 2000,
        },
    ],
};
