/**
 * L4（ブラウザ実挙動）の設定。
 *
 * 見るのは `e2e/` の spec だけで、L0〜L3 は `pnpm check` の側が持つ。
 * AI 呼び出しはフェイクモードに固定する（HARNESS.md「AI フェイクモード」）。
 * 実 API を自動テストで叩かない。
 *
 * 接続先とサーバーは開発用から二重に離す。
 * データベースは専用の `toiito_e2e`、口は 3100 で、`pnpm dev` を止めずに走らせられる。
 */

import { defineConfig, devices } from "@playwright/test";
import { E2E_DATABASE_URL } from "./e2e/setup/e2e-database-url.ts";

/** 開発サーバー（3000）と衝突させないための口。 */
const PORT = 3100;

const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",

  // 一つのデータベースを共有するので直列に走らせる（vitest の fileParallelism: false と同じ理由）。
  workers: 1,

  reporter: "list",

  use: {
    baseURL: BASE_URL,
  },

  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],

  webServer: {
    // データベースの作り直しを dev サーバーの起動と同じ一本に繋ぐ。
    // Playwright は webServer をプラグインとして globalSetup より先に立ち上げるので、globalSetup へ置くと順序が逆になる。
    command: `node e2e/setup/reset-database.ts && pnpm exec next dev --port ${PORT}`,
    url: BASE_URL,

    // 前の走りが残したサーバーは掴まない。
    // 掴むと、作り直す前のデータベースへ繋いだままの相手を相手取ることになる。
    reuseExistingServer: false,

    // 既定の 60 秒では、作り直し（migration + シード）と dev サーバーの初回ビルドが積み上がったときに足りない。
    timeout: 120_000,

    env: {
      DATABASE_URL: E2E_DATABASE_URL,
      DIRECT_URL: E2E_DATABASE_URL,
      TOIITO_FAKE_AI: "1",
    },
  },
});
