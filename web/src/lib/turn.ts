/**
 * 一往復（human → ai_a → ai_b）を実行する。
 *
 * ai_a と ai_b が両方返ってから、`commitTurn` が三行をまとめて `messages` へ入れる。
 * AI 呼び出しが失敗しても throw せず、`pending_messages` に人間の発話を残して戻る（`docs/adr/0025-turn-atomicity-and-pending-utterance.md`）。
 *
 * 呼び出すプロバイダは引数で受け取る。
 * `lib/ai/providers.ts` を直接 import すると、テストが失敗経路を作れなくなる。
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
 * `body` を `pending_messages` へ書き込んでから、一往復を実行する。
 *
 * ai_a か ai_b が失敗すると `messages` は変わらず、`pending_messages` の行だけが残る。
 */
export async function runTurn(
  target: TurnTarget & { readonly body: string },
): Promise<void> {
  const { owner, questionId, sessionId, calls, body } = target;

  const question = await getQuestion(owner, questionId);
  if (!question) {
    throw new Error(`runTurn: question not found: ${questionId}`);
  }

  await savePendingBody(owner, sessionId, body);

  const transcript: Transcript = [
    ...(await listMessages(owner, sessionId)),
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

  await commitTurn(owner, sessionId, { human: body, ...responses });
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
