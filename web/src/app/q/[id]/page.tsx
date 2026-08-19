/**
 * 一つの問いの対話画面。
 * 三者（人間・具体・抽象）の発話を時系列で並べ、次の一手を受け取る。
 *
 * 表示するのは最新セッションだけで、過去セッションの閲覧はここが引き受けない。
 * 発話の生成と永続化は Server Action と lib の領分。
 * 本文の描画と選択からのメモ作成は MessageBody の領分。
 * ここは並べて描くところまで。
 *
 * 各発話に付ける id="msg-<message_id>" は逆引き（/memos）の着地点。
 * 綴りは /memos が組み立てるリンクと globals.css の [id^="msg-"]:target が共有しているので、変えるならその三箇所とも直す。
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import { createMemoAction, newSessionAction, speakAction } from "@/app/actions";
import { MessageBody } from "@/components/message-body";
import { SpeakForm } from "@/components/speak-form";
import {
  getQuestion,
  latestSession,
  listMemosForSession,
  listMessages,
  questionText,
} from "@/lib/db";
import { formatTimestamp } from "@/lib/format";
import { PERSONA_LABEL } from "@/lib/personas";
import type { Speaker } from "@/lib/types";

export const dynamic = "force-dynamic";

const SPEAKER_STYLE: Record<Speaker, { label: string; cls: string }> = {
  human: { label: "あなた", cls: "border-neutral-300 bg-white" },
  ai_a: { label: PERSONA_LABEL.ai_a, cls: "border-amber-200 bg-amber-50" },
  ai_b: { label: PERSONA_LABEL.ai_b, cls: "border-sky-200 bg-sky-50" },
};

/**
 * 一つの問いの対話画面。
 * 表示するのは最新セッションのみ。
 */
export default async function QuestionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const question = await getQuestion(id);
  if (!question) {
    notFound();
  }

  const session = await latestSession(id);
  if (!session) {
    notFound();
  }

  const messages = await listMessages(session.id);
  const memos = await listMemosForSession(session.id);

  const speak = speakAction.bind(null, question.id, session.id);
  const newSession = newSessionAction.bind(null, question.id);
  const createMemo = createMemoAction.bind(null, question.id);

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
        セッション開始: {formatTimestamp(session.started_at)}
      </p>

      <div className="mt-8 space-y-4">
        {messages.map((m) => (
          <div
            key={m.id}
            id={`msg-${m.id}`}
            className={`rounded border p-4 ${SPEAKER_STYLE[m.speaker].cls}`}
          >
            <div className="mb-1 text-xs font-bold text-neutral-500">
              {SPEAKER_STYLE[m.speaker].label}
            </div>
            <MessageBody
              message={m}
              memos={memos.filter((memo) => memo.message_id === m.id)}
              action={createMemo}
            />
          </div>
        ))}
        {messages.length === 0 && (
          <p className="text-sm text-neutral-500">
            まだ発話がない。問いについて口火を切ると、二体が応答する。
          </p>
        )}
      </div>

      <SpeakForm action={speak} />
    </main>
  );
}
