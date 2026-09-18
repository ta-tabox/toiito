/**
 * 問いに付随する材料を、AI の web 検索の結果から寄せる呼び出しと、その指定と結果の型を置く。
 * 待つ上限・記録・欠けた本文の検査は持たず、`lib/ai/index.ts` の `sendRecorded` が持つ。
 */

import { type RecordUsage, sendRecorded } from "@/lib/ai";
import type { FakeMaterialResponse } from "@/lib/ai/fake";
import { buildMaterialContent, type QuestionRef } from "@/lib/ai/prompt";
import type { AiProvider } from "@/lib/ai/provider";

/**
 * 問いに付随する材料を寄せるときの指定。
 *
 * フェイクモードで返す応答を関数で受け取るのは、`lib/ai` が材料の書式を知らないため。
 * 書式を持つのは `fakeMaterialResponse` と、それを渡す付与の手順である。
 */
export type MaterialCall = {
  readonly prompt: string;
  readonly provider: AiProvider;

  /**
   * 一回の呼び出しで許す web 検索の回数の上限。
   *
   * 材料の呼び出しの費用は、トークン単価よりこの値で大きく変わる。
   * 検索一回ごとに料金がかかるうえ、検索の結果がすべて入力トークンとして数えられる。
   */
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
