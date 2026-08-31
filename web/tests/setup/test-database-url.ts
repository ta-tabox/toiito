/**
 * テスト専用データベースの接続先。
 *
 * 単独のモジュールに切ってあるのは読み込み順の都合。
 * vitest.config.ts はこの値を必要とするが、設定ファイル自身は `@` エイリアスを定義する側なので、読み込み時点ではまだ `@` が解決できない。
 * ここに import を足すと、その依存が設定の読み込み時に巻き込まれて壊れる。
 * 足してよいのは node の組み込みだけ。
 */

import fs from "node:fs";
import path from "node:path";

/** リポジトリ本体（worktree でない側）が使うデータベース。 */
const DEFAULT_DATABASE_NAME = "toiito_test";

/**
 * worktree から派生した名前だけに付く印。
 *
 * 掃除（`scripts/prune-test-databases.ts`）は現存の worktree と突き合わせて孤児を落とすので、手で `TOIITO_TEST_DATABASE_URL` を指した DB と見分けが付かないと、使っている最中のものを落とす。
 */
const DERIVED_PREFIX = "toiito_wt_";

/**
 * スラグに使える長さ。
 *
 * PostgreSQL の識別子は 63 バイトで、`toiito_wt_` と `_test` が 15 バイトを取る。
 */
const MAX_SLUG_LENGTH = 48;

const repositoryRoot = path.resolve(import.meta.dirname, "../../..");

/**
 * ディレクトリ名をデータベース名の部品へ均す。
 *
 * 英数字以外をすべて `_` へ潰す。
 * worktree 名にはハイフンも大文字も入りうるが、引用符なしで接続 URL へ書ける綴りに寄せる。
 *
 * 上限を超えたときに落とすのは先頭側。
 * worktree 名は末尾に一意の接尾辞を持つので、頭を残して尻を切ると別の worktree と同じ名前になる。
 */
export function toDatabaseSlug(name: string): string {
  const normalized = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return normalized.slice(-MAX_SLUG_LENGTH).replace(/^_+/, "");
}

/**
 * このチェックアウトが worktree かどうか。
 *
 * git は worktree の `.git` を、本体の gitdir を指すファイルにする。
 * 名前や配置に依存しない判定はここしかない。
 */
function isWorktree(root: string): boolean {
  try {
    return fs.statSync(path.join(root, ".git")).isFile();
  } catch {
    return false;
  }
}

/**
 * このチェックアウトが使うテスト用データベースの名前。
 *
 * worktree ごとに分けるのは、走り間の作り直し（`database.ts`）が防ぐのがブランチを跨ぐ汚染までだから。
 * 同時に走る別の worktree とは、名前で分かれていないと互いのテーブルを空にし合う。
 */
export function testDatabaseName(root: string): string {
  if (!isWorktree(root)) {
    return DEFAULT_DATABASE_NAME;
  }

  return `${DERIVED_PREFIX}${toDatabaseSlug(path.basename(root))}_test`;
}

/**
 * テストの接続先。
 *
 * CI や別ポートの Postgres へ向けるときだけ環境変数で上書きする。
 * 上書きが勝つので、worktree からの派生は既定にすぎない。
 */
export const TEST_DATABASE_URL =
  process.env.TOIITO_TEST_DATABASE_URL ??
  `postgresql://toiito:toiito@localhost:5433/${testDatabaseName(repositoryRoot)}`;

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
