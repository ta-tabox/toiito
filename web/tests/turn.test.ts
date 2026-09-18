/**
 * 一往復が途中で失敗したとき・同じセッションへ並走したとき・過去のセッションへ向けられたときに、何が残るかの検査。
 *
 * 見るのは `messages` と `pending_messages` の二つだけで、AI の応答の中身は見ない（呼び出し規約は `ai.test.ts` が検査する）。
 * 実 API は叩かない（`docs/HARNESS.md`「実 API を自動テストで叩かない」）。
 */

import { createOwner } from "@tests/setup/owner";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { ANTHROPIC_DEFAULTS, AnthropicProvider } from "@/lib/ai/anthropic";
import type { PersonaCall } from "@/lib/ai/persona-call";
import { AiProvider, type ProviderResponse } from "@/lib/ai/provider";
import * as db from "@/lib/db";
import { MESSAGE_BODY_MAX_LENGTH } from "@/lib/message";
import { loadPersona, type PersonaId } from "@/lib/personas";
import { type PersonaCalls, retryTurn, runTurn } from "@/lib/turn";
import type { OwnerId, UsageInput } from "@/lib/types";

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
 * `callPersona` は `settings.fake` が true だと `send` を呼ばないので、`settings.fake` を false にしてある。
 * 5 つある失敗経路のどれで投げたかは `speakAction` から見て区別が付かないため、代表して一つだけ模す。
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
 * テストが指示するまで応答を返さない AI プロバイダ。
 * 一往復が AI の応答を待っているあいだに、別の書き込みを割り込ませる検査に使う。
 *
 * `callPersona` は `settings.fake` が true だと `send` を呼ばないので、`settings.fake` を false にしてある。
 */
class GatedProvider extends AiProvider {
  readonly name = "gated";
  readonly settings = { ...FAKE_PROVIDER.settings, fake: false };
  readonly #reached = Promise.withResolvers<void>();
  readonly #opened = Promise.withResolvers<void>();

  /** `send` が呼ばれて止まった時点で解決する Promise を返す。 */
  get reached(): Promise<void> {
    return this.#reached.promise;
  }

  /** 止まっている `send` を進める。 */
  open(): void {
    this.#opened.resolve();
  }

  /** 止まったことを `reached` へ知らせ、`open` を待ってから決定的な応答を返す。 */
  async send(): Promise<ProviderResponse> {
    this.#reached.resolve();
    await this.#opened.promise;

    return {
      body: "止めてから返した応答",
      stopReason: "end_turn",
      inputTokens: 0,
      outputTokens: 0,
      truncated: false,
      searchResultUrls: [],
      webSearchCount: 0,
    };
  }
}

/**
 * 実モードのまま、ネットワークに出ずにトークン数つきの応答を返すプロバイダ。
 * フェイクモードの呼び出しは利用量を記録しないので、`settings.fake` を false にしてある。
 */
class StubProvider extends AiProvider {
  readonly name = "stub";
  readonly settings = { ...FAKE_PROVIDER.settings, fake: false };

  /** ネットワークに出ずに、トークン数を持つ決定的な応答を返す。 */
  async send(): Promise<ProviderResponse> {
    return {
      body: "実モードで返した応答",
      stopReason: "end_turn",
      inputTokens: 1200,
      outputTokens: 340,
      truncated: false,
      searchResultUrls: [],
      webSearchCount: 0,
    };
  }
}

/** 一往復ぶんの話者の並び。 */
const ONE_TURN = ["human", "ai_a", "ai_b"];

/**
 * 二体ぶんの呼び出し指定を、`provider` が体ごとに返すプロバイダと、`owner` の利用量を書く関数で組み立てる。
 */
function callsFor(
  owner: OwnerId,
  provider: (id: PersonaId) => AiProvider,
): PersonaCalls {
  const call = (id: PersonaId): PersonaCall => ({
    id,
    prompt: loadPersona(id),
    provider: provider(id),
    recordUsage: (usage: UsageInput) => db.recordUsage(owner, usage),
  });

  return { ai_a: call("ai_a"), ai_b: call("ai_b") };
}

/**
 * 二体ぶんの呼び出し指定を解決する関数を返す。
 * 既定は両方フェイクで、失敗させたい体だけ差し替える。
 */
