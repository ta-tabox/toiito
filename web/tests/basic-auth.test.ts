import { describe, expect, it } from "vitest";
import {
  type BasicAuthCredentials,
  isAuthorized,
  readBasicAuthCredentials,
} from "@/lib/basic-auth";

const credentials: BasicAuthCredentials = {
  user: "toiito",
  password: "秘密:のことば",
};

/** 与えた組を Basic の Authorization ヘッダへ組み立てる。 */
function basic(user: string, password: string): string {
  const bytes = new TextEncoder().encode(`${user}:${password}`);
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join(
    "",
  );

  return `Basic ${btoa(binary)}`;
}

describe("readBasicAuthCredentials", () => {
  it("両方揃っていれば資格情報を返す", () => {
    expect(
      readBasicAuthCredentials({
        TOIITO_BASIC_AUTH_USER: "u",
        TOIITO_BASIC_AUTH_PASSWORD: "p",
        NODE_ENV: "production",
      }),
    ).toEqual({ user: "u", password: "p" });
  });

  it("どちらも無ければ認証を掛けない", () => {
    expect(readBasicAuthCredentials({ NODE_ENV: "development" })).toBeNull();
  });

  it("production でどちらも無ければ投げる", () => {
    expect(() =>
      readBasicAuthCredentials({ NODE_ENV: "production" }),
    ).toThrow();
  });

  it("片方だけなら production でなくても投げる", () => {
    expect(() =>
      readBasicAuthCredentials({
        TOIITO_BASIC_AUTH_USER: "u",
        NODE_ENV: "development",
      }),
    ).toThrow();
    expect(() =>
      readBasicAuthCredentials({
        TOIITO_BASIC_AUTH_PASSWORD: "p",
        NODE_ENV: "development",
      }),
    ).toThrow();
  });
});

describe("isAuthorized", () => {
  it("一致すれば通す", () => {
    expect(isAuthorized(basic("toiito", "秘密:のことば"), credentials)).toBe(
      true,
    );
  });

  it("パスワードに : が含まれていても、最初の : だけを区切りにする", () => {
    expect(
      isAuthorized(basic("toiito", "a:b:c"), {
        user: "toiito",
        password: "a:b:c",
      }),
    ).toBe(true);
  });

  it("パスワードが違えば通さない", () => {
    expect(isAuthorized(basic("toiito", "ちがう"), credentials)).toBe(false);
  });

  it("利用者名が違えば通さない", () => {
    expect(isAuthorized(basic("someone", "秘密:のことば"), credentials)).toBe(
      false,
    );
  });

  it("ヘッダが無ければ通さない", () => {
    expect(isAuthorized(null, credentials)).toBe(false);
  });

  it("Basic 以外の綴りは通さない", () => {
    expect(isAuthorized("Bearer token", credentials)).toBe(false);
  });

  it("base64 が壊れていても投げずに通さない", () => {
    expect(isAuthorized("Basic ***", credentials)).toBe(false);
  });

  it("区切りの : が無ければ通さない", () => {
    expect(isAuthorized(`Basic ${btoa("toiito")}`, credentials)).toBe(false);
  });

  it("パスワードの前方一致では通さない", () => {
    expect(isAuthorized(basic("toiito", "秘密"), credentials)).toBe(false);
  });
});
