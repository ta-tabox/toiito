/**
 * テスト専用データベースの接続先。
 *
 * 単独のモジュールに切ってあるのは読み込み順の都合。
 * vitest.config.ts はこの値を必要とするが、設定ファイル自身は `@` エイリアスを定義する側なので、読み込み時点ではまだ `@` が解決できない。
 * ここに import を足すと、その依存が設定の読み込み時に巻き込まれて壊れる。
 */

import path from "node:path";

export const TEST_DATABASE_URL =
  process.env.TOIITO_TEST_DATABASE_URL ??
  "postgresql://toiito:toiito@localhost:5433/toiito_test";

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