function callsResolver(
  failing?: PersonaId,
): (owner: OwnerId) => Promise<PersonaCalls> {
  return async (owner) =>
    callsFor(owner, (id) =>
      id === failing ? new FailingProvider() : FAKE_PROVIDER,
    );
}

/** ai_a だけを `gate` で止める呼び出し指定を解決する関数を返す。 */
function callsResolverGatedBy(
  gate: GatedProvider,
): (owner: OwnerId) => Promise<PersonaCalls> {
  return async (owner) =>
    callsFor(owner, (id) => (id === "ai_a" ? gate : FAKE_PROVIDER));
}

/** 二体とも `StubProvider` で応答させる呼び出し指定を解決する関数を返す。 */
function callsResolverStubbed(): (owner: OwnerId) => Promise<PersonaCalls> {
  const provider = new StubProvider();

  return async (owner) => callsFor(owner, () => provider);
}

let owner: OwnerId;

beforeEach(async () => {
  owner = await createOwner();
});

/** 問いと、その最初のセッションを立てる。 */
async function newDialogue() {
  const { question, session } = await db.createQuestion(
    owner,
    "速さを求めることは、何を失うことなのか",
  );

  return { owner, questionId: question.id, sessionId: session.id };
}

afterAll(async () => {
  await db.disconnect();
});

