module.exports = {
    apps: [
        {
            name: "casino-bot",
            script: "./dist/index.js",
            instances: 1,
            exec_mode: "fork",
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
                PORT: 3000,
                NEXTAUTH_SECRET: "c404fd60b722051dfe1c9d57984682e1c5261b96e85" // Hardcoded for VPS reliability
            }
        }
    ]
};
