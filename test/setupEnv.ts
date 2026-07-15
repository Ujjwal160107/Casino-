import { config } from "dotenv";
import { resolve } from "path";
import { existsSync, readFileSync } from "fs";

// Load .env.test (TEST_REDIS_URL + MONGOMS_SYSTEM_BINARY). See .env.test.example.
config({ path: resolve(process.cwd(), ".env.test") });

// The Mongo test DB is a mongodb-memory-server replica set started once in
// test/globalSetup.ts (Docker on Windows can't reach a Mongo RS from the host).
// globalSetup writes its dynamic URI to test/.mongo-uri; pick it up per worker.
const uriFile = resolve(process.cwd(), "test/.mongo-uri");
if (existsSync(uriFile)) {
  process.env.TEST_DATABASE_URL = readFileSync(uriFile, "utf8").trim();
}

if (!process.env.TEST_REDIS_URL || !process.env.TEST_DATABASE_URL) {
  throw new Error(
    "Integration tests require TEST_REDIS_URL (.env.test) and a Mongo memory-server started by test/globalSetup.ts. Copy .env.test.example to .env.test and set TEST_REDIS_URL + MONGOMS_SYSTEM_BINARY (path to a local mongod)."
  );
}

// Point Prisma and the app's redisService at the test instances for the whole
// process, so every test file (and the app code it imports) uses them.
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.REDIS_URL = process.env.TEST_REDIS_URL;
