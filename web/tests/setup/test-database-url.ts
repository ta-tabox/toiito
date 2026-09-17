/**
 * テスト専用データベースの接続先と、その接続先だけを書き換えてよいことの検証を置く。
 * 名前の導出は持たず、`scripts/checkout-database.ts` が持つ。
 *
 * `vitest.config.ts` はこの値を必要とするが、設定ファイル自身は `@` エイリアスを定義する側なので、読み込み時点ではまだ `@` が解決できない。
 * このモジュールと `checkout-database.ts` に足してよい import は node の組み込みだけである。
 */

import path from "node:path";
import {
  localDatabaseUrl,
  testDatabaseName,
} from "../../scripts/checkout-database.ts";

const repositoryRoot = path.resolve(import.meta.dirname, "../../..");

/**
 * テストの接続先。
 *
 * CI や別ポートの Postgres へ向けるときだけ環境変数で上書きする。
 * 上書きが勝つので、worktree からの派生は既定にすぎない。
 */
export const TEST_DATABASE_URL =
  process.env.TOIITO_TEST_DATABASE_URL ??
  localDatabaseUrl(testDatabaseName(repositoryRoot));

/**
 * データベースを削除するときに経由する接続先。
 *
 * データベースは自分自身へ繋いだまま削除できないので、同じサーバーの `postgres` を指す。
 */
export function adminUrl(url: string): string {
  const admin = new URL(url);
  admin.pathname = "/postgres";

  return admin.toString();
}

/**
 * テストの準備は接続先を問答無用で作り替える。
 * 開発用 DB を指したまま走らせたら手元の対話が消えるので、名前で足を止める。
 *
 * 呼ぶのは接続先へ書きに行く前。
 * truncate だけでなく migration を積む側も通す。
 */
export function assertIsTestDatabase(url: string): void {
  const name = path.basename(new URL(url).pathname);

  if (!name.endsWith("_test")) {
    throw new Error(
      `テスト用 DB の名前が _test で終わっていない: ${name}。作り直しは中止する`,
    );
  }
}
