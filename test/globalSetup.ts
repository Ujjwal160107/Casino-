import { config } from "dotenv";
import { resolve } from "path";
import { writeFileSync, rmSync } from "fs";
import { MongoMemoryReplSet } from "mongodb-memory-server";

// Load MONGOMS_SYSTEM_BINARY (path to the installed mongod.exe) + TEST_REDIS_URL.
config({ path: resolve(process.cwd(), ".env.test") });

const URI_FILE = resolve(process.cwd(), "test/.mongo-uri");
let replset: MongoMemoryReplSet | undefined;

// One native single-node replica set for the whole test run. Why not Docker: Docker
// Desktop on Windows port-forwards normal connections but breaks Mongo replica-set
// SDAM from the host, so `?replicaSet=...` never finds a primary (confirmed with both
// Prisma and the raw mongodb driver). memory-server runs mongod as a NATIVE process
// (via MONGOMS_SYSTEM_BINARY), so RS discovery + transactions — which Prisma requires
// for every Mongo write — work from the host. The dynamic URI is handed to each test
// worker via test/.mongo-uri (read in test/setupEnv.ts).
export async function setup() {
  replset = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  writeFileSync(URI_FILE, replset.getUri("fortuna_test"), "utf8");
}

export async function teardown() {
  await replset?.stop();
  try {
    rmSync(URI_FILE);
  } catch {
    /* already gone */
  }
}
