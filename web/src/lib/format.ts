/**
 * 画面表示のための文字列化。
 * DB にもドメイン型にも依存しない純関数だけを置く。
 */

/**
 * タイムゾーンを JST に固定する。
 * サーバーの実行場所（ローカル / Neon のリージョン / CI）で表示がずれると、対話の時刻の間隔が実際と違って見える。
 */
const TIMESTAMP = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Asia/Tokyo",
  dateStyle: "short",
  timeStyle: "short",
});

/** 問いの投入時刻・セッション開始時刻の表示形（`2026-07-17 22:08`）。 */
export function formatTimestamp(at: Date): string {
  return TIMESTAMP.format(at);
}
