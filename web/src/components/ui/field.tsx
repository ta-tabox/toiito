/**
 * 入力欄。
 *
 * フォーカスされていない入力欄は下辺の枠線だけを持ち、背景も影も持たない（`.claude/rules/design.md`「重心」）。
 * フォーカスすると背景が付き、枠線が全周へ回る。
 * フォーカス中に周囲を退かせるのは `globals.css` の `[data-recedes-while-writing]` で、退く範囲は画面ごとに決まるので `Field` は知らない。
 *
 * 枠線はフォーカスの有無に依らず 1px を敷いたまま、色だけを変える。
 * 幅を 0 から立ち上げると、フォーカスした瞬間に行がずれて狙った位置を見失う。
 */

/**
 * `Field` と `TextArea` で共有する見た目。
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
