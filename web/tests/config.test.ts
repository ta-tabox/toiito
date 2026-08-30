/**
 * env から設定を作る写像の検査。
 * process.env は触らず、env を模した object を渡す（HARNESS.md「テスト可能性の設計制約」2）。
 */

import { describe, expect, it } from "vitest";
import { readAiSettings, readPersonaEffort } from "@/lib/config";

describe("readAiSettings", () => {
  it("未設定なら既定へ倒す", () => {
    expect(readAiSettings({})).toEqual({
      model: "claude-sonnet-5",
      maxTokens: 16000,
      fake: false,
      apiKey: undefined,
    });
  });

  it("TOIITO_MAX_TOKENS の上書きが効く", () => {
    expect(readAiSettings({ TOIITO_MAX_TOKENS: "2048" }).maxTokens).toBe(2048);
  });

  it("数として読めない TOIITO_MAX_TOKENS は既定へ倒す", () => {
    expect(readAiSettings({ TOIITO_MAX_TOKENS: "" }).maxTokens).toBe(16000);
    expect(readAiSettings({ TOIITO_MAX_TOKENS: "たくさん" }).maxTokens).toBe(
      16000,
    );
  });

  it("TOIITO_MODEL の上書きが効く", () => {
    expect(readAiSettings({ TOIITO_MODEL: "claude-opus-5" }).model).toBe(
      "claude-opus-5",
    );
  });

  it("フェイクモードが立つのは 1 のときだけ", () => {
    expect(readAiSettings({ TOIITO_FAKE_AI: "1" }).fake).toBe(true);
    expect(readAiSettings({ TOIITO_FAKE_AI: "0" }).fake).toBe(false);
    expect(readAiSettings({ TOIITO_FAKE_AI: "true" }).fake).toBe(false);
  });
});

describe("readPersonaEffort", () => {
  it("未設定なら具体系は API の既定・抽象系は medium", () => {
    expect(readPersonaEffort({})).toEqual({
      concrete: undefined,
      abstract: "medium",
    });
  });

  it("TOIITO_EFFORT_ABSTRACT の上書きが効く", () => {
    expect(
      readPersonaEffort({ TOIITO_EFFORT_ABSTRACT: "xhigh" }).abstract,
    ).toBe("xhigh");
  });

  it("値域の外は既定へ倒す", () => {
    expect(
      readPersonaEffort({
        TOIITO_EFFORT_CONCRETE: "middle",
        TOIITO_EFFORT_ABSTRACT: "middle",
      }),
    ).toEqual({ concrete: undefined, abstract: "medium" });
  });
});
