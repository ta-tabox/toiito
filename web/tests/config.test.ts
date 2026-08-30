/**
 * env から設定を作る写像の検査。
 * process.env は触らず、env を模した object を渡す（HARNESS.md「テスト可能性の設計制約」2）。
 */

import { describe, expect, it } from "vitest";
import { AI_DEFAULTS, readAiSettings, readPersonaEffort } from "@/lib/config";
import { EFFORT } from "@/lib/effort";

/**
 * 上書きが載ることを見るための値。
 * 値そのものに意味は無い。
 */
const OVERRIDE = {
  model: "claude-opus-5",
  maxTokens: 2048,
  effort: EFFORT.xhigh,
};

describe("既定値", () => {
  it("web/README.md の表と一致する", () => {
    expect(AI_DEFAULTS.model).toBe("claude-sonnet-5");
    expect(AI_DEFAULTS.maxTokens).toBe(16000);
    expect(AI_DEFAULTS.effort.concrete).toBeUndefined();
    expect(AI_DEFAULTS.effort.abstract).toBe("medium");
  });
});

describe("readAiSettings", () => {
  it("未設定なら既定へ倒す", () => {
    expect(readAiSettings({})).toEqual({
      model: AI_DEFAULTS.model,
      maxTokens: AI_DEFAULTS.maxTokens,
      fake: false,
      apiKey: undefined,
    });
  });

  it("TOIITO_MAX_TOKENS の上書きが効く", () => {
    const env = { TOIITO_MAX_TOKENS: String(OVERRIDE.maxTokens) };

    expect(readAiSettings(env).maxTokens).toBe(OVERRIDE.maxTokens);
  });

  it("数として読めない TOIITO_MAX_TOKENS は既定へ倒す", () => {
    expect(readAiSettings({ TOIITO_MAX_TOKENS: "" }).maxTokens).toBe(
      AI_DEFAULTS.maxTokens,
    );
    expect(readAiSettings({ TOIITO_MAX_TOKENS: "たくさん" }).maxTokens).toBe(
      AI_DEFAULTS.maxTokens,
    );
  });

  it("TOIITO_MODEL の上書きが効く", () => {
    expect(readAiSettings({ TOIITO_MODEL: OVERRIDE.model }).model).toBe(
      OVERRIDE.model,
    );
  });

  it("フェイクモードが立つのは 1 のときだけ", () => {
    expect(readAiSettings({ TOIITO_FAKE_AI: "1" }).fake).toBe(true);
    expect(readAiSettings({ TOIITO_FAKE_AI: "0" }).fake).toBe(false);
    expect(readAiSettings({ TOIITO_FAKE_AI: "true" }).fake).toBe(false);
  });
});

describe("readPersonaEffort", () => {
  it("未設定なら既定へ倒す", () => {
    expect(readPersonaEffort({})).toEqual(AI_DEFAULTS.effort);
  });

  it("TOIITO_EFFORT_ABSTRACT の上書きが効く", () => {
    const env = { TOIITO_EFFORT_ABSTRACT: OVERRIDE.effort };

    expect(readPersonaEffort(env).abstract).toBe(OVERRIDE.effort);
  });

  it("値域の外は既定へ倒す", () => {
    const env = {
      TOIITO_EFFORT_CONCRETE: "middle",
      TOIITO_EFFORT_ABSTRACT: "middle",
    };

    expect(readPersonaEffort(env)).toEqual(AI_DEFAULTS.effort);
  });
});
