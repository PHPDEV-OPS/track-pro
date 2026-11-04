import { defineConfig } from "vitest/config";
import { config } from "dotenv";
import path from "node:path";

config({ path: ".env.local", quiet: true });

const testDb = process.env.TEST_DATABASE_URL ?? "";
if (testDb && testDb === process.env.DATABASE_URL) {
  throw new Error("TEST_DATABASE_URL must point at a separate Neon branch, not DATABASE_URL.");
}

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  // The file watcher on pnpm's node_modules keeps `vitest run` from exiting on Windows.
  server: { watch: null },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Tests only ever see the test branch; integration suites skip when it is unset.
    env: { DATABASE_URL: testDb },
  },
});
