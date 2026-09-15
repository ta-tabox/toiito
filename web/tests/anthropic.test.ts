/**
 * Anthropic 固有の検査。
 * 深さの値域・env から設定を作る写像・Claude API へ送るリクエストの中身を守る。
 *
 * env は `process.env` を触らず、env を模した object を渡す（規約は `src/lib/ai/providers.ts`）。
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ANTHROPIC_DEFAULTS,
  ANTHROPIC_EFFORT,
  AnthropicProvider,
  type AnthropicSettings,
  readAnthropicProvider,
  readAnthropicSettings,
} from "@/lib/ai/anthropic";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** 実 API を叩く側の設定。 */
const SETTINGS: AnthropicSettings = {
  model: ANTHROPIC_DEFAULTS.model,
  maxTokens: ANTHROPIC_DEFAULTS.maxTokens,
  timeoutMs: ANTHROPIC_DEFAULTS.timeoutMs,
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
  timeoutMs: 5000,
  effort: ANTHROPIC_EFFORT.xhigh,
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
  return new AnthropicProvider(settings).send(
    "# 抽象派",
    "組み立て済みの本文",
    AbortSignal.timeout(settings.timeoutMs),
  );
}

describe("既定値", () => {
  it("web/README.md の表と一致する", () => {
    expect(ANTHROPIC_DEFAULTS.model).toBe("claude-sonnet-5");
    expect(ANTHROPIC_DEFAULTS.maxTokens).toBe(16000);
    expect(ANTHROPIC_DEFAULTS.timeoutMs).toBe(120000);
    expect(ANTHROPIC_DEFAULTS.effort).toBe("medium");
  });
});

describe("readAnthropicSettings", () => {
  it("未設定なら既定へ倒す", () => {
    expect(readAnthropicSettings({}, false)).toEqual({
      model: ANTHROPIC_DEFAULTS.model,
      maxTokens: ANTHROPIC_DEFAULTS.maxTokens,
      timeoutMs: ANTHROPIC_DEFAULTS.timeoutMs,
      effort: ANTHROPIC_DEFAULTS.effort,
      fake: false,
      apiKey: undefined,
    });
  });

  it("モデルの上書きが効く", () => {
    const env = { TOIITO_ANTHROPIC_MODEL: OVERRIDE.model };

    expect(readAnthropicSettings(env, false).model).toBe(OVERRIDE.model);
  });

  it("数として読めない TOIITO_ANTHROPIC_MAX_TOKENS は既定へ倒す", () => {
    expect(
      readAnthropicSettings({ TOIITO_ANTHROPIC_MAX_TOKENS: "" }, false)
        .maxTokens,
    ).toBe(ANTHROPIC_DEFAULTS.maxTokens);
    expect(
      readAnthropicSettings({ TOIITO_ANTHROPIC_MAX_TOKENS: "たくさん" }, false)
        .maxTokens,
    ).toBe(ANTHROPIC_DEFAULTS.maxTokens);
  });

  it("上限の上書きが効く", () => {
    const env = { TOIITO_ANTHROPIC_TIMEOUT_MS: String(OVERRIDE.timeoutMs) };

    expect(readAnthropicSettings(env, false).timeoutMs).toBe(
      OVERRIDE.timeoutMs,
    );
  });

  it("数として読めない TOIITO_ANTHROPIC_TIMEOUT_MS は既定へ倒す", () => {
    expect(
      readAnthropicSettings({ TOIITO_ANTHROPIC_TIMEOUT_MS: "" }, false)
        .timeoutMs,
    ).toBe(ANTHROPIC_DEFAULTS.timeoutMs);
    expect(
      readAnthropicSettings({ TOIITO_ANTHROPIC_TIMEOUT_MS: "すぐ" }, false)
        .timeoutMs,
    ).toBe(ANTHROPIC_DEFAULTS.timeoutMs);
  });

  it("TOIITO_ANTHROPIC_EFFORT の深さが載る", () => {
    const env = { TOIITO_ANTHROPIC_EFFORT: OVERRIDE.effort };

    expect(readAnthropicSettings(env, false).effort).toBe(OVERRIDE.effort);
  });

  it("値域の外の TOIITO_ANTHROPIC_EFFORT は既定値にする", () => {
    const env = { TOIITO_ANTHROPIC_EFFORT: "middle" };

    expect(readAnthropicSettings(env, false).effort).toBe(
      ANTHROPIC_DEFAULTS.effort,
    );
  });

  it("渡されたフェイクモードが載る", () => {
    expect(readAnthropicSettings({}, true).fake).toBe(true);
  });
});

describe("readAnthropicProvider", () => {
  it("env から読んだ設定が載る", () => {
    const env = {
      TOIITO_ANTHROPIC_MODEL: OVERRIDE.model,
      TOIITO_ANTHROPIC_EFFORT: OVERRIDE.effort,
    };
    const provider = readAnthropicProvider(env, false);

    expect(provider.name).toBe("anthropic");
    expect(provider.settings.model).toBe(OVERRIDE.model);
    expect(provider.settings.effort).toBe(OVERRIDE.effort);
  });

  it("本番でフェイクでなく ANTHROPIC_API_KEY が無ければ、プロバイダを作る時点で投げる", () => {
    expect(() =>
      readAnthropicProvider({ VERCEL_ENV: "production" }, false),
    ).toThrow(/ANTHROPIC_API_KEY/);
  });

  it("本番以外では ANTHROPIC_API_KEY が無くてもプロバイダを作れる", () => {
    const provider = readAnthropicProvider({ VERCEL_ENV: "preview" }, false);

    expect(provider.settings.apiKey).toBeUndefined();
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

    await send({ ...SETTINGS, effort: ANTHROPIC_EFFORT.medium });

    expect(sentBody(fetchMock).output_config).toEqual({
      effort: ANTHROPIC_EFFORT.medium,
    });
  });

  it("設定に深さが無いと output_config を送らない（API の既定に任せる）", async () => {
    const fetchMock = stubOkResponse();

    await send();

    expect(sentBody(fetchMock).output_config).toBeUndefined();
  });

  it("受け取った signal をそのまま fetch へ渡す", async () => {
    const fetchMock = stubOkResponse();
    const signal = AbortSignal.timeout(SETTINGS.timeoutMs);

    await new AnthropicProvider(SETTINGS).send("# 抽象派", "本文", signal);

    expect(fetchMock.mock.calls[0][1].signal).toBe(signal);
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
