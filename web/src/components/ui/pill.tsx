/**
 * 状態のピル。
 *
 * 背景色は 7 つの状態で共通にし、先頭の点の色だけが `isOpen` を表す（`.claude/rules/design.md`「状態の見せ方」）。
 * 状態ごとに色を分けると問いの一覧がタスクリストに見え、`docs/ARCHITECTURE.md`「意図的にやらないこと」が退けた解決済みクローズフローを見た目から作ることになる。
 */

import type { QuestionStatus } from "@/lib/question";

/**
 * 状態ごとの表示名と、開いているかどうか。
 * 意味の正は `docs/ARCHITECTURE.md`「問いの状態機械」、語の正は `docs/VISION.md`「語彙」節。
 *
 * 比喩を持つのはラベルだけで、値の側は一般語のまま動かない（`docs/adr/0017-status-value-set.md`）。
 * 値域を全網羅する型で受けているので、状態を増やすと最初に `STATUS_FACE` が型で落ちる。
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
