/**
 * 問いのドメイン。値域と、値域から派生する判定をここに置く。
 * 型だけの器（types.ts）に実行時の値を混ぜないため、この一件は独立したモジュールにする。
 */

/**
 * 問いの状態。型・DB の enum・UI ラベルはここから派生する。
 * 各値の意味と 6 値である理由は ARCHITECTURE.md「問いの状態機械」。
 */
export const QUESTION_STATUSES = [
  "composting", // 投入済み。まだ材料が付いていない
  "fermented", // 材料（培地）が付き、蒸留に入れる
  "promoted", // 答えが結晶した（別の器へ書き出した）
  "open", // 持ち続ける問い。答えが出ないことは欠陥ではない
  "perennial", // 閉じないことが正しい問い。閉じ候補として催促しない
  "discarded", // 棄却
] as const;

export type QuestionStatus = (typeof QUESTION_STATUSES)[number];

/** 外から来た文字列を QuestionStatus へ絞り込む。DB へ渡す前の関門。 */
export function isQuestionStatus(value: string): value is QuestionStatus {
  return (QUESTION_STATUSES as readonly string[]).includes(value);
}
