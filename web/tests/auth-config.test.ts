import { describe, expect, it } from "vitest";
import { isAllowedEmail, readAuthConfig } from "@/lib/auth/config";

/** サインインの手段だけを差し替えられるよう、必須の 2 本を既定で埋めた環境変数。 */
function env(overrides: Record<string, string | undefined> = {}) {
  return {
    BETTER_AUTH_SECRET: "テスト用の秘密",
    TOIITO_ALLOWED_EMAILS: "first@example.com",
    TOIITO_FAKE_LOGIN: "1",
    ...overrides,
  };
}

/** Google OAuth を設定した env に足す 3 本。 */
const GOOGLE = {
  GOOGLE_CLIENT_ID: "client-id",
  GOOGLE_CLIENT_SECRET: "client-secret",
  BETTER_AUTH_URL: "https://toiito.example",
};

describe("readAuthConfig", () => {
  it("BETTER_AUTH_SECRET が未設定なら投げる", () => {
    expect(() =>
      readAuthConfig(env({ BETTER_AUTH_SECRET: undefined })),
    ).toThrow(/BETTER_AUTH_SECRET/);
  });

  it("TOIITO_ALLOWED_EMAILS が空なら投げる", () => {
    expect(() => readAuthConfig(env({ TOIITO_ALLOWED_EMAILS: " , " }))).toThrow(
      /TOIITO_ALLOWED_EMAILS/,
    );
  });

  it("許可リストは小文字へ揃えて空白を取り除く", () => {
    const config = readAuthConfig(
      env({
        TOIITO_ALLOWED_EMAILS: " First@Example.com , second@example.com ",
      }),
    );

    expect(config.allowedEmails).toEqual([
      "first@example.com",
      "second@example.com",
    ]);
  });

  it("サインインの手段が一つも無ければ投げる", () => {
    expect(() => readAuthConfig(env({ TOIITO_FAKE_LOGIN: undefined }))).toThrow(
      /サインインの手段/,
    );
  });

  it("Google の資格情報が片方だけなら投げる", () => {
    expect(() =>
      readAuthConfig(env({ GOOGLE_CLIENT_ID: "client-id" })),
    ).toThrow(/GOOGLE_CLIENT_ID/);
  });

  it("Google を設定して BETTER_AUTH_URL が無ければ投げる", () => {
    expect(() =>
      readAuthConfig(env({ ...GOOGLE, BETTER_AUTH_URL: undefined })),
    ).toThrow(/BETTER_AUTH_URL/);
  });

  it("Google が揃っていれば、クライアントと基点を返す", () => {
    const config = readAuthConfig(
      env({ ...GOOGLE, TOIITO_FAKE_LOGIN: undefined }),
    );

    expect(config.google).toEqual({
      clientId: "client-id",
      clientSecret: "client-secret",
    });
    expect(config.baseUrl).toBe("https://toiito.example");
    expect(config.isFakeLoginEnabled).toBe(false);
  });

  it("TOIITO_FAKE_LOGIN=1 だけなら Google を持たない", () => {
    const config = readAuthConfig(env());

    expect(config.google).toBeUndefined();
    expect(config.isFakeLoginEnabled).toBe(true);
  });

  it("Google を設定しなければ BETTER_AUTH_URL は無くてよい", () => {
    expect(readAuthConfig(env()).baseUrl).toBeUndefined();
  });

  it("本番で TOIITO_FAKE_LOGIN=1 なら投げる", () => {
    expect(() =>
      readAuthConfig(env({ ...GOOGLE, VERCEL_ENV: "production" })),
    ).toThrow(/TOIITO_FAKE_LOGIN/);
  });
});

describe("isAllowedEmail", () => {
  const allowed = ["first@example.com"];

  it("載っている email を通す", () => {
    expect(isAllowedEmail(allowed, "first@example.com")).toBe(true);
  });

  it("大文字と前後の空白を吸収する", () => {
    expect(isAllowedEmail(allowed, " First@Example.com ")).toBe(true);
  });

  it("載っていない email を拒否する", () => {
    expect(isAllowedEmail(allowed, "second@example.com")).toBe(false);
  });
});
