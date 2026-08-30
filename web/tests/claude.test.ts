import { afterEach, describe, expect, it, vi } from "vitest";
import { callPersona, type PersonaCall } from "@/lib/claude";
import { AI_DEFAULTS, type AiSettings } from "@/lib/config";
import { EFFORT } from "@/lib/effort";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** 実 API を叩く側の設定。 */
const SETTINGS: AiSettings = {
  model: AI_DEFAULTS.model,
  maxTokens: AI_DEFAULTS.maxTokens,
  fake: false,
  apiKey: "test-key",
};

/**
 * 渡した値が載ることを見るための上書き。
 * 既定と違うことだけに意味がある。
 */
const OVERRIDE = {
  model: "claude-opus-5",
  maxTokens: 2048,
};

/**
 * ペルソナ呼び出しの指定を組み立てる。
 * 既定は実モードの ai_b で、そのケースが見たい一点だけ上書きする。
 */
function personaCall(overrides: Partial<PersonaCall> = {}): PersonaCall {
  return { id: "ai_b", prompt: "# 抽象派", settings: SETTINGS, ...overrides };
}

/** フェイクモードの指定を組み立てる。 */
function fakeCall(id: PersonaCall["id"]): PersonaCall {
  return personaCall({ id, settings: { ...SETTINGS, fake: true } });
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
    model: string;
    max_tokens: number;
    output_config?: { effort: string };
    messages: { content: string }[];
  };
}

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

describe("実モード", () => {
  it("API キー未設定なら呼び出し前に明示的に失敗する", async () => {
    const call = personaCall({ settings: { ...SETTINGS, apiKey: undefined } });

    await expect(callPersona(call, { body: "q" }, [])).rejects.toThrow(
      /ANTHROPIC_API_KEY/,
    );
  });

  it("完結した応答の本文を返す", async () => {
    stubApiResponse({
      content: [{ type: "text", text: "最後まで出た発話" }],
      stop_reason: "end_turn",
    });

    await expect(callPersona(personaCall(), { body: "q" }, [])).resolves.toBe(
      "最後まで出た発話",
    );
  });

  it("max_tokens で打ち切られた応答は、途中までの本文を返さず失敗する", async () => {
    stubApiResponse({
      content: [{ type: "text", text: "途中で切れた発" }],
      stop_reason: "max_tokens",
    });

    await expect(callPersona(personaCall(), { body: "q" }, [])).rejects.toThrow(
      /max_tokens/,
    );
  });

  it("text ブロックの無い応答は、空文字列を返さず失敗する", async () => {
    stubApiResponse({
      content: [{ type: "thinking", thinking: "" }],
      stop_reason: "end_turn",
    });

    await expect(callPersona(personaCall(), { body: "q" }, [])).rejects.toThrow(
      /text ブロック/,
    );
  });
});

describe("呼び出しログ", () => {
  /** console.log を捕まえて、残った行を JSON として読めるようにする。 */
  function captureLog() {
    return vi.spyOn(console, "log").mockImplementation(() => {});
  }

  it("応答をパースした時点で 1 行の JSON を残す", async () => {
    const logged = captureLog();
    stubApiResponse({
      content: [{ type: "text", text: "十文字ちょうどの本文" }],
      stop_reason: "end_turn",
      usage: { input_tokens: 1200, output_tokens: 340 },
    });

    await callPersona(personaCall({ id: "ai_b" }), { body: "q" }, []);

    expect(logged).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(logged.mock.calls[0][0]))).toMatchObject({
      event: "claude_call",
      model: AI_DEFAULTS.model,
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

describe("リクエストの組み立て", () => {
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

  it("effort を渡すと output_config に載る", async () => {
    const fetchMock = stubOkResponse();

    const call = personaCall({ effort: EFFORT.medium });

    await callPersona(call, { body: "q" }, []);

    expect(sentBody(fetchMock).output_config).toEqual({
      effort: EFFORT.medium,
    });
  });

  it("effort を省くと output_config を送らない（API の既定に任せる）", async () => {
    const fetchMock = stubOkResponse();

    await callPersona(personaCall(), { body: "q" }, []);

    expect(sentBody(fetchMock).output_config).toBeUndefined();
  });

  it("モデルとトークン上限は渡された設定から載る", async () => {
    const fetchMock = stubOkResponse();
    const settings: AiSettings = { ...SETTINGS, ...OVERRIDE };

    await callPersona(personaCall({ settings }), { body: "q" }, []);

    expect(sentBody(fetchMock).model).toBe(OVERRIDE.model);
    expect(sentBody(fetchMock).max_tokens).toBe(OVERRIDE.maxTokens);
  });
});
