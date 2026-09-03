/**
 * 入力欄。
 *
 * 既定は読みで、細い一行が本文の下で待つ（面も影も持たない）。
 * 触れた瞬間だけ書きの間へ移り、面と縁を得て主役になる（DESIGN.md「重心」）。
 * 読みの側を退かせるのは globals.css の `[data-recedes-while-writing]` で、退く範囲は画面ごとに決まるのでここは知らない。
 *
 * 枠は読みでも書きでも 1px を敷いたまま色だけを変える。
 * 幅を 0 から立ち上げると、触れた瞬間に行がずれて狙った位置を見失う。
 */

/**
 * 一行と複数行で共有する見た目。
 *
 * 字の大きさが 16px を下回らないのは、iOS Safari が 16px 未満の入力欄へフォーカスすると自動でズームし、書き手が選んだ倍率を捨てるため（issue #160）。
 */
const FIELD_STYLE =
  "w-full rounded border border-transparent border-b-rule bg-transparent px-3 py-2 text-field text-ink placeholder:text-ink-weak focus:border-moss focus:bg-surface-low focus:outline-hidden";

/** 一行の入力欄。 */
export function Field({
  className = "",
  ...props
}: React.ComponentProps<"input">) {
  return <input className={`${FIELD_STYLE} ${className}`} {...props} />;
}

/** 複数行の入力欄。 */
export function TextArea({
  className = "",
  ...props
}: React.ComponentProps<"textarea">) {
  return <textarea className={`${FIELD_STYLE} ${className}`} {...props} />;
}
