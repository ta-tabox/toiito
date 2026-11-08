/**
 * 一往復で呼ぶ二体のプロバイダを、利用者の API キーとモデルの設定から決める配線の検査。
 *
 * 見るのは、プロバイダへ渡った API キーとモデル・利用量の行の API キーの出所・`messages` と `pending_messages` の残り方・ログの文字列までで、AI の応答の中身は見ない。
 * 実 API は叩かない（`docs/HARNESS.md`「実 API を自動テストで叩かない」）。
 */

import { createOwner } from "@tests/setup/owner";
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  ANTHROPIC_DEFAULTS,
  ANTHROPIC_MODELS,
  type AnthropicCredentials,
  readAnthropicProvider,
} from "@/lib/ai/anthropic";
import { AiProvider, type ProviderResponse } from "@/lib/ai/provider";
import * as db from "@/lib/db";
import { encryptApiKey } from "@/lib/secrets";
import { encryptionKeyRing } from "@/lib/secrets-config";
import { type ProviderFor, personaCalls, runTurn } from "@/lib/turn";
import type { OwnerId } from "@/lib/types";

/** 利用者が登録する API キーの平文。 */
const USER_API_KEY = "sk-ant-api03-user-key-for-persona-calls-test";

/** 応答の本文で、利用者の API キーを含まない決定的な値。 */
const STUB_RESPONSE: ProviderResponse = {
  body: "実モードで返した応答",
  stopReason: "end_turn",
  inputTokens: 100,
  outputTokens: 20,
  truncated: false,
  searchResultUrls: [],
  webSearchCount: 0,
};

/**
 * 受け取った API キーとモデルを持ち、ネットワークに出ずに決定的な応答を返すプロバイダ。
 * 本物と違い送る先を持たないので、`personaCalls` がどの API キーとモデルでプロバイダを作ったかだけを検査できる。
 */
class CredentialsStubProvider extends AiProvider {
  readonly name = "stub";
  readonly settings;
  readonly credentials: AnthropicCredentials | undefined;
  readonly #fails: boolean;

  constructor(credentials: AnthropicCredentials | undefined, fails: boolean) {
    super();
    this.credentials = credentials;
    this.settings = {
      model: credentials?.model ?? ANTHROPIC_DEFAULTS.model,
      maxTokens: ANTHROPIC_DEFAULTS.maxTokens,
      timeoutMs: ANTHROPIC_DEFAULTS.timeoutMs,
      fake: false,
    };
    this.#fails = fails;
  }

  /** 作るときに失敗を指示されていれば throw し、そうでなければ決定的な応答を返す。 */
  async send(): Promise<ProviderResponse> {
    if (this.#fails) {
      throw new Error("stub: 応答が返らない");
    }

    return STUB_RESPONSE;
  }
}

/**
 * `CredentialsStubProvider` を作るプロバイダの作り方を返す。
 * `fails` が true なら、作ったプロバイダは送るたびに throw する。
 */
function stubProviderFor(fails = false): ProviderFor {
  return (credentials) => new CredentialsStubProvider(credentials, fails);
}

/** `owner` の API キーを `plain` で登録し、モデルを `model` にする。 */
async function registerApiKey(
  owner: OwnerId,
  model: string | null,
  plain = USER_API_KEY,
): Promise<void> {
  await db.saveModelSetting(owner, {
    model,
    encrypted_api_key: encryptApiKey(plain, encryptionKeyRing()),
  });
}

/** `owner` の問いと最初のセッションを立てる。 */
async function newDialogue(owner: OwnerId) {
  const { session } = await db.createQuestion(
    owner,
    "速さを求めることは、何を失うことなのか",
  );

  return session.id;
}

let owner: OwnerId;

