/**
 * 一つの問いの対話画面。
 * 三者（人間と二体の AI）の発話を時系列で並べ、次の一手を受け取る。
 *
 * 一度に描くのはセッション一つで、既定は最新、`?s=<session_id>` が指すセッションがあればそのセッションを描く。
 * 過去のセッションは読み取り専用にする。
 * 再訪は前の続きではなく「また話す」ことなので、足したい発話は最新のセッションへ行く（docs/ARCHITECTURE.md「再訪と、過去セッションの読み方」）。
 *
 * 発話の生成と永続化は Server Action、本文の描画と選択からのメモ作成は `MessageBody` の担当で、`QuestionPage` は並べて描くところまで。
 *
 * 各発話に付ける id は逆引き（/memos）の着地点で、書式の正は `lib/routes.ts` の `messageElementIdOf`。
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import {
  createMemoAction,
  newSessionAction,
  retryTurnAction,
  setQuestionStatusAction,
  speakAction,
} from "@/app/actions";
import { LandingMark } from "@/components/landing-mark";
import { MessageBody } from "@/components/message-body";
import { RetryForm, SpeakForm } from "@/components/speak-form";
import { StatusForm } from "@/components/status-form";
import { SubmitButton } from "@/components/ui/submit-button";
import { requireCurrentUser } from "@/lib/auth/current-user";
import {
  getPendingBody,
  getQuestion,
  listMemosForSession,
  listMessages,
  listSessionsWithKeywords,
  questionText,
} from "@/lib/db";
import { formatTimestamp } from "@/lib/format";
import type { PersonaAxisLevel } from "@/lib/personas";
import { messageElementIdOf, questionPathOf } from "@/lib/routes";
import type { UtteranceSpeaker } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * セッション切り替えのリンク一行へ出すキーワードの数。
 * どのセッションだったか思い出せれば足りるので、全部は並べない。
 */
const SWITCHER_KEYWORDS = 3;

/** 発話者の名前のラベルと、吹き出しの class。 */
type SpeakerStyle = { label: string; bubble: string; name: string };

/**
 * 人間の発話の吹き出し。
 *
 * 三者は同じ幅で並べ、違いは背景色と角丸の位置だけに置く（`.claude/rules/design.md`「話者の描き分け」）。
 * 背景色は周辺視で拾う手掛かりであって識別の正ではないので、`label` の表示は消さない。
 */
const HUMAN_STYLE: SpeakerStyle = {
  label: "あなた",
  bubble: "rounded-bubble rounded-tr-notch bg-moss-surface",
  name: "text-right",
};

/** AI の発話の吹き出しを、版の抽象度の段階ごとに持つ。 */
const AI_BUBBLE: Record<PersonaAxisLevel, string> = {
  level_1: "rounded-bubble rounded-tl-notch bg-surface-warm",
  level_2: "rounded-bubble rounded-tl-notch bg-surface-warm",
  level_3: "rounded-bubble rounded-tl-notch bg-surface-warm",
  level_4: "rounded-bubble border border-rule bg-surface-cool",
  level_5: "rounded-bubble border border-rule bg-surface-cool",
};

/** 発話（`utterance`）の吹き出しを、人間か、AI ならそれを書いた版の呼び名と抽象度から決める。 */
function speakerStyleOf(utterance: UtteranceSpeaker): SpeakerStyle {
  if (utterance.speaker === "human") {
    return HUMAN_STYLE;
  }

  const { name, abstraction } = utterance.persona;

  return { label: name, bubble: AI_BUBBLE[abstraction], name: "" };
}

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
  const { id: owner } = await requireCurrentUser();
  const question = await getQuestion(owner, id);
  if (!question) {
    notFound();
  }

  const sessions = await listSessionsWithKeywords(owner, id);
  const latest = sessions.at(-1);

  // 選ぶ先をこの問いのセッションの中から検索することで、他の問いのセッション ID を `?s` に差し込まれても届かない。
  const session = selectedId
    ? sessions.find((candidate) => candidate.id === selectedId)
    : latest;

  if (!session || !latest) {
    notFound();
  }

  const isLatest = session.id === latest.id;
  const messages = await listMessages(owner, session.id);
  const memos = await listMemosForSession(owner, session.id);
  const pendingBody = await getPendingBody(owner, session.id);

  const speak = speakAction.bind(null, session.id);
  const retry = retryTurnAction.bind(null, session.id);
  const newSession = newSessionAction.bind(null, question.id);
  const setStatus = setQuestionStatusAction.bind(null, question.id);

  return (
    <main className="mx-auto w-full max-w-reading flex-1 px-5 py-10">
      <div className="flex items-baseline justify-between gap-4">
        <Link href="/" className="text-aux text-ink-weak hover:underline">
          ← 問いの発酵槽
        </Link>
        {isLatest ? (
          <form action={newSession}>
            <SubmitButton pendingLabel="セッションを始めている">
              新しいセッションで再訪
            </SubmitButton>
          </form>
        ) : (
          <Link
            href={questionPathOf(question.id)}
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
      <div className="mt-2">
        <StatusForm status={question.status} action={setStatus} />
      </div>
      <p className="mt-2 text-meta text-ink-weak tabular-nums">
        セッション開始: {formatTimestamp(session.started_at)}
      </p>

      {sessions.length > 1 && (
        <nav
          aria-label="セッション"
          className="mt-4 flex flex-col items-start gap-2 border-rule border-l-2 pl-3"
        >
          {sessions.map((candidate, index) => (
            <Link
              key={candidate.id}
              href={
                candidate.id === latest.id
                  ? questionPathOf(question.id)
                  : questionPathOf(question.id, { sessionId: candidate.id })
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
        {messages.map((m) => {
          const style = speakerStyleOf(m);

          return (
            <div
              key={m.id}
              id={messageElementIdOf(m.id)}
              className={`p-3 md:p-4 ${style.bubble}`}
            >
              <div className={`mb-2 text-meta text-ink-weak ${style.name}`}>
                {style.label}
              </div>
              <MessageBody
                message={m}
                memos={memos.filter((memo) => memo.message_id === m.id)}
                action={createMemoAction}
              />
            </div>
          );
        })}
        {messages.length === 0 && (
          <p className="text-aux text-ink-weak">
            まだ発話がない。問いについて口火を切ると、二体が応答する。
          </p>
        )}
      </div>

      {isLatest && pendingBody && (
        <PendingTurn body={pendingBody} action={retry} />
      )}

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

/**
 * 送信に失敗した発話と、その再送ボタンを表示する。
 *
 * 破線の枠で囲うのは、`messages` に入った発話と区別するため。
 */
function PendingTurn({
  body,
  action,
}: {
  body: string;
  action: () => Promise<void>;
}) {
  return (
    <div className="mt-8 rounded border border-rule border-dashed bg-surface-low p-3 md:p-4">
      <p role="alert" className="text-aux text-ink-weak">
        応答の取得に失敗した。
      </p>
      <p className="mt-2 whitespace-pre-wrap text-utterance text-ink md:text-utterance-lg">
        {body}
      </p>
      <RetryForm action={action} />
    </div>
  );
}
