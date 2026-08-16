import Link from "next/link";
import { createQuestionAction } from "@/app/actions";
import { listQuestions, questionText } from "@/lib/db";

export const dynamic = "force-dynamic";

// 意味の正は ARCHITECTURE.md「問いの状態機械」
const STATUS_LABEL: Record<string, string> = {
  composting: "堆肥化中",
  fermented: "発酵",
  promoted: "結晶した",
  open: "持ち続ける",
  perennial: "閉じない問い",
  discarded: "棄却",
};

export default function Home() {
  const questions = listQuestions();

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-10">
      <h1 className="text-2xl font-bold tracking-wide">
        toiito{" "}
        <span className="text-sm font-normal text-neutral-500">
          問いのコンポスター
        </span>
      </h1>

      <form action={createQuestionAction} className="mt-8 flex gap-2">
        <input
          name="body"
          placeholder="問いをポイっと投げ入れる"
          className="flex-1 rounded border border-neutral-300 px-3 py-2"
          autoComplete="off"
        />
        <button
          type="submit"
          className="rounded bg-neutral-800 px-4 py-2 text-white hover:bg-neutral-700"
        >
          投入
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
                {STATUS_LABEL[q.status] ?? q.status} · {q.created_at}
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
