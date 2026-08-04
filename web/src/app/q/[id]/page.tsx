import Link from "next/link";
import { notFound } from "next/navigation";
import { newSessionAction, speakAction } from "@/app/actions";
import {
  getQuestion,
  latestSession,
  listMessages,
  questionText,
  type Speaker,
} from "@/lib/db";

export const dynamic = "force-dynamic";

const SPEAKER_STYLE: Record<Speaker, { label: string; cls: string }> = {
  human: { label: "あなた", cls: "border-neutral-300 bg-white" },
  ai_a: { label: "具体", cls: "border-amber-200 bg-amber-50" },
  ai_b: { label: "抽象", cls: "border-sky-200 bg-sky-50" },
};

export default async function QuestionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const question = getQuestion(id);
  if (!question) notFound();

  const session = latestSession(id);
  if (!session) notFound();
  const messages = listMessages(session.id);

  const speak = speakAction.bind(null, question.id, session.id);
  const newSession = newSessionAction.bind(null, question.id);

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-10">
      <div className="flex items-baseline justify-between gap-4">
        <Link href="/" className="text-sm text-neutral-500 hover:underline">
          ← コンポスター
        </Link>
        <form action={newSession}>
          <button
            type="submit"
            className="text-sm text-neutral-500 hover:underline"
          >
            新しいセッションで再訪
          </button>
        </form>
      </div>

      <h1 className="mt-4 text-xl font-bold leading-relaxed">
        {questionText(question)}
      </h1>
      {question.current_form && (
        <p className="mt-2 border-l-2 border-neutral-300 pl-3 text-sm text-neutral-500">
          原型（不変）: {question.body}
        </p>
      )}
      <p className="mt-1 text-xs text-neutral-500">
        セッション開始: {session.started_at}
      </p>

      <div className="mt-8 space-y-4">
        {messages.map((m) => (
          <div
            key={m.id}
            className={`rounded border p-4 ${SPEAKER_STYLE[m.speaker].cls}`}
          >
            <div className="mb-1 text-xs font-bold text-neutral-500">
              {SPEAKER_STYLE[m.speaker].label}
            </div>
            <div className="whitespace-pre-wrap leading-relaxed">{m.body}</div>
          </div>
        ))}
        {messages.length === 0 && (
          <p className="text-sm text-neutral-500">
            まだ発話がない。問いについて口火を切ると、二体が応答する。
          </p>
        )}
      </div>

      <form action={speak} className="mt-8 flex flex-col gap-2">
        <textarea
          name="body"
          rows={3}
          placeholder="問いについて、いま思うことを"
          className="w-full rounded border border-neutral-300 px-3 py-2"
        />
        <button
          type="submit"
          className="self-end rounded bg-neutral-800 px-4 py-2 text-white hover:bg-neutral-700"
        >
          発話する（二体が応答するまで少し待つ）
        </button>
      </form>
    </main>
  );
}
