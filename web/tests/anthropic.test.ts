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
  ANTHROPIC_MODELS,
  type AnthropicCredentials,
  AnthropicProvider,
  type AnthropicSettings,
  isAnthropicModel,
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

/**
 * 利用者が登録したキーと選んだモデル。
 * env のキーとモデルより優先されることを見るので、`OVERRIDE` とも既定値とも違うモデルにする。
 */
const CREDENTIALS: AnthropicCredentials = {
  apiKey: "user-key",
  model: ANTHROPIC_MODELS.haiku45,
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
    tools?: { type: string; name: string; max_uses?: number }[];
    system: string;
  };
}

/** モックした fetch が送ったリクエストヘッダを読む。 */
function sentHeaders(fetchMock: ReturnType<typeof stubApiResponse>) {
  return fetchMock.mock.calls[0][1].headers as Record<string, string>;
}

/** 検索を要求しない要求の中身。 */
const REQUEST = {
  system: "# 抽象派",
  userContent: "組み立て済みの本文",
};

/** 検索を 4 回まで許す要求の中身。 */
const SEARCHING_REQUEST = { ...REQUEST, webSearch: { maxSearches: 4 } };

/** 検索を要求して一回叩く。 */
function sendSearching(settings: AnthropicSettings = SETTINGS) {
  return new AnthropicProvider(settings).send(
    SEARCHING_REQUEST,
    AbortSignal.timeout(settings.timeoutMs),
  );
}

