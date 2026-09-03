/**
 * E2E 専用データベースの接続先。
 *
 * vitest の `TOIITO_TEST_DATABASE_URL` とは別に分ける。
 * どちらも走る前に中身を作り直すので、同じ DB を向けると互いの行を踏む。
 *
 * ここが接続先を決める唯一の口。
 * 作り直しの側（reset-database.ts）へは playwright.config.ts が env で渡す。
 */

import path from "node:path";

/**
 * E2E が共有する唯一のデータベース名。
 *
 * worktree ごとに名前を派生させるのは vitest 側だけで、E2E はこの一本を共有する（HARNESS.md「E2E（L4）」）。
 * 派生させると worktree が消えた後も誰も落とさない DB が残るので、名前を分ける口は開けない。
 */
const DATABASE_NAME = "toiito_e2e";

/** 手元の Postgres（`compose.yaml`）を向く既定。 */
const DEFAULT_URL = `postgresql://toiito:toiito@localhost:5433/${DATABASE_NAME}`;

/**
 * 上書きを検査して接続先を決める。
 *
 * 通すのはサーバーの側（ホスト・ポート・資格情報）を変える上書きだけである。
 * データベース名を変える上書きは共有一本を破る唯一の経路なので、ここで止める。
 */
export function resolveE2eDatabaseUrl(override: string | undefined): string {
  if (override === undefined) {
    return DEFAULT_URL;
  }

  const name = path.basename(new URL(override).pathname);

  if (name !== DATABASE_NAME) {
    throw new Error(
      `TOIITO_E2E_DATABASE_URL のデータベース名が ${DATABASE_NAME} でない: ${name}。この環境変数は接続先のサーバーを変えるための口であって、worktree ごとに名前を分けるための口ではない（HARNESS.md「E2E（L4）」）`,
    );
  }

  return override;
}

/**
 * E2E の接続先。
 *
 * CI や別ポートの Postgres へ向けるときだけ環境変数で上書きする。
 */
export const E2E_DATABASE_URL = resolveE2eDatabaseUrl(
  process.env.TOIITO_E2E_DATABASE_URL,
);
