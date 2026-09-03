/**
 * 一つの問いの対話画面。
 * 三者（人間・具体・抽象）の発話を時系列で並べ、次の一手を受け取る。
 *
 * 一度に描くのはセッション一つ。
 * 既定は最新で、`?s=<session_id>` が指すセッションがあればそちらを描く。
 * 過去のセッションは読み取り専用にする。
 * 再訪は前の続きではなく「また話す」ことなので、足したい発話は最新のセッションへ行く（ARCHITECTURE.md「再訪と、過去セッションの読み方」）。
 *
 * 発話の生成と永続化は Server Action の領分。
 * 本文の描画と選択からのメモ作成は MessageBody の領分。
 * ここは並べて描くところまで。
 *
 * 各発話に付ける id="msg-<message_id>" は逆引き（/memos）の着地点。
 * 書式は /memos が組み立てるリンクと、着地の印を出す landing-mark.tsx / globals.css が共有しているので、変えるならその三箇所とも直す。
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import { createMemoAction, newSessionAction, speakAction } from "@/app/actions";
import { LandingMark } from "@/components/landing-mark";
import { MessageBody } from "@/components/message-body";
import { SpeakForm } from "@/components/speak-form";
import { getCurrentUser } from "@/lib/current-user";
import {
  getQuestion,
  listMemosForSession,
  listMessages,
  listSessionsWithKeywords,
  questionText,
} from "@/lib/db";
import { formatTimestamp } from "@/lib/format";
import { PERSONA_LABEL } from "@/lib/personas";
import type { Speaker } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * 切り替え口の一行へ出すキーワードの数。
 * どのセッションだったか思い出せれば足りるので、全部は並べない。
 */
const SWITCHER_KEYWORDS = 3;

/**
 * 話者ごとの吹き出し。
 *
 * 三者は同じ幅で並び、分かれるのは面の温度と角の落とし方だけになる（DESIGN.md「話者の描き分け」）。
 * 二体はどちらも左なので位置では分かれず、暖が具体・寒が抽象で、抽象だけが罫を回す。
 * 温度差は周辺視で拾う手掛かりであって識別の正ではないので、名前のラベルは消さない。
 */
const SPEAKER_STYLE: Record<
  Speaker,
  { label: string; bubble: string; name: string }
> = {
  human: {
    label: "あなた",
    bubble: "rounded-bubble rounded-tr-notch bg-moss-surface",
    name: "text-right",
  },
  ai_a: {
    label: PERSONA_LABEL.ai_a,
    bubble: "rounded-bubble rounded-tl-notch bg-surface-warm",
    name: "",
  },
  ai_b: {
    label: PERSONA_LABEL.ai_b,
    bubble: "rounded-bubble border border-rule bg-surface-cool",
    name: "",
  },
};

/**
 * 一つの問いの対話画面。
 * 描くのは `?s` が指すセッション、無ければ最新セッション。
 */
export default async function QuestionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ s?: string }>;
}) {
  const { id } = await params;
  const { s: selectedId } = await searchParams;
  const owner = (await getCurrentUser()).id;
  const question = await getQuestion(owner, id);
  if (!question) {
    notFound();
  }

  const sessions = await listSessionsWithKeywords(owner, id);
  const latest = sessions.at(-1);

  // 選ぶ先をこの問いのセッションの中から引くことで、他の問いのセッション ID を ?s に差し込まれても届かない。
  const session = selectedId
    ? sessions.find((candidate) => candidate.id === selectedId)
    : latest;

  if (!session || !latest) {
    notFound();
  }

  const isLatest = session.id === latest.id;
  const messages = await listMessages(owner, session.id);
  const memos = await listMemosForSession(owner, session.id);

  const speak = speakAction.bind(null, question.id, session.id);
  const newSession = newSessionAction.bind(null, question.id);
  const createMemo = createMemoAction.bind(null, question.id);

  return (
    <main className="mx-auto w-full max-w-reading flex-1 px-5 py-10">
      <div className="flex items-baseline justify-between gap-4">
        <Link href="/" className="text-aux text-ink-weak hover:underline">
          ← 問いの発酵槽
        </Link>
        {isLatest ? (
          <form action={newSession}>
            <button
              type="submit"
              className="text-aux text-ink-weak hover:underline"
            >
              新しいセッションで再訪
            </button>
          </form>
        ) : (
          <Link
            href={`/q/${question.id}`}
            className="text-aux text-ink-weak hover:underline"
          >
            最新のセッションへ →
          </Link>
        )}
      </div>

      <h1 className="mt-4 font-mincho text-question md:text-question-lg">
        {questionText(question)}
      </h1>
      {question.current_form && (
        <p className="mt-2 border-rule border-l-2 pl-3 text-meta text-ink-weak">
          原型（不変）: {question.body}
        </p>
      )}
      <p className="mt-2 text-meta text-ink-weak tabular-nums">
        セッション開始: {formatTimestamp(session.started_at)}
      </p>

      {sessions.length > 1 && (
        <nav
          aria-label="セッション"
          className="mt-4 flex flex-col items-start gap-1 border-rule border-l-2 pl-3"
        >
          {sessions.map((candidate, index) => (
            <Link
              key={candidate.id}
              href={
                candidate.id === latest.id
                  ? `/q/${question.id}`
                  : `/q/${question.id}?s=${candidate.id}`
              }
              aria-current={candidate.id === session.id ? "page" : undefined}
              className="text-meta text-ink-weak hover:underline aria-[current]:font-bold aria-[current]:text-ink"
            >
              {index + 1} 回目 · {formatTimestamp(candidate.started_at)}
              {candidate.keywords.length > 0 &&
                ` · ${candidate.keywords.slice(0, SWITCHER_KEYWORDS).join("・")}`}
            </Link>
          ))}
        </nav>
      )}

      <div data-recedes-while-writing="" className="mt-8 space-y-4">
        {messages.map((m) => (
          <div
            key={m.id}
            id={`msg-${m.id}`}
            className={`p-3 md:p-4 ${SPEAKER_STYLE[m.speaker].bubble}`}
          >
            <div
              className={`mb-2 text-meta text-ink-weak ${SPEAKER_STYLE[m.speaker].name}`}
            >
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
          <p className="text-aux text-ink-weak">
            まだ発話がない。問いについて口火を切ると、二体が応答する。
          </p>
        )}
      </div>

      {isLatest ? (
        <SpeakForm action={speak} />
      ) : (
        <p className="mt-8 text-aux text-ink-weak">
          読み返しているのは過去のセッション。ここへは発話を足せない。
        </p>
      )}
      <LandingMark />
    </main>
  );
}
