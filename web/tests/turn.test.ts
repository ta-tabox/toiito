/**
 * 一往復が途中で失敗したときに何が残るかの検査。
 *
 * 見るのは `messages` と預かりの二つだけで、AI の応答の中身は見ない（呼び出し規約は `ai.test.ts` の領分）。
 * 実 API は叩かない（HARNESS.md「実 API を自動テストで叩かない」）。
 */

import { afterAll, describe, expect, it } from "vitest";
import { ANTHROPIC_DEFAULTS, AnthropicProvider } from "@/lib/ai/anthropic";
import { AiProvider, type ProviderResponse } from "@/lib/ai/provider";
import * as db from "@/lib/db";
import { MESSAGE_BODY_MAX_LENGTH } from "@/lib/message";
import { loadPersona, type PersonaId } from "@/lib/personas";
import { type PersonaCalls, retryTurn, runTurn } from "@/lib/turn";

/** ネットワークに出ず決定的な応答を返すプロバイダ。 */
const FAKE_PROVIDER = new AnthropicProvider({
  model: ANTHROPIC_DEFAULTS.model,
  maxTokens: ANTHROPIC_DEFAULTS.maxTokens,
  timeoutMs: ANTHROPIC_DEFAULTS.timeoutMs,
  fake: true,
});

/**
 * 呼ばれると必ず投げるプロバイダ。
 *
 * `callPersona` はフェイクモードを送信の前に見るので、失敗を辿るには fake を降ろす必要がある。
 * 5 つある失敗経路のどれで投げたかは `speakAction` から見て区別が付かないため、代表して一つだけ模す。
 */
class FailingProvider extends AiProvider {
  readonly name = "failing";
  readonly settings = { ...FAKE_PROVIDER.settings, fake: false };

  async send(): Promise<ProviderResponse> {
    throw new Error("failing: 応答が返らない");
  }
}

/**
 * 二体ぶんの呼び出し指定。
 * 既定は両方フェイクで、落としたい体だけ差し替える。
 */
function calls(failing?: PersonaId): PersonaCalls {
  const call = (id: PersonaId) => ({
    id,
    prompt: loadPersona(id),
    provider: id === failing ? new FailingProvider() : FAKE_PROVIDER,
  });

  return { ai_a: call("ai_a"), ai_b: call("ai_b") };
}

/** 問いと、その最初のセッションを立てる。 */
async function newDialogue() {
  const { question, session } = await db.createQuestion(
    "速さを求めることは、何を失うことなのか",
  );

  return { questionId: question.id, sessionId: session.id };
}

afterAll(async () => {
  await db.disconnect();
});

describe("一往復", () => {
  it("二体が揃えば三行が入り、預かりは消える", async () => {
    const target = await newDialogue();

    await runTurn({
      ...target,
      body: "急ぐほど問いが痩せる気がする",
      calls: calls(),
    });

    const messages = await db.listMessages(target.sessionId);
    expect(messages.map((m) => m.speaker)).toEqual(["human", "ai_a", "ai_b"]);
    expect(messages[0].body).toBe("急ぐほど問いが痩せる気がする");
    expect(await db.getPendingBody(target.sessionId)).toBeUndefined();
  });

  it("ai_b が落ちると発話は一つも残らず、人間の本文だけが預かりに残る", async () => {
    const target = await newDialogue();

    await runTurn({
      ...target,
      body: "急ぐほど問いが痩せる気がする",
      calls: calls("ai_b"),
    });

    // ai_a は成功しているが、成立していない一往復の断片は置かない。
    expect(await db.listMessages(target.sessionId)).toEqual([]);
    expect(await db.getPendingBody(target.sessionId)).toBe(
      "急ぐほど問いが痩せる気がする",
    );
  });

  it("ai_a が落ちたときも同じ", async () => {
    const target = await newDialogue();

    await runTurn({
      ...target,
      body: "急ぐほど問いが痩せる気がする",
      calls: calls("ai_a"),
    });

    expect(await db.listMessages(target.sessionId)).toEqual([]);
    expect(await db.getPendingBody(target.sessionId)).toBe(
      "急ぐほど問いが痩せる気がする",
    );
  });

  it("失敗のあとに同じ文言を送り直しても、human が二重に積まれない", async () => {
    const target = await newDialogue();
    const body = "急ぐほど問いが痩せる気がする";

    await runTurn({ ...target, body, calls: calls("ai_b") });
    await runTurn({ ...target, body, calls: calls() });

    const messages = await db.listMessages(target.sessionId);
    expect(messages.map((m) => m.speaker)).toEqual(["human", "ai_a", "ai_b"]);
  });

  it("前の一往復が成立していれば、次の発話はその上へ積まれる", async () => {
    const target = await newDialogue();

    await runTurn({ ...target, body: "一つ目", calls: calls() });
    await runTurn({ ...target, body: "二つ目", calls: calls() });

    const messages = await db.listMessages(target.sessionId);
    expect(messages.map((m) => m.speaker)).toEqual([
      "human",
      "ai_a",
      "ai_b",
      "human",
      "ai_a",
      "ai_b",
    ]);
    expect(messages[3].body).toBe("二つ目");
  });

  it("上限を超える本文は預かる前に弾く", async () => {
    const target = await newDialogue();

    await expect(
      runTurn({
        ...target,
        body: "あ".repeat(MESSAGE_BODY_MAX_LENGTH + 1),
        calls: calls(),
      }),
    ).rejects.toThrow();
    expect(await db.getPendingBody(target.sessionId)).toBeUndefined();
  });
});

