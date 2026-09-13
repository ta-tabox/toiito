/**
 * E2E のサーバーが待ち受ける URL。
 *
 * 立てる側（`playwright.config.ts`）と、Origin を名乗って叩く側（`e2e/setup/sign-in.ts`）の両方が同じ値を要るので、決める場所を一つにする。
 * ポートを開発サーバー（3000）から離すのは、`pnpm dev` を止めずに E2E を走らせるため。
 */

/** 開発サーバーと衝突させないためのポート。 */
export const E2E_PORT = 3100;

/** E2E のサーバーの基点。 */
export const E2E_BASE_URL = `http://localhost:${E2E_PORT}`;
