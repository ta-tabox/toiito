/**
 * 問いに付随する材料を AI に寄せさせ、検査に通れば保存する手順を置く。
 * 一回の呼び出しの規約は `lib/ai/material-call.ts`、応答の読み取りと規律の検査は `lib/material.ts`、行の読み書きは `lib/db.ts` が持つ。
 *
 * AI の失敗と検査に通らない応答では一件も保存せず、失敗を結果値で返す（理由は `docs/adr/20260915-culture-paired-sourced-material.md` 決定 6 と `docs/adr/20260915-culture-explicit-sync-trigger.md` 決定 4）。
 */

import fs from "node:fs";
import path from "node:path";
import { AnthropicProvider } from "@/lib/ai/anthropic";
import { fakeMaterialResponse } from "@/lib/ai/fake";
import { callMaterial, type MaterialCall } from "@/lib/ai/material-call";
import type { QuestionRef } from "@/lib/ai/prompt";
import { AI_PROVIDER } from "@/lib/ai/providers";
import { addMaterials, getQuestion, recordUsage } from "@/lib/db";
import { listMaterialViolations, parseMaterialDrafts } from "@/lib/material";
import type { Material, MaterialDraft, OwnerId } from "@/lib/types";

/**
 * 一回の付与で許す web 検索の回数の上限。
 *
 * 論点一つに材料 2〜3 件を集めるのに足りる回数に留める。
 * 検索の結果はすべて入力トークンに数えられ、回数を増やすほど応答までの時間も延びる。
 */
export const MATERIAL_MAX_SEARCHES = 3;

/**
 * 一回の付与で許す出力トークンの上限で、thinking を含む。
 *
 * 材料 3 件の JSON は数百トークンに収まるので、残りを thinking に充てる。
 * 呼び出しを待つ上限（`ANTHROPIC_DEFAULTS.timeoutMs`）の内側で生成し終える値として、一往復の既定より下げてある。
 */
export const MATERIAL_MAX_TOKENS = 8000;

/**
 * 付与一回の結果。
 * 失敗の理由（AI の失敗か検査に通らない応答か）は利用者へ出さず、標準エラーの記録にだけ残す。
 */
export type MaterialResult =
  | { readonly ok: true; readonly materials: Material[] }
  | { readonly ok: false };

/**
 * 付与のシステムプロンプトを `src/prompts/material.md` から読む。
 * ファイルが無ければ throw する。
 */
function loadMaterialPrompt(): string {
  const p = path.join(process.cwd(), "src", "prompts", "material.md");
  return fs.readFileSync(p, "utf-8");
}

/**
 * 付与の呼び出しの指定を、`MATERIAL_MAX_TOKENS` で出力を絞ったプロバイダと、`owner` の利用量を書く関数で組み立てて返す。
 * フェイクモードでは `question` から決定的な材料を作る。
 *
 * `addMaterialFromAi` が `AI_PROVIDER` を直接参照するとテストが失敗するプロバイダを差し込めなくなるので、`AI_PROVIDER` を参照するのは `materialCallOf` だけにする。
 */
export function materialCallOf(
  owner: OwnerId,
  question: QuestionRef,
): MaterialCall {
  return {
    prompt: loadMaterialPrompt(),
    provider: new AnthropicProvider({
      ...AI_PROVIDER.settings,
      maxTokens: MATERIAL_MAX_TOKENS,
    }),
    maxSearches: MATERIAL_MAX_SEARCHES,
    fakeResponse: () => fakeMaterialResponse(question),
    recordUsage: (usage) => recordUsage(owner, usage),
  };
}

/**
 * 付与が保存されずに終わったことを、`questionId` と理由を持つ 1 行の JSON で標準エラーへ出す。
 *
 * 画面は保存されなかった理由を出さないので、理由を追えるのはこの記録だけになる。
 * 問いは機微な出自を含みうるので、応答本文と論点の文字列は出さない。
 */
function logMaterialFailure(questionId: string, reason: unknown): void {
  console.error(
    JSON.stringify({
      event: "material_failed",
      question_id: questionId,
      reason: reason instanceof Error ? reason.message : String(reason),
    }),
  );
}

/**
 * `resolveCall` で付与の呼び出しを決めて AI を一回呼び、応答から読み取った材料が規律に通れば返す。
 * 呼び出しの決定か AI の呼び出しか応答の読み取りに失敗したとき、材料が一件も無いとき、規律に反するときは undefined を返す。
 */
async function requestDrafts(input: {
  readonly owner: OwnerId;
  readonly questionId: string;
  readonly question: QuestionRef;
  readonly resolveCall: (owner: OwnerId, question: QuestionRef) => MaterialCall;
}): Promise<MaterialDraft[] | undefined> {
  const { owner, questionId, question, resolveCall } = input;

  try {
    const response = await callMaterial(resolveCall(owner, question), question);
    const drafts = parseMaterialDrafts(response.body);

    if (drafts.length === 0) {
      logMaterialFailure(questionId, "応答に材料が一件も無い");
      return undefined;
    }

    const violations = listMaterialViolations(drafts, {
      searchResultUrls: response.searchResultUrls,
    });

    if (violations.length > 0) {
      const rules = violations.map((violation) => violation.rule);
      logMaterialFailure(questionId, `規律に反する: ${rules.join(",")}`);
      return undefined;
    }

    return drafts;
  } catch (error) {
    logMaterialFailure(questionId, error);

    return undefined;
  }
}

/**
 * `questionId` の問いについて AI に材料を寄せさせ、規律に通れば問いへ追記して、作った行を返す。
 * AI の失敗・読めない応答・材料が無い応答・規律に反する応答では、一件も保存せず `{ ok: false }` を返す。
 * 問いが無いか owner 以外が所有する問いなら、AI を呼ばずに throw する。
 *
 * 呼び出しの指定を値でなく関数で受け取るのは、フェイクモードの材料が問いの本文から作られ、問いを取得した後でしか組み立てられないため。
 */
export async function addMaterialFromAi(
  owner: OwnerId,
  questionId: string,
  resolveCall: (owner: OwnerId, question: QuestionRef) => MaterialCall,
): Promise<MaterialResult> {
  const question = await getQuestion(owner, questionId);
  if (!question) {
    throw new Error(`問いが見つからない: ${questionId}`);
  }

  const drafts = await requestDrafts({
    owner,
    questionId,
    question,
    resolveCall,
  });
  if (!drafts) {
    return { ok: false };
  }

  const materials = await addMaterials(owner, questionId, drafts);

  return { ok: true, materials };
}
