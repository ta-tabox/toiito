/**
 * 呼び出し規約の検査。
 * プロバイダに依らない決め事——フェイクモード・記録・欠けた本文を返さないこと・本文の組み立て——を守る。
 * 唯一の実装が Anthropic なので、実モードは Claude API を模した fetch 越しに辿る。
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { callPersona, type PersonaCall } from "@/lib/ai";
import {
  ANTHROPIC_DEFAULTS,
  AnthropicProvider,
  type AnthropicSettings,
} from "@/lib/ai/anthropic";
import { readFakeMode } from "@/lib/ai/provider";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** 実 API を叩く側の設定。 */
const SETTINGS: AnthropicSettings = {
  model: ANTHROPIC_DEFAULTS.model,
  maxTokens: ANTHROPIC_DEFAULTS.maxTokens,
  fake: false,
  apiKey: "test-key",
};

/**
 * 唯一の実装。
 * 規約の検査は、この一つを通して辿る。
 */
const PROVIDER = new AnthropicProvider(SETTINGS);

/**
 * ペルソナ呼び出しの指定を組み立てる。
 * 既定は実モードの ai_b で、そのケースが見たい一点だけ上書きする。
 */
function personaCall(overrides: Partial<PersonaCall> = {}): PersonaCall {
  return { id: "ai_b", prompt: "# 抽象派", provider: PROVIDER, ...overrides };
}

/** フェイクモードの指定を組み立てる。 */
function fakeCall(id: PersonaCall["id"]): PersonaCall {
  return personaCall({
    id,
    provider: new AnthropicProvider({ ...SETTINGS, fake: true }),
  });
}

/** Claude API の応答一件を返す fetch に差し替える。 */
function stubApiResponse(payload: unknown) {
  const fetchMock = vi.fn<
    (url: string, init: RequestInit) => Promise<Response>
  >(async () => new Response(JSON.stringify(payload), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);

  return fetchMock;
}

/**
 * 完結した応答を一件返す fetch に差し替える。
 * 中身を問わないテスト向け。
 */
function stubOkResponse() {
  return stubApiResponse({
    content: [{ type: "text", text: "応答" }],
    stop_reason: "end_turn",
  });
}

/** モックした fetch が送ったリクエストボディを読む。 */
function sentBody(fetchMock: ReturnType<typeof stubApiResponse>) {
  return JSON.parse(String(fetchMock.mock.calls[0][1].body)) as {
    messages: { content: string }[];
  };
}

describe("readFakeMode", () => {
  it("立つのは 1 のときだけ", () => {
    expect(readFakeMode({ TOIITO_FAKE_AI: "1" })).toBe(true);
    expect(readFakeMode({ TOIITO_FAKE_AI: "0" })).toBe(false);
    expect(readFakeMode({ TOIITO_FAKE_AI: "true" })).toBe(false);
    expect(readFakeMode({})).toBe(false);
  });
});

describe("フェイクモード", () => {
  it("ネットワークに出ず、ペルソナ ID と直近の人間発話を含む決定的応答を返す", async () => {
    const res = await callPersona(fakeCall("ai_a"), { body: "問い本文" }, [
      { speaker: "human", body: "最初の発話" },
    ]);

    expect(res).toContain("ai_a");
    expect(res).toContain("最初の発話");
  });

  it("同じ入力には同じ応答（決定性）", async () => {
    const t = [{ speaker: "human" as const, body: "同じ入力" }];
    expect(await callPersona(fakeCall("ai_b"), { body: "q" }, t)).toBe(
      await callPersona(fakeCall("ai_b"), { body: "q" }, t),
    );
  });
});

describe("応答の受け取り", () => {
  it("完結した応答の本文を返す", async () => {
    stubApiResponse({
      content: [{ type: "text", text: "最後まで出た発話" }],
      stop_reason: "end_turn",
    });

    await expect(callPersona(personaCall(), { body: "q" }, [])).resolves.toBe(
      "最後まで出た発話",
    );
  });

  it("上限で打ち切られた応答は、途中までの本文を返さず失敗する", async () => {
    stubApiResponse({
      content: [{ type: "text", text: "途中で切れた発" }],
      stop_reason: "max_tokens",
    });

    await expect(callPersona(personaCall(), { body: "q" }, [])).rejects.toThrow(
      /maxTokens/,
    );
  });

  it("本文の無い応答は、空文字列を返さず失敗する", async () => {
    stubApiResponse({
      content: [{ type: "thinking", thinking: "" }],
      stop_reason: "end_turn",
    });

    await expect(callPersona(personaCall(), { body: "q" }, [])).rejects.toThrow(
      /本文が無い/,
    );
  });
});

describe("呼び出しログ", () => {
  /** console.log を捕まえて、残った行を JSON として読めるようにする。 */
  function captureLog() {
    return vi.spyOn(console, "log").mockImplementation(() => {});
  }

  it("応答を受け取った時点で 1 行の JSON を残す", async () => {
    const logged = captureLog();
    stubApiResponse({
      content: [{ type: "text", text: "十文字ちょうどの本文" }],
      stop_reason: "end_turn",
      usage: { input_tokens: 1200, output_tokens: 340 },
    });

    await callPersona(personaCall({ id: "ai_b" }), { body: "q" }, []);

    expect(logged).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(logged.mock.calls[0][0]))).toMatchObject({
      event: "ai_call",
      provider: "anthropic",
      model: ANTHROPIC_DEFAULTS.model,
      persona: "ai_b",
      stop_reason: "end_turn",
      input_tokens: 1200,
      output_tokens: 340,
      body_length: 10,
    });
  });

  it("発話本文そのものは残さない", async () => {
    const logged = captureLog();
    stubApiResponse({
      content: [{ type: "text", text: "外へ出してはいけない問いの中身" }],
      stop_reason: "end_turn",
    });

    await callPersona(personaCall({ id: "ai_a" }), { body: "q" }, []);

    expect(String(logged.mock.calls[0][0])).not.toContain(
      "外へ出してはいけない問いの中身",
    );
  });

  it("打ち切られた呼び出しも、例外を投げる前に残す", async () => {
    const logged = captureLog();
    stubApiResponse({
      content: [{ type: "text", text: "途中で切れた発" }],
      stop_reason: "max_tokens",
    });

    await expect(
      callPersona(personaCall(), { body: "q" }, []),
    ).rejects.toThrow();

    expect(logged).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(logged.mock.calls[0][0]))).toMatchObject({
      stop_reason: "max_tokens",
    });
  });
});

describe("本文の組み立て", () => {
  it("発話者の見出しに内部 ID を出さない", async () => {
    const fetchMock = stubOkResponse();

    await callPersona(personaCall(), { body: "q" }, [
      { speaker: "human", body: "問いを投げた" },
      { speaker: "ai_a", body: "具体で問い返した" },
    ]);

    const content = sentBody(fetchMock).messages[0].content;
    expect(content).toContain("【あなた】");
    expect(content).toContain("【具体さん】");
    expect(content).not.toContain("ai_a");
  });

  it("現在の形があれば、原型と併せて渡す", async () => {
    const fetchMock = stubOkResponse();

    await callPersona(
      personaCall(),
      { body: "原型の問い", current_form: "言い直された焦点" },
      [],
    );

    const content = sentBody(fetchMock).messages[0].content;
    expect(content).toContain("原型の問い");
    expect(content).toContain("言い直された焦点");
  });
});
