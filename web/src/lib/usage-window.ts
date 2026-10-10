/**
 * 管理の画面で AI の利用量を集計する期間の長さと、その起点を現在時刻から求める純関数を置く。
 */

/** 利用量を集計する期間の日数。 */
export const USAGE_WINDOW_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 現在時刻（`now`）から `USAGE_WINDOW_DAYS` 日さかのぼった瞬間を、集計の起点として返す。
 *
 * 暦の日付の境目には揃えず、`now` からの経過時間で区切る。
 */
export function usageWindowStartOf(now: Date): Date {
  return new Date(now.getTime() - USAGE_WINDOW_DAYS * DAY_MS);
}
