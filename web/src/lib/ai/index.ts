/**
 * AI 呼び出しの規約と、一回の呼び出しの手順（サーバー側のみ）。
 *
 * プロバイダに依らない決め事——フェイクモード・呼び出しの記録・待つ上限・欠けた本文を返さないこと——を `callPersona` と `callMaterial` が持つ。
 * どのプロバイダを叩くかは呼び出し側が解決済みの実装（`AiProvider`）で渡すので、分岐は無い。
 *
 * env を読まない。
 * プロバイダは providers.ts が env から作る。
 */

import type { FakeMaterialResponse } from "@/lib/ai/fake";
import { fakeResponse } from "@/lib/ai/fake";
import {
  buildMaterialContent,
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
import type { AiCallKind } from "@/lib/usage";

/**
 * 一回分の利用量を書く関数。
 * `callPersona` と `callMaterial` は、書き込みに失敗した例外を捕まえずに呼び出し元へ伝える。
 */
export type RecordUsage = (usage: UsageInput) => Promise<void>;

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
  readonly recordUsage: RecordUsage;
};

/**
 * 問いに付随する材料を寄せるときの指定。
 *
 * フェイクモードで返す応答を関数で受け取るのは、`lib/ai` が材料の書式を知らないため。
 * 書式を持つのは `fakeMaterialResponse` と、それを渡す付与の手順である。
 */
export type MaterialCall = {
  readonly prompt: string;
  readonly provider: AiProvider;

  /** 一回の呼び出しで許す web 検索の回数の上限。 */
  readonly maxSearches: number;

  readonly fakeResponse: () => FakeMaterialResponse;
  readonly recordUsage: RecordUsage;
};

/**
 * 材料を寄せる呼び出し一回分の結果。
 * `searchResultUrls` は出典の照合（`listMaterialViolations`）が読み、`webSearchCount` は利用量の記録が読む。
 */
export type MaterialResponse = {
  readonly body: string;
  readonly searchResultUrls: readonly string[];
  readonly webSearchCount: number;
};

/**
 * 記録に要る、プロバイダの外側の値。
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
 *
 * 記録は打ち切りと空本文の検査より前に行う。
 * 応答が返った時点でトークンは消費されているので、呼び出し側が失敗として扱う応答も利用量に数える。
 */
async function sendRecorded(
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

/**
 * ペルソナ一体を呼んで発話本文を返す。
 * プロバイダの設定で fake が立っているときはネットワークに出ない。
 * transcript はここまでの全発話で、呼ぶ側が順序を保証する。
 * 失敗の仕方と記録の条件は `sendRecorded` と同じで、web 検索は要求しない。
 */
export async function callPersona(
  call: PersonaCall,
  question: QuestionRef,
  transcript: Transcript,
): Promise<string> {
  const { provider } = call;

  if (provider.settings.fake) {
    return fakeResponse(call.id, transcript);
  }

  const response = await sendRecorded(
    {
      provider,
      kind: "persona",
      persona: call.id,
      recordUsage: call.recordUsage,
    },
    {
      system: call.prompt,
      userContent: buildUserContent(question, transcript, call.id),
    },
  );

  return response.body;
}

/**
 * 問いに付随する材料を、AI の web 検索の結果から寄せて返す。
 * プロバイダの設定で fake が立っているときはネットワークに出ず、`call.fakeResponse` の応答を検索の回数 0 で返す。
 * 失敗の仕方と記録の条件は `sendRecorded` と同じ。
 *
 * 本文を材料の一覧として読むのは `parseMaterialDrafts` で、`callMaterial` は本文を読まない。
 */
export async function callMaterial(
  call: MaterialCall,
  question: QuestionRef,
): Promise<MaterialResponse> {
  const { provider } = call;

  if (provider.settings.fake) {
    return { ...call.fakeResponse(), webSearchCount: 0 };
  }

  const response = await sendRecorded(
    { provider, kind: "material", recordUsage: call.recordUsage },
    {
      system: call.prompt,
      userContent: buildMaterialContent(question),
      webSearch: { maxSearches: call.maxSearches },
    },
  );

  return {
    body: response.body,
    searchResultUrls: response.searchResultUrls,
    webSearchCount: response.webSearchCount,
  };
}
