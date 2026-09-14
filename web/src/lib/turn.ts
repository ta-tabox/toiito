/**
 * 一往復（human → ai_a → ai_b）を実行する。
 *
 * ai_a と ai_b が両方返ってから、`commitTurn` が三行をまとめて `messages` へ入れる。
 * AI 呼び出しが失敗しても throw せず、`pending_messages` に人間の発話を残して戻る（理由は `docs/adr/0025-turn-atomicity-and-pending-utterance.md`）。
 * AI を待つあいだに同じ問いへの別の書き込みが先に確定していたときも、throw せず三行を書かずに戻る（理由は `docs/adr/0042-serialize-turn-writes.md`）。
 *
 * 呼び出す二体（`PersonaCalls`）は引数で受け取る。
 * `runTurn` が `AI_PROVIDERS` を直接参照すると、テストが失敗経路を作れなくなる。
 * `AI_PROVIDERS` を参照するのは `personaCalls` だけである。
 */

import { callPersona, type PersonaCall } from "@/lib/ai";
import type { QuestionRef, Transcript } from "@/lib/ai/prompt";
import { AI_PROVIDERS } from "@/lib/ai/providers";
import {
  commitTurn,
  getPendingBody,
  getQuestion,
  listMessages,
  savePendingBody,
} from "@/lib/db";
import { loadPersona, type PersonaId } from "@/lib/personas";
import type { OwnerId } from "@/lib/types";

/** 一往復で呼ぶ二体。 */
export type PersonaCalls = Record<PersonaId, PersonaCall>;

/** 誰の、どの問いのどのセッションを、どの二体で回すか。 */
type TurnTarget = {
  readonly owner: OwnerId;
  readonly questionId: string;
  readonly sessionId: string;
  readonly calls: PersonaCalls;
};

/**
 * 二体の呼び出しの指定を、env から解決済みのプロバイダで組み立てる。
 * 系統の割り当て（具体が ai_a、抽象が ai_b）は `personaCalls` が持つ。
 */
export function personaCalls(): PersonaCalls {
  return {
    ai_a: {
      id: "ai_a",
      prompt: loadPersona("ai_a"),
      provider: AI_PROVIDERS.concrete,
    },
    ai_b: {
      id: "ai_b",
      prompt: loadPersona("ai_b"),
      provider: AI_PROVIDERS.abstract,
    },
  };
}

/**
 * 成立しなかった一往復を 1 行の JSON で残す。
 *
 * 画面は失敗の理由を区別しないので、AI 呼び出しの 5 つの失敗経路と、書き込みで先を越された場合を見分けられるのはこの記録だけになる。
 * 発話本文は出さない（`lib/ai/` の呼び出し記録と同じ扱い）。
 */
function logTurnFailure(sessionId: string, error: unknown): void {
  console.error(
    JSON.stringify({
      event: "turn_failed",
      session_id: sessionId,
      reason: error instanceof Error ? error.message : String(error),
    }),
  );
}

/**
 * 二体を逐次に呼んで、揃った本文を返す。
 * 揃わなければ undefined。
 *
 * 並列にしないのは、ai_b が ai_a への応答であることに意味があるため（衝突と転位）。
 */
async function callBoth(input: {
  readonly calls: PersonaCalls;
  readonly question: QuestionRef;
  readonly transcript: Transcript;
  readonly sessionId: string;
}): Promise<{ ai_a: string; ai_b: string } | undefined> {
  const { calls, question, transcript } = input;

  try {
    const aiA = await callPersona(calls.ai_a, question, transcript);
    const aiB = await callPersona(calls.ai_b, question, [
      ...transcript,
      { speaker: "ai_a", body: aiA },
    ]);

    return { ai_a: aiA, ai_b: aiB };
  } catch (error) {
    logTurnFailure(input.sessionId, error);

    return undefined;
  }
}

/**
 * `body` を `pending_messages` へ書き込んでから、一往復を実行する。
 * ai_a か ai_b が失敗すると `messages` は変わらず、`pending_messages` の行だけが残る。
 * AI を待つあいだに同じセッションで別の一往復が成立したか、新しいセッションが作られていたときも、`messages` は変わらない。
 * セッションが問いの最新セッションでなければ、書き込む前に throw する。
 */
export async function runTurn(
  target: TurnTarget & { readonly body: string },
): Promise<void> {
  const { owner, questionId, sessionId, calls, body } = target;

  const question = await getQuestion(owner, questionId);
  if (!question) {
    throw new Error(`問いが見つからない: ${questionId}`);
  }

  await savePendingBody(owner, sessionId, body);

  const messages = await listMessages(owner, sessionId);
  const transcript: Transcript = [...messages, { speaker: "human", body }];
  const responses = await callBoth({
    calls,
    question,
    transcript,
    sessionId,
  });
  if (!responses) {
    return;
  }

  const isCommitted = await commitTurn(owner, sessionId, {
    bodies: { human: body, ...responses },
    messageCountAtStart: messages.length,
  });

  if (!isCommitted) {
    logTurnFailure(
      sessionId,
      "応答を待つあいだに、同じセッションで別の一往復が成立したか、新しいセッションが作られた",
    );
  }
}

/**
 * `pending_messages` に残っている発話で、一往復をもう一度実行する。
 *
 * 行が無ければ何もしない（直前の一往復が完了していれば行は無い）。
 */
export async function retryTurn(target: TurnTarget): Promise<void> {
  const body = await getPendingBody(target.owner, target.sessionId);
  if (body === undefined) {
    return;
  }

  await runTurn({ ...target, body });
}
