/**
 * 状態のピル。
 *
 * 地は 7 値とも一律で、先頭の点だけが開いているか閉じたかの一ビットを持つ（DESIGN.md「状態の見せ方」）。
 * 7 値を色で分けると一覧が処理待ちの列になり、`ARCHITECTURE.md`「意図的にやらないこと」の解決済みクローズフローを見た目の側から作ってしまう。
 */

import type { QuestionStatus } from "@/lib/question";

/**
 * 状態ごとの表示名と、開いているかどうか。
 * 意味の正は ARCHITECTURE.md「問いの状態機械」、語の正は VISION.md「語彙」節。
 *
 * 比喩を持つのはラベルだけで、値の側は一般語のまま動かない（`docs/adr/0017-status-value-set.md`）。
 * 値域を全網羅する型で受けているので、状態を増やすと最初にここが型で落ちる。
 */
const STATUS_FACE: Record<QuestionStatus, { label: string; isOpen: boolean }> =
  {
    new: { label: "仕込み中", isOpen: true },
    stocked: { label: "発酵", isOpen: true },
    holding: { label: "持ち続ける", isOpen: true },
    permanent: { label: "閉じない問い", isOpen: true },
    resolved: { label: "一旦閉じた", isOpen: false },
    exported: { label: "結晶した", isOpen: false },
    discarded: { label: "棄却", isOpen: false },
  };

/**
 * 状態のピル。
 * 点は読み上げから外す（開／閉はラベルの語が既に言っている）。
 */
export function Pill({ status }: { status: QuestionStatus }) {
  const { label, isOpen } = STATUS_FACE[status];

  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-surface-high px-2 py-1 text-meta text-ink-weak">
      <span
        aria-hidden="true"
        className={`size-1.5 rounded-full ${isOpen ? "bg-moss" : "bg-ink-weak"}`}
      />
      {label}
    </span>
  );
}
