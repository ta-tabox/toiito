import { describe, expect, it } from "vitest";
import { LOGIN_PATH, requiresSignIn } from "@/lib/protected-paths";

describe("requiresSignIn", () => {
  it("画面の 3 枚はサインインを要求する", () => {
    expect(requiresSignIn("/")).toBe(true);
    expect(requiresSignIn("/q/47c1b0b8-0000-4000-8000-000000000000")).toBe(
      true,
    );
    expect(requiresSignIn("/memos")).toBe(true);
  });

  it("ログインの画面は要求しない", () => {
    expect(requiresSignIn(LOGIN_PATH)).toBe(false);
  });

  it("サインインのエンドポイントは要求しない", () => {
    expect(requiresSignIn("/api/auth/sign-in/fake")).toBe(false);
  });

  it("ページを描くのに要る資産は要求しない", () => {
    expect(requiresSignIn("/_next/static/chunks/main.js")).toBe(false);
    expect(requiresSignIn("/favicon.ico")).toBe(false);
  });

  it("接頭辞が一致しても、経路の区切りが違えば要求する", () => {
    expect(requiresSignIn("/loginner")).toBe(true);
    expect(requiresSignIn("/api/authorize")).toBe(true);
  });

  it("一覧に無い経路は要求する", () => {
    expect(requiresSignIn("/no-such-page")).toBe(true);
  });
});
