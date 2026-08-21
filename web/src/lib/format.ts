/**
 * 画面表示のための文字列化。
 * DB にもドメイン型にも依存しない純関数だけを置く。
 */

/**
 * タイムゾーンを JST に固定する。
 * サーバーの居場所（ローカル / Neon のリージョン / CI）で表示がずれると、堆積した対話の間隔が嘘になる。
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

/** 問いを投げてからの経過日数の表示形（`3 日前`）。 */
export function formatElapsedDays(from: Date, now: Date): string {
  const days = Math.floor(
    (now.getTime() - from.getTime()) / (1000 * 60 * 60 * 24),
  );
  if (days === 0) {
    return "今日";
  }
  return `${days} 日前`;
}
