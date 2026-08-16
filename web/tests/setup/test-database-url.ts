/**
 * テスト専用データベースの接続先。
 *
 * 単独のモジュールに切ってあるのは読み込み順の都合。
 * vitest.config.ts はこの値を必要とするが、設定ファイル自身は `@` エイリアスを定義する側なので、
 * 読み込み時点ではまだ `@` が解決できない。
 * ここに import を足すと、その依存が設定の読み込み時に巻き込まれて壊れる。
 */

export const TEST_DATABASE_URL =
  process.env.TOIITO_TEST_DATABASE_URL ??
  "postgresql://toiito:toiito@localhost:5433/toiito_test";
