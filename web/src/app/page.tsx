/**
 * 発酵槽の入口画面。
 * 問いの投入フォームと、投入済みの問いの一覧。
 *
 * 表示に要る整形だけを持ち、状態遷移や絞り込みは lib 側へ置く。
 * 状態のラベルは値域（question.ts）を全網羅する型で受けている。
 * 状態を増やすと最初にここが型で落ちるので、ラベルの付け忘れが構文で止まる。
 */

import Link from "next/link";
import { createQuestionAction } from "@/app/actions";
import { listQuestions, questionText } from "@/lib/db";
import { formatTimestamp } from "@/lib/format";
import type { QuestionStatus } from "@/lib/question";

export const dynamic = "force-dynamic";

/**
 * 状態の表示名。
 * 意味の正は ARCHITECTURE.md「問いの状態機械」、語の正は VISION.md「語彙」節。
 *
 * 比喩を持つのはこのラベルだけで、値の側は一般語のまま動かない（`docs/adr/0017-status-value-set.md`）。
 */
const STATUS_LABEL: Record<QuestionStatus, string> = {
  new: "仕込み中",
  stocked: "発酵",
  resolved: "一旦閉じた",
  exported: "結晶した",
  holding: "持ち続ける",
  permanent: "閉じない問い",
  discarded: "棄却",
};

/**
 * 発酵槽の入口。
 * 投入フォームと問いの一覧。
 */
export default async function Home() {
  const questions = await listQuestions();

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-10">
      <h1 className="text-2xl font-bold tracking-wide">
        toiito{" "}
        <span className="text-sm font-normal text-neutral-500">
          問いの発酵槽
        </span>
      </h1>

      <Link
        href="/memos"
        className="mt-2 inline-block text-sm text-neutral-500 hover:underline"
      >
        メモ一覧 →
      </Link>

      <form action={createQuestionAction} className="mt-8 flex gap-2">
        <input
          name="body"
          placeholder="問いをポイっと"
          className="flex-1 rounded border border-neutral-300 px-3 py-2"
          autoComplete="off"
        />
        <button
          type="submit"
          className="rounded bg-neutral-800 px-4 py-2 text-white hover:bg-neutral-700"
        >
          仕込む
        </button>
      </form>

      <ul className="mt-10 space-y-3">
        {questions.map((q) => (
          <li key={q.id}>
            <Link
              href={`/q/${q.id}`}
              className="block rounded border border-neutral-200 p-4 hover:border-neutral-400"
            >
              <div className="text-base">{questionText(q)}</div>
              {q.current_form && (
                <div className="mt-1 text-xs text-neutral-400">
                  原型: {q.body}
                </div>
              )}
              <div className="mt-1 text-xs text-neutral-500">
                {STATUS_LABEL[q.status]} · {formatTimestamp(q.created_at)}
              </div>
            </Link>
          </li>
        ))}
        {questions.length === 0 && (
          <li className="text-sm text-neutral-500">
            まだ何も入っていない。最初の問いを投げ入れるところから。
          </li>
        )}
      </ul>
    </main>
  );
}
