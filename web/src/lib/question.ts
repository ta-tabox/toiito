/**
 * 問いのドメイン。
 * 値域と、値域から派生する判定を `question.ts` に置く。
 * 型だけを置くモジュール（types.ts）に実行時の値を混ぜないため、この一件は独立したモジュールにする。
 */

/**
 * 問いの状態。
 * 型・DB の enum・UI ラベルは `QUESTION_STATUSES` から派生する。
 * 各値の意味と 7 値である理由は docs/ARCHITECTURE.md「問いの状態機械」。
 *
 * 値は比喩を持たない一般語で持つ（`docs/adr/0017-status-value-set.md`）。
 * 比喩を担うのは表示側のラベルだけなので、`QUESTION_STATUSES` へ比喩由来の語を足さない。
 */
export const QUESTION_STATUSES = [
  "new",
  "stocked",
  "resolved",
  "exported",
  "holding",
  "permanent",
  "discarded",
] as const;

export type QuestionStatus = (typeof QUESTION_STATUSES)[number];

/**
 * 外から来た文字列を QuestionStatus へ絞り込む。
 * DB へ渡す前の検証。
 */
export function isQuestionStatus(value: string): value is QuestionStatus {
  return (QUESTION_STATUSES as readonly string[]).includes(value);
}
