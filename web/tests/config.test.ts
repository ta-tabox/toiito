/**
 * 本番で開発用の環境変数を拒否する検証の検査。
 * env は `process.env` を触らず、env を模した object を渡す。
 */

import { describe, expect, it } from "vitest";
import { assertNoDevelopmentEnv, DEVELOPMENT_ONLY_ENV } from "@/lib/config";

describe("assertNoDevelopmentEnv", () => {
  it.each(DEVELOPMENT_ONLY_ENV)(
    "本番で %s が設定されていれば、その変数名を名指して投げる",
    (name) => {
      expect(() =>
        assertNoDevelopmentEnv({ VERCEL_ENV: "production", [name]: "1" }),
      ).toThrow(name);
    },
  );

  it("本番では値が 1 でなくても、設定されていれば投げる", () => {
    expect(() =>
      assertNoDevelopmentEnv({ VERCEL_ENV: "production", TOIITO_FAKE_AI: "0" }),
    ).toThrow(/TOIITO_FAKE_AI/);
  });

  it("本番で開発用の変数が無ければ通る", () => {
    expect(() =>
      assertNoDevelopmentEnv({
        VERCEL_ENV: "production",
        ANTHROPIC_API_KEY: "key",
      }),
    ).not.toThrow();
  });

  it("Preview では開発用の変数が設定されていても通る", () => {
    expect(() =>
      assertNoDevelopmentEnv({
        VERCEL_ENV: "preview",
        TOIITO_FAKE_AI: "1",
        TOIITO_FAKE_LOGIN: "1",
      }),
    ).not.toThrow();
  });
});
