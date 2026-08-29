import { afterEach, describe, expect, it, vi } from "vitest";
import { callPersona } from "@/lib/claude";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/**
 * Claude API の応答一件を返す fetch に差し替える。
 * 実モードの分岐へ入れるため、フェイクモードを解いて API キーも置く。
 */
function stubApiResponse(payload: unknown): void {
  delete process.env.TOIITO_FAKE_AI;
  process.env.ANTHROPIC_API_KEY = "test-key";

  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(payload), { status: 200 })),
  );
}

describe("フェイクモード (TOIITO_FAKE_AI=1)", () => {
  it("ネットワークに出ず、ペルソナ ID と直近の人間発話を含む決定的応答を返す", async () => {
    process.env.TOIITO_FAKE_AI = "1";
    const res = await callPersona("# ai_a — 具体派", { body: "問い本文" }, [
      { speaker: "human", body: "最初の発話" },
    ]);

    expect(res).toContain("ai_a");
    expect(res).toContain("最初の発話");
  });

  it("同じ入力には同じ応答（決定性）", async () => {
    process.env.TOIITO_FAKE_AI = "1";
    const t = [{ speaker: "human" as const, body: "同じ入力" }];
    expect(await callPersona("# ai_b — 抽象派", { body: "q" }, t)).toBe(
      await callPersona("# ai_b — 抽象派", { body: "q" }, t),
    );
  });
});

describe("実モード", () => {
  it("API キー未設定なら呼び出し前に明示的に失敗する", async () => {
    delete process.env.TOIITO_FAKE_AI;
    delete process.env.ANTHROPIC_API_KEY;
    await expect(callPersona("# ai_a", { body: "q" }, [])).rejects.toThrow(
      /ANTHROPIC_API_KEY/,
    );
  });

  it("完結した応答の本文を返す", async () => {
    stubApiResponse({
      content: [{ type: "text", text: "最後まで出た発話" }],
      stop_reason: "end_turn",
    });

    await expect(callPersona("# ai_b", { body: "q" }, [])).resolves.toBe(
      "最後まで出た発話",
    );
  });

  it("max_tokens で打ち切られた応答は、途中までの本文を返さず失敗する", async () => {
    stubApiResponse({
      content: [{ type: "text", text: "途中で切れた発" }],
      stop_reason: "max_tokens",
    });

    await expect(callPersona("# ai_b", { body: "q" }, [])).rejects.toThrow(
      /max_tokens/,
    );
  });

  it("text ブロックの無い応答は、空文字列を返さず失敗する", async () => {
    stubApiResponse({
      content: [{ type: "thinking", thinking: "" }],
      stop_reason: "end_turn",
    });

    await expect(callPersona("# ai_b", { body: "q" }, [])).rejects.toThrow(
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

    await callPersona("# ai_b — 抽象派", { body: "q" }, []);

    expect(logged).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(logged.mock.calls[0][0]))).toMatchObject({
      event: "claude_call",
      persona: "ai_b — 抽象派",
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

    await callPersona("# ai_a — 具体派", { body: "q" }, []);

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

    await expect(callPersona("# ai_b", { body: "q" }, [])).rejects.toThrow();

    expect(logged).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(logged.mock.calls[0][0]))).toMatchObject({
      stop_reason: "max_tokens",
    });
  });
});