beforeEach(async () => {
  owner = await createOwner();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

afterAll(async () => {
  await db.disconnect();
});

describe("personaCalls", () => {
  it("API キーを登録した利用者の呼び出しには、その利用者の API キーと選んだモデルが載る", async () => {
    await registerApiKey(owner, ANTHROPIC_MODELS.opus5);

    const calls = await personaCalls(owner, stubProviderFor());
    const provider = calls.ai_a.provider as CredentialsStubProvider;

    expect(provider.credentials).toEqual({
      apiKey: USER_API_KEY,
      model: ANTHROPIC_MODELS.opus5,
    });
    expect(calls.ai_b.provider).toBe(provider);
  });

  it("API キーを登録してモデルを選んでいない利用者の呼び出しには、既定のモデルが載る", async () => {
    await registerApiKey(owner, null);

    const calls = await personaCalls(owner, stubProviderFor());
    const provider = calls.ai_a.provider as CredentialsStubProvider;

    expect(provider.credentials?.model).toBe(ANTHROPIC_DEFAULTS.model);
  });

  it("API キーを登録していない利用者の呼び出しには運営の API キーが載り、選んだモデルは使われない", async () => {
    await db.saveModelSetting(owner, { model: ANTHROPIC_MODELS.opus5 });

    const calls = await personaCalls(owner, stubProviderFor());
    const provider = calls.ai_a.provider as CredentialsStubProvider;

    expect(provider.credentials).toBeUndefined();
  });

  it("保存されたモデルが選べるモデルの外なら throw する", async () => {
    await registerApiKey(owner, "claude-unknown-model");

    await expect(personaCalls(owner, stubProviderFor())).rejects.toThrow(
      "claude-unknown-model",
    );
  });
});

describe("API キーの出所の記録", () => {
  it("利用者の API キーで呼ぶと、利用量の行の出所が user になる", async () => {
    await registerApiKey(owner, ANTHROPIC_MODELS.opus5);
    const sessionId = await newDialogue(owner);

    await runTurn({
      owner,
      sessionId,
      body: "急ぐほど問いが痩せる気がする",
      resolveCalls: (target) => personaCalls(target, stubProviderFor()),
    });
    const logs = await db.listUsageLogs(owner);

    expect(logs.map((log) => log.key_source)).toEqual(["user", "user"]);
    expect(logs[0].model).toBe(ANTHROPIC_MODELS.opus5);
  });

  it("運営の API キーで呼ぶと、利用量の行の出所が system になる", async () => {
    const sessionId = await newDialogue(owner);

    await runTurn({
      owner,
      sessionId,
      body: "急ぐほど問いが痩せる気がする",
      resolveCalls: (target) => personaCalls(target, stubProviderFor()),
    });
    const logs = await db.listUsageLogs(owner);

    expect(logs.map((log) => log.key_source)).toEqual(["system", "system"]);
  });
});

describe("一往復の失敗とフェイクモード", () => {
  it("フェイクモードでは、API キーの有無に関わらず fetch が呼ばれない", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const other = await createOwner("other@example.com");
    await registerApiKey(owner, ANTHROPIC_MODELS.opus5);
    const fakeProviderFor: ProviderFor = (credentials) =>
      readAnthropicProvider({}, true, credentials);

    const sessionIds = [];

    for (const target of [owner, other]) {
      const sessionId = await newDialogue(target);
      sessionIds.push(sessionId);

      await runTurn({
        owner: target,
        sessionId,
        body: "急ぐほど問いが痩せる気がする",
        resolveCalls: (id) => personaCalls(id, fakeProviderFor),
      });
    }
    const ownerMessages = await db.listMessages(owner, sessionIds[0]);
    const otherMessages = await db.listMessages(other, sessionIds[1]);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(ownerMessages).toHaveLength(3);
    expect(otherMessages).toHaveLength(3);
  });

  it("API キーを復号できなければ、messages は空のままで pending_messages に本文が残る", async () => {
    await db.saveModelSetting(owner, {
      model: null,
      encrypted_api_key: "gone:AAAAAAAAAAAAAAAA:AAAAAAAAAAAAAAAAAAAAAA==:AAAA",
    });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const sessionId = await newDialogue(owner);

    await runTurn({
      owner,
      sessionId,
      body: "復号に失敗する一往復",
      resolveCalls: (target) => personaCalls(target, stubProviderFor()),
    });

    expect(await db.listMessages(owner, sessionId)).toEqual([]);
    expect(await db.getPendingBody(owner, sessionId)).toBe(
      "復号に失敗する一往復",
    );
  });

  it("ai_call と turn_failed のログに、利用者の API キーの平文が含まれない", async () => {
    await registerApiKey(owner, ANTHROPIC_MODELS.opus5);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const sessionId = await newDialogue(owner);

    await runTurn({
      owner,
      sessionId,
      body: "ログを見る一往復",
      resolveCalls: (target) => personaCalls(target, stubProviderFor()),
    });
    await runTurn({
      owner,
      sessionId,
      body: "失敗する一往復",
      resolveCalls: (target) => personaCalls(target, stubProviderFor(true)),
    });
    const written = [...logSpy.mock.calls, ...errorSpy.mock.calls]
      .flat()
      .map(String);

    expect(written.some((line) => line.includes('"event":"ai_call"'))).toBe(
      true,
    );
    expect(written.some((line) => line.includes('"event":"turn_failed"'))).toBe(
      true,
    );
    expect(written.filter((line) => line.includes(USER_API_KEY))).toEqual([]);
  });
});
