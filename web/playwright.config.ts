/**
 * L4（ブラウザ実挙動）の設定。
 *
 * 見るのは `e2e/` の spec だけで、L0〜L3 は `pnpm check` の側が持つ。
 * AI 呼び出しはフェイクモードに固定する（HARNESS.md「AI フェイクモード」）。
 * 実 API を自動テストで叩かない。
 *
 * 接続先とサーバーは開発用から三重に離す。
 * データベースは専用の `toiito_e2e`、口は 3100、出力先は `.next-e2e`。
 * 出力先まで分けるのは、next dev の二重起動検知が `.next/dev/lock` 一つを見ており、口を分けただけでは `pnpm dev` と衝突するため。
 *
 * サーバーは二本立てる。
 * 既定の一本は資格情報を持たないのでアクセス制限が掛からず、縦一本の spec がそれまでどおり走る。
 * もう一本だけが資格情報を持ち、`basic-auth.spec.ts` がそちらを叩く（同じサーバーで両方は見られない）。
 *
 * **この層は Vercel のランタイム差を再現しない**。
 * next dev も next start も Node で走るので、Edge でだけ環境変数が読めない類の失敗はここに出ない。
 * 本番そのものを叩く確認は `DEPLOY.md`「アクセス制限」が持つ。
 */

import { BASIC_AUTH } from "@e2e/setup/basic-auth-credentials";
import { E2E_DATABASE_URL } from "@e2e/setup/e2e-database-url";
import { defineConfig, devices } from "@playwright/test";
import { SEED_USERS } from "@scripts/seed/users";

/** 開発サーバー（3000）と衝突させないための口。 */
const PORT = 3100;

/**
 * 開発サーバーと分けるビルド出力先。
 * next.config.ts が TOIITO_DIST_DIR として受け取る。
 */
const DIST_DIR = ".next-e2e";

const BASE_URL = `http://localhost:${PORT}`;

/** アクセス制限を掛けたサーバーの口。 */
const AUTH_PORT = 3101;

/** そのサーバーのビルド出力先（口だけ分けても next dev の二重起動検知に掛かる）。 */
const AUTH_DIST_DIR = ".next-e2e-auth";

const AUTH_BASE_URL = `http://localhost:${AUTH_PORT}`;

/** 二本のサーバーが共通で要る env。 */
const SERVER_ENV = {
  DATABASE_URL: E2E_DATABASE_URL,
  DIRECT_URL: E2E_DATABASE_URL,
  TOIITO_FAKE_AI: "1",

  // 認証はまだ無いので、現在の利用者はシードの一人目に固定する（docs/adr/0019-auth-better-auth.md 決定 7）。
  TOIITO_FAKE_USER_EMAIL: SEED_USERS[0].email,
};

export default defineConfig({
  testDir: "./e2e",

  // 一つのデータベースを共有するので直列に走らせる（vitest の fileParallelism: false と同じ理由）。
  workers: 1,

  reporter: "list",

  projects: [
    {
      name: "chromium",
      testIgnore: /basic-auth\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], baseURL: BASE_URL },
    },
    {
      name: "basic-auth",
      testMatch: /basic-auth\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], baseURL: AUTH_BASE_URL },
    },
  ],

  webServer: [
    {
      // データベースの作り直しを dev サーバーの起動と同じ一本に繋ぐ。
      // Playwright は webServer をプラグインとして globalSetup より先に立ち上げるので、globalSetup へ置くと順序が逆になる。
      // 接続先は env で渡す（作り直す側はそれを読むだけで、決める口をもう一つ持たない）。
      command: `node e2e/setup/reset-database.ts && pnpm exec next dev --port ${PORT}`,
      url: BASE_URL,

      // 前の走りが残したサーバーは掴まない。
      // 掴むと、作り直す前のデータベースへ繋いだままの相手を相手取ることになる。
      reuseExistingServer: false,

      // 既定の 60 秒では、作り直し（migration + シード）と dev サーバーの初回ビルドが積み上がったときに足りない。
      timeout: 120_000,

      env: { ...SERVER_ENV, TOIITO_DIST_DIR: DIST_DIR },
    },
    {
      // こちらはデータベースを作り直さない。
      // 二本が同じ `toiito_e2e` を同時に作り直すと、互いの足元を落とすことになる。
      command: `pnpm exec next dev --port ${AUTH_PORT}`,
      url: AUTH_BASE_URL,
      reuseExistingServer: false,
      timeout: 120_000,

      env: {
        ...SERVER_ENV,
        TOIITO_DIST_DIR: AUTH_DIST_DIR,
        TOIITO_BASIC_AUTH_USER: BASIC_AUTH.user,
        TOIITO_BASIC_AUTH_PASSWORD: BASIC_AUTH.password,
      },
    },
  ],
});
