import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * 環境変数を差し替えたうえで proxy を読み直す。
 *
 * 資格情報はモジュールの評価時に一度だけ読まれるので、import を捨てないと前の設定を掴んだままになる。
 */
async function loadProxy(env: Record<string, string>) {
  vi.resetModules();

  for (const [key, value] of Object.entries(env)) {
    vi.stubEnv(key, value);
  }

  return (await import("@/proxy")).proxy;
}

/** 与えたヘッダで本番の入口を叩くリクエストを作る。 */
function request(authorization?: string): NextRequest {
  const headers = authorization ? { authorization } : undefined;

  return new NextRequest("https://toiito.example/", { headers });
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("proxy", () => {
  it("資格情報が無ければ素通しする", async () => {
    const proxy = await loadProxy({ NODE_ENV: "development" });

    expect(proxy(request()).status).toBe(200);
  });

  it("認証が掛かっていれば、ヘッダの無いリクエストを 401 で返す", async () => {
    const proxy = await loadProxy({
      NODE_ENV: "production",
      TOIITO_BASIC_AUTH_USER: "toiito",
      TOIITO_BASIC_AUTH_PASSWORD: "ことば",
    });

    expect(proxy(request()).status).toBe(401);
  });

  it("401 は WWW-Authenticate を添える", async () => {
    const proxy = await loadProxy({
      NODE_ENV: "production",
      TOIITO_BASIC_AUTH_USER: "toiito",
      TOIITO_BASIC_AUTH_PASSWORD: "ことば",
    });

    expect(proxy(request()).headers.get("WWW-Authenticate")).toBe(
      'Basic realm="toiito", charset="UTF-8"',
    );
  });

  it("一致する資格情報なら通す", async () => {
    const proxy = await loadProxy({
      NODE_ENV: "production",
      TOIITO_BASIC_AUTH_USER: "toiito",
      TOIITO_BASIC_AUTH_PASSWORD: "ことば",
    });
    const bytes = new TextEncoder().encode("toiito:ことば");
    const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join(
      "",
    );

    expect(proxy(request(`Basic ${btoa(binary)}`)).status).toBe(200);
  });

  it("本番で資格情報が無ければ、読み込みの時点で落ちる", async () => {
    await expect(loadProxy({ NODE_ENV: "production" })).rejects.toThrow();
  });
});
