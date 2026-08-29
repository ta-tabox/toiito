import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * 環境変数を差し替えたうえで middleware を読み直す。
 *
 * 資格情報はモジュールの評価時に一度だけ読まれるので、import を捨てないと前の設定を掴んだままになる。
 */
async function loadMiddleware(env: Record<string, string>) {
  vi.resetModules();

  for (const [key, value] of Object.entries(env)) {
    vi.stubEnv(key, value);
  }

  return (await import("@/middleware")).middleware;
}

/** 与えたヘッダで本番の入口を叩くリクエストを作る。 */
function request(authorization?: string): NextRequest {
  const headers = authorization ? { authorization } : undefined;

  return new NextRequest("https://toiito.example/", { headers });
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("middleware", () => {
  it("資格情報が無ければ素通しする", async () => {
    const middleware = await loadMiddleware({ NODE_ENV: "development" });

    expect(middleware(request()).status).toBe(200);
  });

  it("認証が掛かっていれば、ヘッダの無いリクエストを 401 で返す", async () => {
    const middleware = await loadMiddleware({
      NODE_ENV: "production",
      TOIITO_BASIC_AUTH_USER: "toiito",
      TOIITO_BASIC_AUTH_PASSWORD: "ことば",
    });

    expect(middleware(request()).status).toBe(401);
  });

  it("401 は WWW-Authenticate を添える", async () => {
    const middleware = await loadMiddleware({
      NODE_ENV: "production",
      TOIITO_BASIC_AUTH_USER: "toiito",
      TOIITO_BASIC_AUTH_PASSWORD: "ことば",
    });

    expect(middleware(request()).headers.get("WWW-Authenticate")).toBe(
      'Basic realm="toiito", charset="UTF-8"',
    );
  });

  it("一致する資格情報なら通す", async () => {
    const middleware = await loadMiddleware({
      NODE_ENV: "production",
      TOIITO_BASIC_AUTH_USER: "toiito",
      TOIITO_BASIC_AUTH_PASSWORD: "ことば",
    });
    const bytes = new TextEncoder().encode("toiito:ことば");
    const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join(
      "",
    );

    expect(middleware(request(`Basic ${btoa(binary)}`)).status).toBe(200);
  });

  it("本番で資格情報が無ければ、読み込みの時点で落ちる", async () => {
    await expect(loadMiddleware({ NODE_ENV: "production" })).rejects.toThrow();
  });
});
