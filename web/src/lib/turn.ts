/**
 * 一往復（human → ai_a → ai_b）を実行する。
 *
 * ai_a と ai_b が両方返ってから、`commitTurn` が人間・ai_a・ai_b の発話をまとめて `messages` へ書き込む。
 * AI 呼び出しが失敗しても throw せず、`pending_messages` に人間の発話を残して戻る（理由は `docs/adr/0025-turn-atomicity-and-pending-utterance.md`）。
 * AI を待つあいだに同じセッションへ別の一往復が書き込まれていたときも、同じ理由で throw せず、`messages` へ書き込まずに戻る。
 *
 * 呼び出す二体は、解決する非同期の関数（`resolveCalls`）として引数で受け取り、発話を `pending_messages` へ書き込んだ後に呼ぶ。
 * `runTurn` が `AI_PROVIDER` を直接参照すると、テストが失敗経路を作れなくなる。
 * `AI_PROVIDER` を参照するのは `personaCalls` だけである。
 */

import { callPersona, type PersonaCall } from "@/lib/ai";
import type { QuestionRef, Transcript } from "@/lib/ai/prompt";
import { AI_PROVIDER } from "@/lib/ai/providers";
import {
  commitTurn,
  getPendingBody,
  getQuestionOfSession,
  listMessages,
  savePendingBody,
} from "@/lib/db";
import { loadPersona, type PersonaId } from "@/lib/personas";
import type { OwnerId } from "@/lib/types";

/** 一往復で呼ぶ二体。 */
export type PersonaCalls = Record<PersonaId, PersonaCall>;

/**
 * `runTurn` と `retryTurn` に渡す、一往復の実行の指定。
 * 発話を書き込むセッション（`sessionId`）と、その所有者（`owner`）と、応答させる二体を解決する関数（`resolveCalls`）を持つ。
 *
 * 問いの id を持たないのは、問いとセッションを別々に渡せると、別の問いのセッションを組み合わせられるため。
 */
type TurnTarget = {
  readonly owner: OwnerId;
  readonly sessionId: string;
  readonly resolveCalls: () => Promise<PersonaCalls>;
};

/** 二体の呼び出しの指定を、env から解決済みのプロバイダで組み立てて返す。 */
export async function personaCalls(): Promise<PersonaCalls> {
  return {
    ai_a: {
      id: "ai_a",
      prompt: loadPersona("ai_a"),
      provider: AI_PROVIDER,
    },
    ai_b: {
      id: "ai_b",
      prompt: loadPersona("ai_b"),
      provider: AI_PROVIDER,
    },
  };
}

/**
 * 一往復が `messages` へ書き込まれずに終わったことを、`sessionId` と理由を持つ 1 行の JSON で標準エラーへ出す。
 *
 * 画面は書き込まれなかった理由を出さないので、理由を追えるのはこの記録だけになる。
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
 * `resolveCalls` で二体を解決し、逐次に呼んで、揃った本文を返す。
 * 解決が reject するか、どちらかの呼び出しが失敗すれば undefined。
 *
 * 並列にしないのは、ai_b が ai_a への応答であることに意味があるため（衝突と転位）。
 */
async function callBoth(input: {
  readonly resolveCalls: TurnTarget["resolveCalls"];
  readonly question: QuestionRef;
  readonly transcript: Transcript;
  readonly sessionId: string;
}): Promise<{ ai_a: string; ai_b: string } | undefined> {
  const { resolveCalls, question, transcript } = input;

  try {
    const calls = await resolveCalls();

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
 * `body` を `pending_messages` へ書き込み、二体の応答が揃えば、`body` と二体の応答を一往復として `messages` へ書き込む。
 * 二体の解決か、ai_a か ai_b の呼び出しが失敗したら、`messages` へ書き込まず、`pending_messages` の行を残して戻る。
 * 二体の応答を待つあいだに、同じセッションへ別の一往復が書き込まれたか、問いに新しいセッションが作られていたら、`messages` へ書き込まずに戻る。
 * セッションが問いの最新のセッションでなければ、何も書き込まずに throw する。
 */
export async function runTurn(
  target: TurnTarget & { readonly body: string },
): Promise<void> {
  const { owner, sessionId, resolveCalls, body } = target;

  const question = await getQuestionOfSession(owner, sessionId);
  if (!question) {
    throw new Error(`セッションが見つからない: ${sessionId}`);
  }

  await savePendingBody(owner, sessionId, body);

  const messages = await listMessages(owner, sessionId);
  const transcript: Transcript = [...messages, { speaker: "human", body }];
  const responses = await callBoth({
    resolveCalls,
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
      "応答を待つあいだに、同じセッションへ別の一往復が書き込まれたか、問いに新しいセッションが作られた",
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
