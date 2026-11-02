/**
 * 縦一本（問い投入 → 二体応答 → メモ → 逆引き）が Prisma 経由で通ることの検査。
 * actions.ts が組み立てている順序をそのまま lib で辿る。
 * Server Actions 自体は next/cache・next/navigation を掴むので、配線の検証は `next build` に任せる。
 */

import { createOwner } from "@tests/setup/owner";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { ANTHROPIC_DEFAULTS, AnthropicProvider } from "@/lib/ai/anthropic";
import { callPersona, type PersonaCall } from "@/lib/ai/persona-call";
import { parseAnchor } from "@/lib/anchors";
import * as db from "@/lib/db";
import type { DefaultPersonaKey } from "@/lib/personas";
import type { OwnerId } from "@/lib/types";

/** 実 API を叩かないためのプロバイダ（docs/HARNESS.md「実 API を自動テストで叩かない」）。 */
const FAKE_PROVIDER = new AnthropicProvider({
  model: ANTHROPIC_DEFAULTS.model,
  maxTokens: ANTHROPIC_DEFAULTS.maxTokens,
  timeoutMs: ANTHROPIC_DEFAULTS.timeoutMs,
  fake: true,
});

afterAll(async () => {
  await db.disconnect();
});

let owner: OwnerId;

beforeEach(async () => {
  owner = await createOwner();
});

/**
 * 既定の二体のうち `key` の最新の版で、フェイクモードの呼び出し指定を組み立てる。
 * フェイクモードの呼び出しは利用量を記録しないので、`recordUsage` は呼ばれない。
 */
async function personaCall(key: DefaultPersonaKey): Promise<PersonaCall> {
  const config = await db.getLatestDefaultPersonaConfig(key);
  if (!config) {
    throw new Error(`既定のペルソナの版が無い: ${key}`);
  }

  return { config, provider: FAKE_PROVIDER, recordUsage: async () => {} };
}

describe("縦一本", () => {
  it("問いを投げると二体が応答し、その語にメモを付けて逆引きできる", async () => {
    const { question, session } = await db.createQuestion(
      owner,
      "速さを求めることは、何を失うことなのか",
    );

    // 人間の発話 → 具体 → 抽象の逐次。
    // 抽象は具体の発話も含む transcript を受け取る（並列にしない理由）。
    await db.addMessage(owner, session.id, {
      speaker: "human",
      body: "急ぐほど問いが痩せる気がする",
    });

    const concrete = await personaCall("concrete");
    const transcriptForA = await db.listMessages(owner, session.id);
    const aiA = await callPersona(concrete, question, transcriptForA);
    await db.addMessage(owner, session.id, {
      speaker: "ai",
      body: aiA,
      persona_config_id: concrete.config.id,
    });

    const abstract = await personaCall("abstract");
    const transcriptForB = await db.listMessages(owner, session.id);
    const aiB = await callPersona(abstract, question, transcriptForB);
    await db.addMessage(owner, session.id, {
      speaker: "ai",
      body: aiB,
      persona_config_id: abstract.config.id,
    });

    expect(transcriptForB.map((m) => m.speaker)).toEqual(["human", "ai"]);

    const messages = await db.listMessages(owner, session.id);
    expect(messages.map((m) => m.speaker)).toEqual(["human", "ai", "ai"]);
    expect(aiA).toContain("急ぐほど問いが痩せる気がする");
    expect(aiA).not.toBe(aiB); // 二体が別のペルソナとして応答している

    // 応答本文の一部を選択してメモを残す
    const target = messages[1];
    const memo = await db.addMemo(owner, target.id, {
      anchor: parseAnchor(0, 4),
      keyword: target.body.slice(0, 4),
    });

    const memosInSession = await db.listMemosForSession(owner, session.id);
    expect(memosInSession).toHaveLength(1);

    // メモからセッションと問いへ逆引きできる
    const [found] = await db.listMemosWithContext(owner);

    expect(found.id).toBe(memo.id);
    expect(found.session_id).toBe(session.id);
    expect(found.question_body).toBe("速さを求めることは、何を失うことなのか");
    expect(found.speaker).toBe("ai");
  });
});
