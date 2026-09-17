/**
 * チェックアウト（リポジトリ本体か worktree）ごとに分ける、手元の Postgres のデータベース名を導く関数を置く。
 * 環境変数の読み取りは持たず、`checkout-environment.ts` と `tests/setup/test-database-url.ts` が持つ。
 *
 * `vitest.config.ts` が `tests/setup/test-database-url.ts` を通してこのモジュールを読み、その時点ではまだ `@` が解決できない。
 * import してよいのは node の組み込みだけである。
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/**
 * worktree から派生した名前だけに付く接頭辞。
 *
 * 掃除（`prune-test-databases.ts`）は現存の worktree と突き合わせて孤児を削除するので、手で指した DB と見分けが付かないと、使っている最中のものを削除する。
 */
export const DERIVED_PREFIX = "toiito_wt_";

/** リポジトリ本体の開発用データベース（`compose.yaml` が最初に作るもの）。 */
const DEVELOPMENT_DATABASE_NAME = "toiito";

/** テスト用の名前に付ける接尾辞（`tests/setup/test-database-url.ts` の `assertIsTestDatabase` が見る）。 */
const TEST_SUFFIX = "_test";

/**
 * スラグに使える長さ。
 *
 * PostgreSQL の識別子は 63 バイトで、`toiito_wt_` と `_test` が 15 バイトを取る。
 */
const MAX_SLUG_LENGTH = 48;

/** 手元の Postgres（`compose.yaml`）の接続先のうち、データベース名より前の部分。 */
const LOCAL_SERVER_URL = "postgresql://toiito:toiito@localhost:5433";

/**
 * 英数字を一つも持たない名前の代わりに使う短縮ハッシュ。
 *
 * 日本語だけのディレクトリ名は潰すと何も残らず、どれも同じ名前の DB を指してしまう。
 * 読める名前を諦めてでも別々の DB を向ける方を採るのは、隔離が消えると汚染が黙って戻るため。
 */
function hashedSlug(name: string): string {
  return crypto.createHash("sha256").update(name).digest("hex").slice(0, 8);
}

/**
 * ディレクトリ名を、引用符なしで接続 URL へ書けるデータベース名の部品（英小文字・数字・`_`）へ均す。
 * `MAX_SLUG_LENGTH` を超えたら先頭側を切り捨て、空は返さない。
 *
 * worktree 名は末尾に一意の接尾辞を持つので、末尾側を切り捨てると別の worktree と同じ名前になる。
 * 呼ぶ側は前後に `toiito_wt_` と `_test` を繋いだ名前を作るので、空を返すと `prune-test-databases.ts` が派生名として見分けられなくなる。
 */
export function toDatabaseSlug(name: string): string {
  const normalized = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  if (normalized === "") {
    return hashedSlug(name);
  }

  return normalized.slice(-MAX_SLUG_LENGTH).replace(/^_+/, "");
}

/**
 * `root` のチェックアウトが worktree かどうかを返す。
 *
 * git は worktree の `.git` を、本体の gitdir を指すファイルにする。
 * 名前や配置に依存しない判定は `.git` の種類しかない。
 */
export function isWorktree(root: string): boolean {
  try {
    return fs.statSync(path.join(root, ".git")).isFile();
  } catch {
    return false;
  }
}

/**
 * `root` が worktree なら、開発用とテスト用に共通の派生名（`toiito_wt_<スラグ>`）を返し、本体なら undefined を返す。
 */
function derivedNameOf(root: string): string | undefined {
  if (!isWorktree(root)) {
    return undefined;
  }

  return `${DERIVED_PREFIX}${toDatabaseSlug(path.basename(root))}`;
}

/**
 * `root` のチェックアウトが使う開発用データベースの名前を返す。
 *
 * worktree ごとに分けるのは、本体の開発用 DB に手で入れた行が載っており、worktree の migration をそこへ積ませないため。
 */
export function developmentDatabaseName(root: string): string {
  return derivedNameOf(root) ?? DEVELOPMENT_DATABASE_NAME;
}

/**
 * `root` のチェックアウトが使うテスト用データベースの名前を返す。
 *
 * worktree ごとに分けるのは、走り間の作り直し（`tests/setup/database.ts`）が防ぐのがブランチを跨ぐ汚染までだから。
 * 同時に走る別の worktree とは、名前で分かれていないと互いのテーブルを空にし合う。
 */
export function testDatabaseName(root: string): string {
  return `${derivedNameOf(root) ?? DEVELOPMENT_DATABASE_NAME}${TEST_SUFFIX}`;
}

/** 手元の Postgres の、データベース `name` への接続先を返す。 */
export function localDatabaseUrl(name: string): string {
  return `${LOCAL_SERVER_URL}/${name}`;
}
