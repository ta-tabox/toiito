// 画面表示のための文字列化。DB にもドメイン型にも依存しない純関数。

// タイムゾーンを JST に固定する。
// サーバーの居場所（ローカル / Neon のリージョン / CI）で表示がずれると、堆積した対話の間隔が嘘になる。
const TIMESTAMP = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Asia/Tokyo",
  dateStyle: "short",
  timeStyle: "short",
});

/** 問いの投入時刻・セッション開始時刻の表示形（`2026-07-17 22:08`）。 */
export function formatTimestamp(at: Date): string {
  return TIMESTAMP.format(at);
}
