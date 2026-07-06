import { afterEach, describe, expect, it } from "vitest";
import { callPersona } from "@/lib/claude";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("フェイクモード (TOIITO_FAKE_AI=1)", () => {
  it("ネットワークに出ず、ペルソナ ID と直近の人間発話を含む決定的応答を返す", async () => {
    process.env.TOIITO_FAKE_AI = "1";
    const res = await callPersona("# ai_a — 具体派", "問い本文", [
      { speaker: "human", body: "最初の発話" },
    ]);
    expect(res).toContain("ai_a");
    expect(res).toContain("最初の発話");
  });

  it("同じ入力には同じ応答（決定性）", async () => {
    process.env.TOIITO_FAKE_AI = "1";
    const t = [{ speaker: "human" as const, body: "同じ入力" }];
    expect(await callPersona("# ai_b — 抽象派", "q", t)).toBe(
      await callPersona("# ai_b — 抽象派", "q", t)
    );
  });
});

describe("実モード", () => {
  it("API キー未設定なら呼び出し前に明示的に失敗する", async () => {
    delete process.env.TOIITO_FAKE_AI;
    delete process.env.ANTHROPIC_API_KEY;
    await expect(callPersona("# ai_a", "q", [])).rejects.toThrow(
      /ANTHROPIC_API_KEY/
    );
  });
});
