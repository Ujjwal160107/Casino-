import { config } from "dotenv";
import { resolve } from "path";

// Load .env.test if present, else fall back to .env. Integration tests REQUIRE
// TEST_REDIS_URL and TEST_DATABASE_URL to be set (see .env.test.example).
config({ path: resolve(process.cwd(), ".env.test") });

if (!process.env.TEST_REDIS_URL || !process.env.TEST_DATABASE_URL) {
  throw new Error(
    "Integration tests require TEST_REDIS_URL and TEST_DATABASE_URL. Copy .env.test.example to .env.test and fill them in (use a throwaway DB name)."
  );
}

// Point Prisma and the app's redisService at the test instances for the whole
// process, so every test file (and the app code it imports) uses them.
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.REDIS_URL = process.env.TEST_REDIS_URL;
