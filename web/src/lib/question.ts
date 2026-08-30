/**
 * 問いのドメイン。
 * 値域と、値域から派生する判定をここに置く。
 * 型だけを置くモジュール（types.ts）に実行時の値を混ぜないため、この一件は独立したモジュールにする。
 */

/**
 * 問いの状態。
 * 型・DB の enum・UI ラベルはここから派生する。
 * 各値の意味と 7 値である理由は ARCHITECTURE.md「問いの状態機械」。
 *
 * 値は比喩を持たない一般語で持つ（`docs/adr/0017-status-value-set.md`）。
 * 比喩を担うのは表示側のラベルだけなので、ここへ比喩由来の語を足さない。
 */
export const QUESTION_STATUSES = [
  "new", // 仕込んだが、まだ材料が付いていない
  "stocked", // 材料が付き、蒸留に入れる
  "resolved", // 答えが出て閉じた。別の置き場へは書き出していない
  "exported", // 答えが出て、別の置き場へ書き出した
  "holding", // 持ち続ける問い。答えが出ないことは欠陥ではない
  "permanent", // 閉じないことが正しい問い。閉じ候補として催促しない
  "discarded", // 棄却
] as const;

export type QuestionStatus = (typeof QUESTION_STATUSES)[number];

/**
 * 外から来た文字列を QuestionStatus へ絞り込む。
 * DB へ渡す前の関門。
 */
export function isQuestionStatus(value: string): value is QuestionStatus {
  return (QUESTION_STATUSES as readonly string[]).includes(value);
}
