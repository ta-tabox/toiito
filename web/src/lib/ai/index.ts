/**
 * AI の呼び出し一回の手順を置く（サーバー側のみ）。
 * 呼び出しの種別ごとの本文・フェイクモードの応答・戻り値の形は持たず、`persona-call.ts` と `material-call.ts` が持つ。
 *
 * 待つ上限・呼び出しの記録・利用量の記録・欠けた本文を返さないことは、どの種別の呼び出しでも同じなので `sendRecorded` 一か所に置く。
 * どのプロバイダを叩くかは呼び出し側が解決済みの実装（`AiProvider`）で渡すので、分岐は無い。
 * env を読まず、プロバイダは providers.ts が env から作る。
 */

import type {
  AiProvider,
  ProviderRequest,
  ProviderResponse,
} from "@/lib/ai/provider";
import type { PersonaId } from "@/lib/personas";
import type { UsageInput } from "@/lib/types";
import type { AiCallKind } from "@/lib/usage";

/**
 * 一回分の利用量を書く関数。
 * `sendRecorded` は、書き込みに失敗した例外を捕まえずに呼び出し元へ伝える。
 */
export type RecordUsage = (usage: UsageInput) => Promise<void>;

/**
 * `sendRecorded` へ渡す、プロバイダと記録に要る値。
 * どの種別の呼び出しか（kind）と、ペルソナの呼び出しならどの体か（persona）を持つ。
 */
type CallContext = {
  readonly provider: AiProvider;
  readonly kind: AiCallKind;
  readonly persona?: PersonaId;
  readonly recordUsage: RecordUsage;
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
  kind: AiCallKind;
  persona?: PersonaId;
  stop_reason: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  web_search_requests: number;
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
 * `request` を上限つきで一回送り、記録を残した応答を返す。
 * 応答が打ち切られたときと本文が空のときは例外を投げる（欠けた本文を返さない）。
 * 設定の上限を超えて返らないときも同じく例外を投げる。
 * フェイクモードの分岐は持たないので、呼び出し側が呼ぶ前に済ませる。
 *
 * 記録は打ち切りと空本文の検査より前に行う。
 * 応答が返った時点でトークンは消費されているので、呼び出し側が失敗として扱う応答も利用量に数える。
 */
export async function sendRecorded(
  context: CallContext,
  request: ProviderRequest,
): Promise<ProviderResponse> {
  const { provider } = context;
  const { settings } = provider;

  const startedAt = Date.now();
  const response = await sendWithTimeout(provider, request);

  logCall({
    provider: provider.name,
    model: settings.model,
    kind: context.kind,
    ...(context.persona ? { persona: context.persona } : {}),
    stop_reason: response.stopReason,
    input_tokens: response.inputTokens,
    output_tokens: response.outputTokens,
    web_search_requests: response.webSearchCount,
    duration_ms: Date.now() - startedAt,
    body_length: response.body.length,
  });

  await context.recordUsage({
    provider: provider.name,
    model: settings.model,
    kind: context.kind,
    input_tokens: response.inputTokens,
    output_tokens: response.outputTokens,
    web_search_count: response.webSearchCount,
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

  return response;
}
