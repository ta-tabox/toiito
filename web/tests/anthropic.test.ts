/**
 * Anthropic 固有の検査。
 * 深さの値域・env から設定を作る写像・Claude API へ送るリクエストの綴りを守る。
 *
 * env は process.env を触らず、env を模した object を渡す（HARNESS.md「テスト可能性の設計制約」2）。
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ANTHROPIC_DEFAULTS,
  type AnthropicSettings,
  EFFORT,
  isEffort,
  readAnthropicSettings,
  sendToAnthropic,
} from "@/lib/ai/anthropic";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** 実 API を叩く側の設定。 */
const SETTINGS: AnthropicSettings = {
  provider: "anthropic",
  model: ANTHROPIC_DEFAULTS.model,
  maxTokens: ANTHROPIC_DEFAULTS.maxTokens,
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
  effort: EFFORT.xhigh,
};

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
    system: string;
  };
}

/** 組み立て済みの本文を渡して一回叩く。 */
function send(settings: AnthropicSettings = SETTINGS) {
  return sendToAnthropic(settings, "# 抽象派", "組み立て済みの本文");
}

describe("思考の深さの値域", () => {
  it("API の値域だけを通す", () => {
    expect(isEffort("medium")).toBe(true);
    expect(isEffort("xhigh")).toBe(true);
    expect(isEffort("middle")).toBe(false);
    expect(isEffort("")).toBe(false);
  });
});

describe("既定値", () => {
  it("web/README.md の表と一致する", () => {
    expect(ANTHROPIC_DEFAULTS.model).toBe("claude-sonnet-5");
    expect(ANTHROPIC_DEFAULTS.maxTokens).toBe(16000);
    expect(ANTHROPIC_DEFAULTS.effort.concrete).toBeUndefined();
    expect(ANTHROPIC_DEFAULTS.effort.abstract).toBe("medium");
  });
});

describe("readAnthropicSettings", () => {
  it("未設定なら既定へ倒す", () => {
    expect(readAnthropicSettings({})).toEqual({
      concrete: {
        provider: "anthropic",
        model: ANTHROPIC_DEFAULTS.model,
        maxTokens: ANTHROPIC_DEFAULTS.maxTokens,
        effort: ANTHROPIC_DEFAULTS.effort.concrete,
        fake: false,
        apiKey: undefined,
      },
      abstract: {
        provider: "anthropic",
        model: ANTHROPIC_DEFAULTS.model,
        maxTokens: ANTHROPIC_DEFAULTS.maxTokens,
        effort: ANTHROPIC_DEFAULTS.effort.abstract,
        fake: false,
        apiKey: undefined,
      },
    });
  });

  it("深さ以外は全系統に同じ値が載る", () => {
    const env = {
      TOIITO_ANTHROPIC_MODEL: OVERRIDE.model,
      TOIITO_ANTHROPIC_MAX_TOKENS: String(OVERRIDE.maxTokens),
    };
    const settings = readAnthropicSettings(env);

    expect(settings.concrete.model).toBe(OVERRIDE.model);
    expect(settings.abstract.model).toBe(OVERRIDE.model);
    expect(settings.concrete.maxTokens).toBe(OVERRIDE.maxTokens);
    expect(settings.abstract.maxTokens).toBe(OVERRIDE.maxTokens);
  });

  it("数として読めない TOIITO_ANTHROPIC_MAX_TOKENS は既定へ倒す", () => {
    expect(
      readAnthropicSettings({ TOIITO_ANTHROPIC_MAX_TOKENS: "" }).concrete
        .maxTokens,
    ).toBe(ANTHROPIC_DEFAULTS.maxTokens);
    expect(
      readAnthropicSettings({ TOIITO_ANTHROPIC_MAX_TOKENS: "たくさん" })
        .concrete.maxTokens,
    ).toBe(ANTHROPIC_DEFAULTS.maxTokens);
  });

  it("フェイクモードが立つのは 1 のときだけ", () => {
    expect(readAnthropicSettings({ TOIITO_FAKE_AI: "1" }).concrete.fake).toBe(
      true,
    );
    expect(readAnthropicSettings({ TOIITO_FAKE_AI: "0" }).concrete.fake).toBe(
      false,
    );
    expect(
      readAnthropicSettings({ TOIITO_FAKE_AI: "true" }).concrete.fake,
    ).toBe(false);
  });

  it("TOIITO_ANTHROPIC_EFFORT_ABSTRACT の上書きが効く", () => {
    const env = { TOIITO_ANTHROPIC_EFFORT_ABSTRACT: OVERRIDE.effort };

    expect(readAnthropicSettings(env).abstract.effort).toBe(OVERRIDE.effort);
  });

  it("深さの値域の外は既定へ倒す", () => {
    const env = {
      TOIITO_ANTHROPIC_EFFORT_CONCRETE: "middle",
      TOIITO_ANTHROPIC_EFFORT_ABSTRACT: "middle",
    };
    const settings = readAnthropicSettings(env);

    expect(settings.concrete.effort).toBe(ANTHROPIC_DEFAULTS.effort.concrete);
    expect(settings.abstract.effort).toBe(ANTHROPIC_DEFAULTS.effort.abstract);
  });
});

