/**
 * AI 呼び出しの規約と、一回の呼び出しの手順（サーバー側のみ）。
 *
 * プロバイダに依らない決め事——フェイクモード・呼び出しの記録・待つ上限・欠けた本文を返さないこと——を `callPersona` が持つ。
 * どのプロバイダを叩くかは呼び出し側が解決済みの実装（`AiProvider`）で渡すので、`callPersona` に分岐は無い。
 *
 * env を読まない。
 * プロバイダは providers.ts が env から作る。
 */

import { fakeResponse } from "@/lib/ai/fake";
import {
  buildUserContent,
  type QuestionRef,
  type Transcript,
} from "@/lib/ai/prompt";
import type {
  AiProvider,
  ProviderRequest,
  ProviderResponse,
} from "@/lib/ai/provider";
import type { PersonaId } from "@/lib/personas";
import type { UsageInput } from "@/lib/types";

/**
 * ペルソナ一体を呼ぶときの指定。
 *
 * どの体か（id）・何を渡すか（prompt）と、どこへ送るか（provider）と、利用量をどう残すか（recordUsage）を一つの値にまとめる。
 * 識別子を prompt から復元しない。
 * ペルソナ定義の見出しに依存すると、見出しを変えた回に黙って壊れる。
 */
export type PersonaCall = {
  readonly id: PersonaId;
  readonly prompt: string;
  readonly provider: AiProvider;

  /**
   * 一回分の利用量を書く関数。
   * `callPersona` は書き込みに失敗した例外を捕まえずに呼び出し元へ伝える。
   *
   * 呼び出しの規約を持つ `lib/ai/index.ts` は DB を知らないので、書く手段は呼び出し側が渡す。
   */
  readonly recordUsage: (usage: UsageInput) => Promise<void>;
};

/**
 * 一回の呼び出しの結果を 1 行の JSON で残す。
 * 発話本文は出さず、打ち切りの検出に足りる長さ（`body_length`）だけを出す。
 *
 * 投入される問いは機微な出自を含みうるので、ログへ本文を渡さない。
 * 応答を受け取った直後に呼ぶので、この後で例外になった呼び出しも 1 行残る。
 */
function logCall(fields: {
  provider: string;
  model: string;
  persona: PersonaId;
  stop_reason: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  duration_ms: number;
  body_length: number;
}): void {
  console.log(JSON.stringify({ event: "ai_call", ...fields }));
}

/**
 * `timeoutMs` を上限に設定して `request` を一回送る。
 *
 * 待ち続けた末に実行環境が関数を強制終了すると、打ち切りとも空本文とも付かない不透明な失敗になるので、その手前で `sendWithTimeout` が打ち切る。
 * 上限で切れたのかどうかは、投げられた値の名前に依らせず signal で見分ける。
 */
async function sendWithTimeout(
  provider: AiProvider,
  request: ProviderRequest,
): Promise<ProviderResponse> {
  const { timeoutMs } = provider.settings;
  const timeout = AbortSignal.timeout(timeoutMs);

  try {
    return await provider.send(request, timeout);
  } catch (cause) {
    if (timeout.aborted) {
      throw new Error(
        `${provider.name} の応答が上限 (${timeoutMs}ms) を超えた`,
        { cause },
      );
    }

    throw cause;
  }
}

/**
 * ペルソナ一体を呼んで発話本文を返す。
 * プロバイダの設定で fake が立っているときはネットワークに出ない。
 * transcript はここまでの全発話で、呼ぶ側が順序を保証する。
 * 応答が打ち切られたときと本文が空のときは例外を投げる（欠けた本文を返さない）。
 * 設定の上限を超えて返らないときも同じく例外を投げる。
 *
 * 応答を受け取った呼び出しは、この後で例外を投げるものも含めて `recordUsage` で記録する。
 * フェイクモードの呼び出しと、応答を受け取れなかった呼び出しは記録しない。
 */
export async function callPersona(
  call: PersonaCall,
  question: QuestionRef,
  transcript: Transcript,
): Promise<string> {
  const { provider } = call;
  const { settings } = provider;

  if (settings.fake) {
    return fakeResponse(call.id, transcript);
  }

  const startedAt = Date.now();
  const response = await sendWithTimeout(provider, {
    system: call.prompt,
    userContent: buildUserContent(question, transcript, call.id),
  });

  logCall({
    provider: provider.name,
    model: settings.model,
    persona: call.id,
    stop_reason: response.stopReason,
    input_tokens: response.inputTokens,
    output_tokens: response.outputTokens,
    duration_ms: Date.now() - startedAt,
    body_length: response.body.length,
  });

  await call.recordUsage({
    provider: provider.name,
    model: settings.model,
    kind: "persona",
    input_tokens: response.inputTokens,
    output_tokens: response.outputTokens,
  });

  // 切れた本文を messages へ入れると、immutable なので後から直せない。
  if (response.truncated) {
    throw new Error(
      `${provider.name} の応答が maxTokens (${settings.maxTokens}) で打ち切られた`,
    );
  }

  // thinking だけで応答が終わると本文が一文字も来ない。
  if (!response.body) {
    throw new Error(`${provider.name} の応答に本文が無い`);
  }

  return response.body;
}
