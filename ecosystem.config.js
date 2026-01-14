module.exports = {
    apps: [
        {
            name: "casino-bot",
            script: "./dist/index.js",
            env: {
                NODE_ENV: "production",
            }
        },
        {
            name: "casino-dashboard",
            cwd: "./dashboard",
            script: "npm",
            args: "start",
            env: {
                NODE_ENV: "production",
                PORT: 3000
            }
        }
    ]
};