describe("再送", () => {
  it("預かってある本文で回し直し、成立すれば預かりは消える", async () => {
    const target = await newDialogue();

    await runTurn({
      ...target,
      body: "急ぐほど問いが痩せる気がする",
      calls: calls("ai_b"),
    });
    await retryTurn({ ...target, calls: calls() });

    const messages = await db.listMessages(target.sessionId);
    expect(messages.map((m) => m.speaker)).toEqual(["human", "ai_a", "ai_b"]);
    expect(messages[0].body).toBe("急ぐほど問いが痩せる気がする");
    expect(await db.getPendingBody(target.sessionId)).toBeUndefined();
  });

  it("また落ちれば預かりはそのまま残る", async () => {
    const target = await newDialogue();

    await runTurn({
      ...target,
      body: "急ぐほど問いが痩せる気がする",
      calls: calls("ai_b"),
    });
    await retryTurn({ ...target, calls: calls("ai_b") });

    expect(await db.listMessages(target.sessionId)).toEqual([]);
    expect(await db.getPendingBody(target.sessionId)).toBe(
      "急ぐほど問いが痩せる気がする",
    );
  });

  it("預かりが無ければ何もしない", async () => {
    const target = await newDialogue();

    await retryTurn({ ...target, calls: calls() });

    expect(await db.listMessages(target.sessionId)).toEqual([]);
  });

  it("待つあいだに新しい発話が来ていたら、その預かりは巻き添えにしない", async () => {
    const target = await newDialogue();

    // 再送の応答を待つあいだに新しい発話が送られた状態。
    // 二つの Server Action が同時に走ると起きるので、預かりを差し替えてから成立させて再現する。
    await db.savePendingBody(target.sessionId, "あとから送った発話");
    await db.commitTurn(target.sessionId, {
      human: "再送していた発話",
      ai_a: "具体の応答",
      ai_b: "抽象の応答",
    });

    expect(await db.getPendingBody(target.sessionId)).toBe(
      "あとから送った発話",
    );
  });

  it("預かりが無いまま成立させても投げない", async () => {
    const target = await newDialogue();

    await expect(
      db.commitTurn(target.sessionId, {
        human: "預けていない発話",
        ai_a: "具体の応答",
        ai_b: "抽象の応答",
      }),
    ).resolves.toBeUndefined();

    const messages = await db.listMessages(target.sessionId);
    expect(messages.map((m) => m.speaker)).toEqual(["human", "ai_a", "ai_b"]);
  });
});

describe("再訪", () => {
  it("新しいセッションを始めると、預かりは捨てられる", async () => {
    const target = await newDialogue();

    await runTurn({
      ...target,
      body: "急ぐほど問いが痩せる気がする",
      calls: calls("ai_b"),
    });
    await db.createSession(target.questionId);

    // 預かりを出す口も再送の口も最新のセッションにしか無いので、残すと画面から触れない行になる。
    expect(await db.getPendingBody(target.sessionId)).toBeUndefined();
  });
});