describe("一往復", () => {
  it("ai_a と ai_b が揃えば三行が入り、pending_messages の行は消える", async () => {
    const target = await newDialogue();

    await runTurn({
      ...target,
      body: "急ぐほど問いが痩せる気がする",
      resolveCalls: callsResolver(),
    });

    const messages = await db.listMessages(owner, target.sessionId);
    expect(messages.map((m) => m.speaker)).toEqual(["human", "ai_a", "ai_b"]);
    expect(messages[0].body).toBe("急ぐほど問いが痩せる気がする");
    const pending = await db.getPendingBody(owner, target.sessionId);
    expect(pending).toBeUndefined();
  });

  it("実モードで二体が揃うと、その利用者の利用量の行が二体ぶん入る", async () => {
    const target = await newDialogue();

    await runTurn({
      ...target,
      body: "急ぐほど問いが痩せる気がする",
      resolveCalls: callsResolverStubbed(),
    });

    const logs = await db.listUsageLogs(owner);

    expect(logs).toHaveLength(2);
    expect(logs.map((log) => log.kind)).toEqual(["persona", "persona"]);
    expect(logs[0]).toMatchObject({
      provider: "stub",
      input_tokens: 1200,
      output_tokens: 340,
    });
  });

  it("ai_b が失敗すると messages は空のままで、pending_messages に本文が残る", async () => {
    const target = await newDialogue();

    await runTurn({
      ...target,
      body: "急ぐほど問いが痩せる気がする",
      resolveCalls: callsResolver("ai_b"),
    });

    const messages = await db.listMessages(owner, target.sessionId);
    const pending = await db.getPendingBody(owner, target.sessionId);

    // ai_a は成功しているが、成立していない一往復の断片は置かない。
    expect(messages).toEqual([]);
    expect(pending).toBe("急ぐほど問いが痩せる気がする");
  });

  it("ai_a が落ちたときも同じ", async () => {
    const target = await newDialogue();

    await runTurn({
      ...target,
      body: "急ぐほど問いが痩せる気がする",
      resolveCalls: callsResolver("ai_a"),
    });

    const messages = await db.listMessages(owner, target.sessionId);
    const pending = await db.getPendingBody(owner, target.sessionId);

    expect(messages).toEqual([]);
    expect(pending).toBe("急ぐほど問いが痩せる気がする");
  });

  it("ペルソナの決定に失敗すると messages は空のままで、pending_messages に本文が残る", async () => {
    const target = await newDialogue();

    await runTurn({
      ...target,
      body: "急ぐほど問いが痩せる気がする",
      resolveCalls: () => Promise.reject(new Error("ペルソナを決められない")),
    });

    const messages = await db.listMessages(owner, target.sessionId);
    const pending = await db.getPendingBody(owner, target.sessionId);

    expect(messages).toEqual([]);
    expect(pending).toBe("急ぐほど問いが痩せる気がする");
  });

  it("失敗のあとに同じ文言を送り直しても、human が二重に積まれない", async () => {
    const target = await newDialogue();
    const body = "急ぐほど問いが痩せる気がする";

    await runTurn({ ...target, body, resolveCalls: callsResolver("ai_b") });
    await runTurn({ ...target, body, resolveCalls: callsResolver() });

    const messages = await db.listMessages(owner, target.sessionId);
    expect(messages.map((m) => m.speaker)).toEqual(["human", "ai_a", "ai_b"]);
  });

  it("前の一往復が成立していれば、次の発話はその上へ積まれる", async () => {
    const target = await newDialogue();

    await runTurn({ ...target, body: "一つ目", resolveCalls: callsResolver() });
    await runTurn({ ...target, body: "二つ目", resolveCalls: callsResolver() });

    const messages = await db.listMessages(owner, target.sessionId);
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

  it("上限を超える本文は書き込む前に拒否する", async () => {
    const target = await newDialogue();

    await expect(
      runTurn({
        ...target,
        body: "あ".repeat(MESSAGE_BODY_MAX_LENGTH + 1),
        resolveCalls: callsResolver(),
      }),
    ).rejects.toThrow();
    const pending = await db.getPendingBody(owner, target.sessionId);
    expect(pending).toBeUndefined();
  });
});

describe("再送", () => {
  it("pending_messages の本文で回し直すと、三行が入って行が消える", async () => {
    const target = await newDialogue();

    await runTurn({
      ...target,
      body: "急ぐほど問いが痩せる気がする",
      resolveCalls: callsResolver("ai_b"),
    });
    await retryTurn({ ...target, resolveCalls: callsResolver() });

    const messages = await db.listMessages(owner, target.sessionId);
    expect(messages.map((m) => m.speaker)).toEqual(["human", "ai_a", "ai_b"]);
    expect(messages[0].body).toBe("急ぐほど問いが痩せる気がする");
    const pending = await db.getPendingBody(owner, target.sessionId);
    expect(pending).toBeUndefined();
  });

  it("もう一度失敗すれば pending_messages の行は残る", async () => {
    const target = await newDialogue();

    await runTurn({
      ...target,
      body: "急ぐほど問いが痩せる気がする",
      resolveCalls: callsResolver("ai_b"),
    });
    await retryTurn({ ...target, resolveCalls: callsResolver("ai_b") });

    const messages = await db.listMessages(owner, target.sessionId);
    const pending = await db.getPendingBody(owner, target.sessionId);

    expect(messages).toEqual([]);
    expect(pending).toBe("急ぐほど問いが痩せる気がする");
  });

  it("pending_messages に行が無ければ何もしない", async () => {
    const target = await newDialogue();

    await retryTurn({ ...target, resolveCalls: callsResolver() });

    const messages = await db.listMessages(owner, target.sessionId);
    expect(messages).toEqual([]);
  });

  it("待つあいだに新しい発話が来ていたら、その行は削除しない", async () => {
    const target = await newDialogue();

    // 再送の応答を待つあいだに新しい発話が送られた状態を作る。
    // 二つの Server Action が同時に走ると起きるので、行を上書きしてから commitTurn する。
    await db.savePendingBody(owner, target.sessionId, "あとから送った発話");
    await db.commitTurn(owner, target.sessionId, {
      bodies: {
        human: "再送していた発話",
        ai_a: "具体の応答",
        ai_b: "抽象の応答",
      },
      messageCountAtStart: 0,
    });

    const pending = await db.getPendingBody(owner, target.sessionId);
    expect(pending).toBe("あとから送った発話");
  });

  it("pending_messages に行が無いまま commitTurn しても throw しない", async () => {
    const target = await newDialogue();

    await expect(
      db.commitTurn(owner, target.sessionId, {
        bodies: {
          human: "預けていない発話",
          ai_a: "具体の応答",
          ai_b: "抽象の応答",
        },
        messageCountAtStart: 0,
      }),
    ).resolves.toBe(true);

    const messages = await db.listMessages(owner, target.sessionId);
    expect(messages.map((m) => m.speaker)).toEqual(["human", "ai_a", "ai_b"]);
  });
});

describe("再訪", () => {
  it("新しいセッションを作ると pending_messages の行は削除される", async () => {
    const target = await newDialogue();

    await runTurn({
      ...target,
      body: "急ぐほど問いが痩せる気がする",
      resolveCalls: callsResolver("ai_b"),
    });
    await db.createSession(owner, target.questionId);

    // 再送の UI は最新のセッションにしか出ないので、残すと再送できない行になる。
    const pending = await db.getPendingBody(owner, target.sessionId);
    expect(pending).toBeUndefined();
  });

  it("過去のセッションへの一往復は throw し、発話も保留も書き込まない", async () => {
    const target = await newDialogue();
    await db.createSession(owner, target.questionId);

    await expect(
      runTurn({
        ...target,
        body: "過去へ足す発話",
        resolveCalls: callsResolver(),
      }),
    ).rejects.toThrow(/最新のセッションでない/);

    const messages = await db.listMessages(owner, target.sessionId);
    const pending = await db.getPendingBody(owner, target.sessionId);

    expect(messages).toEqual([]);
    expect(pending).toBeUndefined();
  });
});

describe("並走", () => {
  it("同じセッションへ二本の一往復を同時に走らせても、messages は一往復ぶんか二往復ぶんの並びになる", async () => {
    const target = await newDialogue();

    await Promise.all([
      runTurn({ ...target, body: "一本目", resolveCalls: callsResolver() }),
      runTurn({ ...target, body: "二本目", resolveCalls: callsResolver() }),
    ]);

    const messages = await db.listMessages(owner, target.sessionId);
    const speakers = messages.map((m) => m.speaker);

    expect([ONE_TURN, [...ONE_TURN, ...ONE_TURN]]).toContainEqual(speakers);
  });

  it("再送を待つあいだに送った発話は、再送が先に成立すると messages へ入らず、pending_messages に残る", async () => {
    const target = await newDialogue();
    const retrying = new GatedProvider();
    const speaking = new GatedProvider();

    const retry = runTurn({
      ...target,
      body: "再送した発話",
      resolveCalls: callsResolverGatedBy(retrying),
    });
    await retrying.reached;

    const speak = runTurn({
      ...target,
      body: "あとから送った発話",
      resolveCalls: callsResolverGatedBy(speaking),
    });
    await speaking.reached;

    // 二本とも AI を待っている。
    // 再送の一往復を先に書き込ませ、あとから送った発話の一往復には、再送が書き込む前に読んだ発話の数のまま書き込ませる。
    retrying.open();
    await retry;
    speaking.open();
    await speak;

    const messages = await db.listMessages(owner, target.sessionId);
    const pending = await db.getPendingBody(owner, target.sessionId);

    expect(messages.map((m) => m.speaker)).toEqual(ONE_TURN);
    expect(messages[0].body).toBe("再送した発話");
    expect(pending).toBe("あとから送った発話");
  });

  it("応答を待つあいだに新しいセッションが作られると、待っていた一往復は古いセッションへ書き込まない", async () => {
    const target = await newDialogue();
    const waiting = new GatedProvider();

    const turn = runTurn({
      ...target,
      body: "待っていた発話",
      resolveCalls: callsResolverGatedBy(waiting),
    });
    await waiting.reached;

    await db.createSession(owner, target.questionId);
    waiting.open();
    await turn;

    const messages = await db.listMessages(owner, target.sessionId);
    expect(messages).toEqual([]);
  });

  it("書き込む時点で発話の数が一往復を始めたときと違えば、commitTurn は何も書かずに false を返す", async () => {
    const target = await newDialogue();
    const turn = {
      bodies: { human: "発話", ai_a: "具体の応答", ai_b: "抽象の応答" },
      messageCountAtStart: 0,
    };

    const first = await db.commitTurn(owner, target.sessionId, turn);
    const second = await db.commitTurn(owner, target.sessionId, turn);

    const messages = await db.listMessages(owner, target.sessionId);
    expect(first).toBe(true);
    expect(second).toBe(false);
    expect(messages.map((m) => m.speaker)).toEqual(ONE_TURN);
  });
});
