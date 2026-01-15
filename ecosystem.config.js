module.exports = {
    apps: [
        {
            name: "casino-bot",
            script: "./dist/index.js",
            node_args: "--max-old-space-size=1536", // optimize for 2GB VPS
            max_memory_restart: "1800M",
            env: {
                NODE_ENV: "production",
            }
        },
        {
            name: "casino-dashboard",
            cwd: "./dashboard",
            script: "npm",
            args: "start",
            max_memory_restart: "500M",
            env: {
                NODE_ENV: "production",
                PORT: 3000
            }
        }
    ]
};
