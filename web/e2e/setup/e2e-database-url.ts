/**
 * E2E 専用データベースの接続先。
 *
 * vitest の `TOIITO_TEST_DATABASE_URL` とは別に分ける。
 * どちらも走る前に中身を作り直すので、同じ DB を向けると互いの行を踏む。
 *
 * ここが接続先を決める唯一の口。
 * 作り直しの側（reset-database.ts）へは playwright.config.ts が env で渡す。
 */

/**
 * E2E の接続先。
 *
 * CI や別ポートの Postgres へ向けるときだけ環境変数で上書きする。
 */
export const E2E_DATABASE_URL =
  process.env.TOIITO_E2E_DATABASE_URL ??
  "postgresql://toiito:toiito@localhost:5433/toiito_e2e";