describe("リクエストの組み立て", () => {
  it("API キー未設定なら呼び出し前に明示的に失敗する", async () => {
    await expect(send({ ...SETTINGS, apiKey: undefined })).rejects.toThrow(
      /ANTHROPIC_API_KEY/,
    );
  });

  it("モデルとトークン上限は渡された設定から載る", async () => {
    const fetchMock = stubOkResponse();

    await send({
      ...SETTINGS,
      model: OVERRIDE.model,
      maxTokens: OVERRIDE.maxTokens,
    });

    expect(sentBody(fetchMock).model).toBe(OVERRIDE.model);
    expect(sentBody(fetchMock).max_tokens).toBe(OVERRIDE.maxTokens);
  });

  it("設定に深さがあると output_config に載る", async () => {
    const fetchMock = stubOkResponse();

    await send({ ...SETTINGS, effort: EFFORT.medium });

    expect(sentBody(fetchMock).output_config).toEqual({
      effort: EFFORT.medium,
    });
  });

  it("設定に深さが無いと output_config を送らない（API の既定に任せる）", async () => {
    const fetchMock = stubOkResponse();

    await send();

    expect(sentBody(fetchMock).output_config).toBeUndefined();
  });

  it("役割定義は system へ載せる", async () => {
    const fetchMock = stubOkResponse();

    await send();

    expect(sentBody(fetchMock).system).toBe("# 抽象派");
  });
});

describe("応答の読み取り", () => {
  it("text ブロックだけを繋いで本文にする", async () => {
    stubApiResponse({
      content: [
        { type: "thinking", thinking: "外へ出さない" },
        { type: "text", text: "前半" },
        { type: "text", text: "後半" },
      ],
      stop_reason: "end_turn",
      usage: { input_tokens: 1200, output_tokens: 340 },
    });

    await expect(send()).resolves.toMatchObject({
      body: "前半後半",
      stopReason: "end_turn",
      inputTokens: 1200,
      outputTokens: 340,
      truncated: false,
    });
  });

  it("max_tokens で終わった応答を打ち切りとして通す", async () => {
    stubApiResponse({
      content: [{ type: "text", text: "途中で切れた発" }],
      stop_reason: "max_tokens",
    });

    await expect(send()).resolves.toMatchObject({ truncated: true });
  });

  it("usage が無い応答はトークン数を欠落として通す", async () => {
    stubApiResponse({
      content: [{ type: "text", text: "応答" }],
      stop_reason: "end_turn",
    });

    await expect(send()).resolves.toMatchObject({
      inputTokens: null,
      outputTokens: null,
    });
  });

  it("HTTP が失敗したら状態と本文の頭を添えて落とす", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("overloaded", { status: 529 })),
    );

    await expect(send()).rejects.toThrow(/529: overloaded/);
  });
});
