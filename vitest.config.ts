import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["./test/setupEnv.ts"],
    testTimeout: 20000,
    hookTimeout: 20000,
    // Integration tests mutate shared Redis/Mongo — run serially to avoid cross-test interference.
    fileParallelism: false,
  },
});
