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

/**
 * `status` のうち、機械だけが書く値。
 * 人間が選べる値は、`QUESTION_STATUSES` からこの並びを除いた残りである。
 *
 * 書き手を値ごとに分ける理由は `docs/adr/0038-question-status-transitions.md`。
 */
const MACHINE_WRITTEN_STATUSES = [
  "new",
  "stocked",
] as const satisfies readonly QuestionStatus[];

/** 人間が対話画面で選べる `status` の値。 */
export type SelectableStatus = Exclude<
  QuestionStatus,
  (typeof MACHINE_WRITTEN_STATUSES)[number]
>;

/**
 * 人間が対話画面で選べる `status` の値の並び。
 * 順序は `QUESTION_STATUSES` に従う。
 */
export const SELECTABLE_STATUSES: readonly SelectableStatus[] =
  QUESTION_STATUSES.filter(
    (status): status is SelectableStatus =>
      !(MACHINE_WRITTEN_STATUSES as readonly QuestionStatus[]).includes(status),
  );

/**
 * `value` を、人間が選べる `status` として返す。
 * `SELECTABLE_STATUSES` に無い値（`new`・`stocked`・未知の文字列）なら throw する。
 */
export function parseSelectableStatus(value: string): SelectableStatus {
  const status = SELECTABLE_STATUSES.find((candidate) => candidate === value);

  if (!status) {
    throw new Error(`人間が選べる問いの状態に無い: ${JSON.stringify(value)}`);
  }

  return status;
}