/** 組み立て済みの本文を渡して一回叩く。 */
function send(settings: AnthropicSettings = SETTINGS) {
  return new AnthropicProvider(settings).send(
    REQUEST,
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

describe("利用者が選べるモデル", () => {
  it("既定のモデルは isAnthropicModel を通る", () => {
    expect(isAnthropicModel(ANTHROPIC_DEFAULTS.model)).toBe(true);
  });

  it("値域の外のモデル名は isAnthropicModel を通らない", () => {
    expect(isAnthropicModel("claude-fable-5-1")).toBe(false);
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

  it("深さの指定を受け付けないモデルでは、TOIITO_ANTHROPIC_EFFORT があっても深さを持たせない", () => {
    const env = {
      TOIITO_ANTHROPIC_MODEL: ANTHROPIC_MODELS.haiku45,
      TOIITO_ANTHROPIC_EFFORT: OVERRIDE.effort,
    };

    expect(readAnthropicSettings(env, false).effort).toBeUndefined();
  });

  it("ANTHROPIC_MODELS の外のモデル名では、深さを持たせる", () => {
    const env = {
      TOIITO_ANTHROPIC_MODEL: "claude-opus-4-8",
      TOIITO_ANTHROPIC_EFFORT: OVERRIDE.effort,
    };

    expect(readAnthropicSettings(env, false).effort).toBe(OVERRIDE.effort);
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

  it("利用者のキーとモデルを渡すと、env のキーとモデルでなく利用者のキーとモデルでリクエストを送る", async () => {
    const fetchMock = stubOkResponse();
    const env = {
      ANTHROPIC_API_KEY: "operator-key",
      TOIITO_ANTHROPIC_MODEL: OVERRIDE.model,
    };
    const provider = readAnthropicProvider(env, false, CREDENTIALS);

    await provider.send(REQUEST, AbortSignal.timeout(SETTINGS.timeoutMs));

    expect(sentHeaders(fetchMock)["x-api-key"]).toBe(CREDENTIALS.apiKey);
    expect(sentBody(fetchMock).model).toBe(CREDENTIALS.model);
  });

  it("深さの指定を受け付けるモデルなら、利用者のキーとモデルを渡しても深さは既定値のまま", () => {
    const provider = readAnthropicProvider({}, false, {
      ...CREDENTIALS,
      model: ANTHROPIC_MODELS.opus5,
    });

    expect(provider.settings.effort).toBe(ANTHROPIC_DEFAULTS.effort);
  });

  it("利用者が深さの指定を受け付けないモデルを選ぶと、output_config を送らない", async () => {
    const fetchMock = stubOkResponse();
    const provider = readAnthropicProvider({}, false, {
      ...CREDENTIALS,
      model: ANTHROPIC_MODELS.haiku45,
    });

    await provider.send(REQUEST, AbortSignal.timeout(SETTINGS.timeoutMs));

    expect(sentBody(fetchMock).output_config).toBeUndefined();
  });

  it("本番で ANTHROPIC_API_KEY が無くても、利用者のキーを渡せばプロバイダを作れる", () => {
    const provider = readAnthropicProvider(
      { VERCEL_ENV: "production" },
      false,
      CREDENTIALS,
    );

    expect(provider.settings.apiKey).toBe(CREDENTIALS.apiKey);
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

    await new AnthropicProvider(SETTINGS).send(REQUEST, signal);

    expect(fetchMock.mock.calls[0][1].signal).toBe(signal);
  });

  it("役割定義は system へ載せる", async () => {
    const fetchMock = stubOkResponse();

    await send();

    expect(sentBody(fetchMock).system).toBe("# 抽象派");
  });

  it("検索の指定があると、web 検索のツールと指定の回数の上限を送る", async () => {
    const fetchMock = stubOkResponse();

    await sendSearching();

    expect(sentBody(fetchMock).tools).toEqual([
      { type: "web_search_20250305", name: "web_search", max_uses: 4 },
    ]);
  });

  it("検索の指定が無いと tools を送らない", async () => {
    const fetchMock = stubOkResponse();

    await send();

    expect(sentBody(fetchMock).tools).toBeUndefined();
  });
});

describe("web 検索の応答の読み取り", () => {
  /** 検索結果を二件返す応答を一件返す fetch に差し替える。 */
  function stubSearchedResponse(webSearchRequests: number) {
    return stubApiResponse({
      content: [
        { type: "server_tool_use", name: "web_search" },
        {
          type: "web_search_tool_result",
          content: [
            {
              type: "web_search_result",
              url: "https://example.com/for",
              title: "支持する立場",
            },
            {
              type: "web_search_result",
              url: "https://example.com/against",
              title: "反対する立場",
            },
          ],
        },
        { type: "text", text: "材料の JSON" },
      ],
      stop_reason: "end_turn",
      usage: {
        input_tokens: 6039,
        output_tokens: 931,
        server_tool_use: { web_search_requests: webSearchRequests },
      },
    });
  }

  it("検索結果の URL と検索の回数を戻り値に入れる", async () => {
    stubSearchedResponse(2);

    await expect(sendSearching()).resolves.toMatchObject({
      body: "材料の JSON",
      searchResultUrls: [
        "https://example.com/for",
        "https://example.com/against",
      ],
      webSearchCount: 2,
    });
  });

  it("検索を要求しない応答は、URL の一覧が空で検索の回数が 0", async () => {
    stubApiResponse({
      content: [{ type: "text", text: "応答" }],
      stop_reason: "end_turn",
      usage: { input_tokens: 1200, output_tokens: 340 },
    });

    await expect(send()).resolves.toMatchObject({
      searchResultUrls: [],
      webSearchCount: 0,
    });
  });

  it("検索が失敗したブロックがあれば、error_code を添えて throw する", async () => {
    stubApiResponse({
      content: [
        {
          type: "web_search_tool_result",
          content: {
            type: "web_search_tool_result_error",
            error_code: "max_uses_exceeded",
          },
        },
      ],
      stop_reason: "end_turn",
    });

    await expect(sendSearching()).rejects.toThrow(/max_uses_exceeded/);
  });

  it("pause_turn で中断した応答は、続きを送らずに throw する", async () => {
    stubApiResponse({
      content: [{ type: "text", text: "途中まで" }],
      stop_reason: "pause_turn",
    });

    await expect(sendSearching()).rejects.toThrow(/pause_turn/);
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
