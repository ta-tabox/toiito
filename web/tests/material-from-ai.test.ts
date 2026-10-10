/**
 * AI に材料を寄せさせる手順が、応答の良し悪しに応じて `materials` の行と問いの `status` に何を残すかの検査。
 *
 * 規律の検査そのものの境界は `material.test.ts` が持ち、ここでは検査に通らなかったときに一件も保存されないことだけを見る。
 * 実 API は叩かない（`docs/HARNESS.md`「実 API を自動テストで叩かない」）。
 */

import { createOwner } from "@tests/setup/owner";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { ANTHROPIC_DEFAULTS, AnthropicProvider } from "@/lib/ai/anthropic";
import { type FakeMaterialResponse, fakeMaterialResponse } from "@/lib/ai/fake";
import type { MaterialCall } from "@/lib/ai/material-call";
import type { QuestionRef } from "@/lib/ai/prompt";
import { AiProvider, type ProviderResponse } from "@/lib/ai/provider";
import * as db from "@/lib/db";
import { addMaterialFromAi } from "@/lib/material-from-ai";
import type { OwnerId } from "@/lib/types";

/** ネットワークに出ず、`MaterialCall` の `fakeResponse` を返すプロバイダ。 */
const FAKE_PROVIDER = new AnthropicProvider({
  model: ANTHROPIC_DEFAULTS.model,
  maxTokens: ANTHROPIC_DEFAULTS.maxTokens,
  timeoutMs: ANTHROPIC_DEFAULTS.timeoutMs,
  fake: true,
});

/**
 * 呼ばれると必ず投げるプロバイダ。
 *
 * `callMaterial` は `settings.fake` が true だと `send` を呼ばないので、`settings.fake` を false にしてある。
 */
class FailingProvider extends AiProvider {
  readonly name = "failing";
  readonly settings = { ...FAKE_PROVIDER.settings, fake: false };

  /** 本文を送らずに throw する。 */
  async send(): Promise<ProviderResponse> {
    throw new Error("failing: 応答が返らない");
  }
}

/**
 * `provider` へ送り、フェイクモードなら `fakeResponse` が返す応答を使う呼び出しの指定を、解決する関数として返す。
 * `fakeResponse` を省くと、規律に通る `fakeMaterialResponse` を使う。
 */
function callResolver(
  provider: AiProvider,
  fakeResponse?: (question: QuestionRef) => FakeMaterialResponse,
): (owner: OwnerId, question: QuestionRef) => MaterialCall {
  return (owner, question) => ({
    prompt: "テストの付与のプロンプト",
    provider,
    maxSearches: 1,
    fakeResponse: () => (fakeResponse ?? fakeMaterialResponse)(question),
    recordUsage: (usage) => db.recordUsage(owner, usage),
  });
}

/** 立場が一つしかない論点の材料を返す応答で、`listMaterialViolations` が `unpairedTopic` を返す。 */
function unpairedResponse(): FakeMaterialResponse {
  const url = "https://example.com/one-sided";
  const materials = [
    {
      kind: "external",
      topic: "一つの論点",
      body: "片側の材料",
      source_url: url,
    },
  ];

  return { body: JSON.stringify({ materials }), searchResultUrls: [url] };
}

let owner: OwnerId;

beforeEach(async () => {
  owner = await createOwner();
});

afterAll(async () => {
  await db.disconnect();
});

/** 材料の付いていない `new` の問いを立て、その id を返す。 */
async function newQuestion(): Promise<string> {
  const { question } = await db.createQuestion(
    owner,
    "速さを求めることは、何を失うことなのか",
  );

  return question.id;
}

describe("材料の付与", () => {
  it("規律に通る応答なら、材料が問いに付き、status が stocked へ上がる", async () => {
    const questionId = await newQuestion();

    const result = await addMaterialFromAi(
      owner,
      questionId,
      callResolver(FAKE_PROVIDER),
    );

    expect(result.ok).toBe(true);
    const materials = await db.listMaterials(owner, questionId);
    expect(materials).toHaveLength(2);
    const question = await db.getQuestion(owner, questionId);
    expect(question?.status).toBe("stocked");
  });

  it("規律に通らない応答では、材料の行が作られず、status も new のまま残る", async () => {
    const questionId = await newQuestion();

    const result = await addMaterialFromAi(
      owner,
      questionId,
      callResolver(FAKE_PROVIDER, unpairedResponse),
    );

    expect(result.ok).toBe(false);
    const materials = await db.listMaterials(owner, questionId);
    expect(materials).toEqual([]);
    const question = await db.getQuestion(owner, questionId);
    expect(question?.status).toBe("new");
  });

  it("AI の呼び出しが失敗すると、throw せずに失敗を返し、材料の行は作られない", async () => {
    const questionId = await newQuestion();

    const result = await addMaterialFromAi(
      owner,
      questionId,
      callResolver(new FailingProvider()),
    );

    expect(result.ok).toBe(false);
    const materials = await db.listMaterials(owner, questionId);
    expect(materials).toEqual([]);
  });

  it("別の利用者の問いへは、AI を呼ばずに throw する", async () => {
    const questionId = await newQuestion();
    const stranger = await createOwner("stranger@example.com");

    await expect(
      addMaterialFromAi(
        stranger,
        questionId,
        callResolver(new FailingProvider()),
      ),
    ).rejects.toThrow();
  });
});
