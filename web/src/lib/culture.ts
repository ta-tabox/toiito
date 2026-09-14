/**
 * 問いに付随する材料（`cultures` の行）のドメイン。
 * `kind` と `created_by` の値域と、値域から派生する判定を持つ。
 *
 * 行の読み書きは `db.ts` が持ち、`culture.ts` は DB に触らない。
 */

/**
 * 材料の種類。
 * `internal` は自分の過去の問いとメモ、`external` は外部の調査、`isomorph` は別領域と同じ形に見える候補を指す。
 *
 * DB の enum `CultureKind`（`prisma/schema.prisma`）と同じ並びなので、値を足すときは両方に足す。
 */
export const CULTURE_KINDS = ["internal", "external", "isomorph"] as const;

export type CultureKind = (typeof CULTURE_KINDS)[number];

/**
 * 材料を作った主体。
 * `auto` は AI が寄せた材料、`human` は人間が足した材料を指す。
 *
 * DB の enum `CultureCreator`（`prisma/schema.prisma`）と同じ並びなので、値を足すときは両方に足す。
 */
export const CULTURE_CREATORS = ["auto", "human"] as const;

export type CultureCreator = (typeof CULTURE_CREATORS)[number];

/** 外から来た文字列 `value` を `CultureKind` へ絞り込む。 */
export function isCultureKind(value: string): value is CultureKind {
  return (CULTURE_KINDS as readonly string[]).includes(value);
}
