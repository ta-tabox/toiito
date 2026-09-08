/**
 * ボタン。
 *
 * `tone` は `solid`（緑の塗り）と `quiet`（枠線だけ）の二つで、三つ目を足さない（`.claude/rules/design.md`「部品の型」）。
 * 濃い緑の背景を使ってよいのはボタンだけで、発話の吹き出しへ広げると背景との明度差が大きすぎて読みにくくなる。
 *
 * 画面遷移するリンクは `Button` を通さない。
 * ボタンの見た目を持つリンクは、押した先が戻れるかどうかを見た目から隠す。
 */

/** ボタンの背景の持ち方。 */
type Tone = "solid" | "quiet";

const TONE_STYLE: Record<Tone, string> = {
  solid:
    "bg-moss-solid text-on-moss hover:opacity-90 disabled:bg-surface-high disabled:text-ink-weak disabled:hover:opacity-100",
  quiet: "border border-rule text-ink-weak hover:border-moss",
};

/**
 * ボタン。
 * 既定は `quiet` で、その画面でいちばん主要な操作だけを `solid` にする。
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
