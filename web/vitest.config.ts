import path from "node:path";
import { defineConfig } from "vitest/config";
import { SEED_USERS } from "./scripts/seed/users";
import { TEST_DATABASE_URL } from "./tests/setup/test-database-url";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@e2e": path.resolve(__dirname, "e2e"),
      "@scripts": path.resolve(__dirname, "scripts"),
      "@tests": path.resolve(__dirname, "tests"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],

    // 実 Postgres をテスト用データベース一本で共有する。
    // 隔離はケースごとに空にすることで作るので、同じ DB をファイル並列に踏まれると効かない。
    fileParallelism: false,

    // migration は一走に一度、テーブルを空にするのはケースごと。
    globalSetup: ["tests/setup/database.ts"],
    setupFiles: ["tests/setup/truncate.ts"],
    env: {
      DATABASE_URL: TEST_DATABASE_URL,
      DIRECT_URL: TEST_DATABASE_URL,

      // 現在のユーザーはシードの一人目に固定する（src/lib/current-user.ts）。
      // 未設定なら `readSingleUserEmail` が throw するので、ページを描くテストのために設定しておく。
      TOIITO_SINGLE_USER_EMAIL: SEED_USERS[0].email,
    },
  },
});
