/**
 * E2E 専用データベースの接続先。
 *
 * vitest の `TOIITO_TEST_DATABASE_URL` とは別に分ける。
 * どちらも走る前に中身を作り直すので、同じ DB を向けると互いの行を踏む。
 */

import path from "node:path";

/**
 * E2E の接続先。
 *
 * CI や別ポートの Postgres へ向けるときだけ環境変数で上書きする。
 */
export const E2E_DATABASE_URL =
  process.env.TOIITO_E2E_DATABASE_URL ??
  "postgresql://toiito:toiito@localhost:5433/toiito_e2e";

/**
 * E2E の準備は接続先をデータベースごと落として作り直す。
 * 開発用やテスト用を指したまま走らせたら中身が消えるので、名前で足を止める。
 *
 * 呼ぶのは接続先へ書きに行く前。
 */
export function assertIsE2eDatabase(url: string): void {
  const name = path.basename(new URL(url).pathname);

  if (!name.endsWith("_e2e")) {
    throw new Error(
      `E2E 用 DB の名前が _e2e で終わっていない: ${name}。作り直しは中止する`,
    );
  }
}
