/**
 * ボタン。
 *
 * 態は実（緑の塗り）と淡（罫だけ）の二つで、三つ目を足さない（DESIGN.md「部品の型」）。
 * 濃い緑を敷けるのはボタンだけで、発話の面へ回すと地との落差が出すぎて塊になる。
 *
 * 画面遷移する導線はここを通さない。
 * ボタンの見た目を持つリンクは、押した先が戻れるかどうかを見た目から隠す。
 */

/** 面の持ち方。 */
type Tone = "solid" | "quiet";

const TONE_STYLE: Record<Tone, string> = {
  solid:
    "bg-moss-solid text-on-moss hover:opacity-90 disabled:bg-surface-high disabled:text-ink-weak disabled:hover:opacity-100",
  quiet: "border border-rule text-ink-weak hover:border-moss",
};

/**
 * ボタン。
 * 既定は淡で、その画面でいちばん進める一手だけを実にする。
 */
export function Button({
  tone = "quiet",
  className = "",
  ...props
}: { tone?: Tone } & React.ComponentProps<"button">) {
  return (
    <button
      className={`rounded px-4 py-2 text-aux ${TONE_STYLE[tone]} ${className}`}
      {...props}
    />
  );
}
