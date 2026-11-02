/**
 * 一往復（human → ai_a → ai_b）の、AI 呼び出しと永続化の順序を決める手順を置く。
 * モデルへ渡す本文と一回の呼び出しの規約は持たず、`lib/ai` が持つ。
 * 行の読み書きは持たず、`lib/db` が持つ。
 *
 * 一往復は、人間の発話と二体の応答が揃ったときだけ `messages` へ書き込み、揃わなければ人間の発話を `pending_messages` に残す（理由は `docs/adr/20260902-turn-atomicity-and-pending-utterance.md`）。
 */

import {
  ANTHROPIC_DEFAULTS,
  type AnthropicCredentials,
  isAnthropicModel,
} from "@/lib/ai/anthropic";
import { callPersona, type PersonaCall } from "@/lib/ai/persona-call";
import type { QuestionRef, Transcript } from "@/lib/ai/prompt";
import type { AiProvider } from "@/lib/ai/provider";
import { aiProviderFor } from "@/lib/ai/providers";
import {
  commitTurn,
  getModelCredentials,
  getPendingBody,
  getQuestionOfSession,
  listMessages,
  recordUsage,
  savePendingBody,
} from "@/lib/db";
import { loadPersona, type PersonaId } from "@/lib/personas";
import { decryptApiKey } from "@/lib/secrets";
import { encryptionKeyRing } from "@/lib/secrets-config";
import type { OwnerId, UsageInput } from "@/lib/types";
import type { ApiKeySource } from "@/lib/usage";

/** 一往復で呼ぶ二体。 */
export type PersonaCalls = Record<PersonaId, PersonaCall>;

/**
 * `runTurn` と `retryTurn` に渡す、一往復の実行の指定。
 * 発話を書き込むセッション（`sessionId`）と、その所有者（`owner`）と、応答させるペルソナを決める関数（`resolveCalls`）を持つ。
 *
 * 問いの id を持たないのは、問いとセッションを別々に渡せると、別の問いのセッションを組み合わせられるため。
 * ペルソナを値でなく関数で受け取るのは、`runTurn` が発話を `pending_messages` へ書き込んだ後に決め、決定に失敗しても発話を残すため。
 */
type TurnTarget = {
  readonly owner: OwnerId;
  readonly sessionId: string;
  readonly resolveCalls: (owner: OwnerId) => Promise<PersonaCalls>;
};

/**
 * 利用者の API キーとモデル（`credentials`）からプロバイダを作る関数。
 * `credentials` が無ければ、運営の API キーと既定のモデルで呼ぶプロバイダを返す。
 */
export type ProviderFor = (credentials?: AnthropicCredentials) => AiProvider;

/**
 * `owner` が登録した API キーを復号し、選んだモデルと組にして返す。
 * API キーを登録していなければ、モデルを選んでいても undefined を返す。
 *
 * 保存されたモデルが `ANTHROPIC_MODELS` の値域の外なら throw し、利用者の API キーで利用者が選んでいないモデルを呼ばない。
 * 復号に失敗したときも throw する。
 */
async function getUserCredentials(
  owner: OwnerId,
): Promise<AnthropicCredentials | undefined> {
  const stored = await getModelCredentials(owner);
  if (!stored) {
    return undefined;
  }

  const model = stored.model ?? ANTHROPIC_DEFAULTS.model;
  if (!isAnthropicModel(model)) {
    throw new Error(`保存されたモデルが選べるモデルの外にある: ${model}`);
  }

  const apiKey = decryptApiKey(stored.encrypted_api_key, encryptionKeyRing());

  return { apiKey, model };
}

/**
 * `owner` の設定から決めたプロバイダと、`owner` の利用量を書く関数で、二体の呼び出しの指定を組み立てて返す。
 * `owner` が API キーを登録していればその API キーと選んだモデルで呼び、登録していなければ運営の API キーと既定のモデルで呼ぶ。
 * 復号の失敗と値域の外のモデルは throw する。
 *
 * 利用量の行には、どちらの API キーで呼んだか（`key_source`）を書く。
 * 利用者を `runTurn` から受け取るのは、一往復の所有者と、API キーと利用量が乗る利用者を食い違わせないため。
 */
export async function personaCalls(
  owner: OwnerId,
  providerFor: ProviderFor = aiProviderFor,
): Promise<PersonaCalls> {
  const credentials = await getUserCredentials(owner);
  const provider = providerFor(credentials);
  const keySource: ApiKeySource = credentials ? "user" : "system";
  const record = (usage: UsageInput) =>
    recordUsage(owner, { ...usage, key_source: keySource });

  return {
    ai_a: {
      id: "ai_a",
      prompt: loadPersona("ai_a"),
      provider,
      recordUsage: record,
    },
    ai_b: {
      id: "ai_b",
      prompt: loadPersona("ai_b"),
      provider,
      recordUsage: record,
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
 * `resolveCalls` で応答させるペルソナを決め、二体を逐次に呼んで、揃った本文を返す。
 * ペルソナの決定か、どちらかの呼び出しに失敗すれば undefined。
 *
 * 並列にしないのは、ai_b が ai_a への応答であることに意味があるため（衝突と転位）。
 */
async function callBoth(input: {
  readonly owner: OwnerId;
  readonly resolveCalls: TurnTarget["resolveCalls"];
  readonly question: QuestionRef;
  readonly transcript: Transcript;
  readonly sessionId: string;
}): Promise<{ ai_a: string; ai_b: string } | undefined> {
  const { owner, resolveCalls, question, transcript } = input;

  try {
    const calls = await resolveCalls(owner);

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
 * ペルソナの決定か、ai_a か ai_b の呼び出しに失敗したら、`messages` へ書き込まず、`pending_messages` の行を残して戻る。
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
    owner,
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
