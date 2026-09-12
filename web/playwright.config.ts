/**
 * ブラウザ実挙動を見る Playwright の設定。
 *
 * 見るのは `e2e/` の spec だけで、型検査・lint・単体テスト・ビルドは `pnpm check` が持つ。
 * AI 呼び出しはフェイクモードに固定し、実 API を自動テストで叩かない（docs/HARNESS.md「AI フェイクモード」）。
 * サインインも Google を経ない経路に固定する（`TOIITO_FAKE_LOGIN=1`）。
 * 実 OAuth では二人分のサインインを自動化できず、Google の同意画面を通す往復はこのアプリのコードではない（docs/adr/0033-login-and-fake-sign-in.md 決定 1）。
 *
 * 接続先とサーバーは開発用から三重に離す（データベース `toiito_e2e`・ポート 3100・出力先 `.next-e2e`）。
 * 出力先まで分けるのは、next dev の二重起動検知が `.next/dev/lock` 一つを見ており、ポートを分けただけでは `pnpm dev` と衝突するため。
 *
 * **Vercel のランタイム差は再現しない**。
 * next dev も next start も Node で走るので、Edge でだけ環境変数が読めない類の失敗は Playwright では出ない（本番そのものを叩く確認は `docs/DEPLOY.md`「ログイン」）。
 */

import { E2E_BASE_URL, E2E_PORT } from "@e2e/setup/base-url";
import { E2E_DATABASE_URL } from "@e2e/setup/e2e-database-url";
import { defineConfig, devices } from "@playwright/test";
import { SEED_USERS } from "@scripts/seed/users";

/**
 * 開発サーバーと分けるビルド出力先。
 * next.config.ts が TOIITO_DIST_DIR として受け取る。
 */
const DIST_DIR = ".next-e2e";

/**
 * E2E のサーバーがセッションのトークンの署名に使う秘密。
 *
 * 本番の値とは関係が無い。
 * Better Auth は 32 文字未満だと警告を出すので、長さだけ満たしておく。
 */
const AUTH_SECRET = "e2e-の秘密-の-ことば-0123456789abcdef-0123456789";

export default defineConfig({
  testDir: "./e2e",

  // 一つのデータベースを共有するので直列に走らせる（vitest の fileParallelism: false と同じ理由）。
  workers: 1,

  reporter: "list",

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], baseURL: E2E_BASE_URL },
    },
  ],

  webServer: [
    {
      // データベースの作り直しを dev サーバーの起動と同じ一本に繋ぐ。
      // Playwright は webServer をプラグインとして globalSetup より先に立ち上げるので、globalSetup へ置くと順序が逆になる。
      // 接続先は env で渡す（作り直す側はそれを読むだけで、決める場所をもう一つ持たない）。
      command: `node e2e/setup/reset-database.ts && pnpm exec next dev --port ${E2E_PORT}`,
      url: E2E_BASE_URL,

      // 前の走りが残したサーバーは掴まない。
      // 掴むと、作り直す前のデータベースへ繋いだままの相手を相手取ることになる。
      reuseExistingServer: false,

      // 既定の 60 秒では、作り直し（migration + シード）と dev サーバーの初回ビルドが積み上がったときに足りない。
      timeout: 120_000,

      env: {
        DATABASE_URL: E2E_DATABASE_URL,
        DIRECT_URL: E2E_DATABASE_URL,
        TOIITO_DIST_DIR: DIST_DIR,
        TOIITO_FAKE_AI: "1",

        BETTER_AUTH_SECRET: AUTH_SECRET,
        TOIITO_FAKE_LOGIN: "1",

        // 基点を明示しないと、Better Auth は信頼する origin をリクエストのヘッダから決める。
        // 別 origin を名乗る POST が拒まれることを見る spec があるので、ここは固定する。
        BETTER_AUTH_URL: E2E_BASE_URL,

        // シードの二人ともサインインできるようにする。
        // 二人目が入れないと、他人の問いが見えないことを二人分のセッションで確かめられない。
        TOIITO_ALLOWED_EMAILS: SEED_USERS.map((user) => user.email).join(","),
      },
    },
  ],
});
