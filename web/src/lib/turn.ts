/**
 * 一往復（人間 → 具体 → 抽象）の手順。
 *
 * 二体が両方返ってから三行を一度に書く。
 * 途中で失敗したときに残るのは預かってある人間の発話だけで、AI の応答は捨てる（`docs/adr/0025-turn-atomicity-and-pending-utterance.md`）。
 *
 * AI の失敗は例外にも戻り値にも乗せない。
 * 成立しなかったことは預かりが残ることで表され、画面はそれを読む。
 *
 * 呼ぶプロバイダは引数で受け取る。
 * env から解決する側（`lib/ai/providers.ts`）へ直に触れると、失敗したときの永続化を検査できなくなる。
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

/** 一往復で呼ぶ二体。 */
export type PersonaCalls = Record<PersonaId, PersonaCall>;

/** どの問いのどのセッションを、どの二体で回すか。 */
type TurnTarget = {
  readonly questionId: string;
  readonly sessionId: string;
  readonly calls: PersonaCalls;
};

/**
 * 二体の呼び出しの指定を、env から解決済みのプロバイダで組み立てる。
 * 系統の割り当て（具体が ai_a、抽象が ai_b）はここが持つ。
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
 * 画面は失敗の理由を区別しないので、5 つある失敗経路を見分けられるのはここだけになる。
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
 * 人間の発話から一往復を回す。
 *
 * 本文は呼び出しの前に預ける。
 * 二体のどちらかが落ちても、人間が打った本文だけは残る。
 */
export async function runTurn(
  target: TurnTarget & { readonly body: string },
): Promise<void> {
  const { questionId, sessionId, calls, body } = target;

  const question = await getQuestion(questionId);
  if (!question) {
    throw new Error(`runTurn: question not found: ${questionId}`);
  }

  await savePendingBody(sessionId, body);

  const transcript: Transcript = [
    ...(await listMessages(sessionId)),
    { speaker: "human", body },
  ];
  const responses = await callBoth({
    calls,
    question,
    transcript,
    sessionId,
  });
  if (!responses) {
    return;
  }

  await commitTurn(sessionId, { human: body, ...responses });
}

/**
 * 預かってある発話で、もう一度一往復を回す。
 *
 * 預かりが無ければ何もしない（二重に届いた再送。直前の一往復は成立している）。
 */
export async function retryTurn(target: TurnTarget): Promise<void> {
  const body = await getPendingBody(target.sessionId);
  if (body === undefined) {
    return;
  }

  await runTurn({ ...target, body });
}
