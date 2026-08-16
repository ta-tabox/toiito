import path from "node:path";
import { defineConfig } from "vitest/config";
import { TEST_DATABASE_URL } from "./tests/setup/test-database-url";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],

    // 実 Postgres を一つのテスト用データベースで共有する。走る前に作り直す。
    globalSetup: ["tests/setup/database.ts"],
    env: {
      DATABASE_URL: TEST_DATABASE_URL,
      DIRECT_URL: TEST_DATABASE_URL,
    },
  },
});
