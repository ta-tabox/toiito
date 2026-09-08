import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { proxy } from "@/proxy";

/** Better Auth が http のときに使う cookie の名前。 */
const SESSION_COOKIE = "better-auth.session_token=token-value";

/** https のときに `__Secure-` が付く方の名前。 */
const SECURE_SESSION_COOKIE = "__Secure-better-auth.session_token=token-value";

/** 与えた経路と cookie でアプリを叩くリクエストを作る。 */
function request(pathname: string, cookie?: string): NextRequest {
  const headers = cookie ? { cookie } : undefined;

  return new NextRequest(`https://toiito.example${pathname}`, { headers });
}

describe("proxy", () => {
  it("cookie を持たないリクエストをログインの画面へ送る", () => {
    const response = proxy(request("/"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://toiito.example/login",
    );
  });

  it("cookie を持つリクエストは通す", () => {
    expect(proxy(request("/", SESSION_COOKIE)).status).toBe(200);
  });

  it("`__Secure-` が付いた cookie も通す", () => {
    expect(proxy(request("/", SECURE_SESSION_COOKIE)).status).toBe(200);
  });

  it("サインインを要求しない経路は、cookie が無くても通す", () => {
    expect(proxy(request("/login")).status).toBe(200);
    expect(proxy(request("/api/auth/sign-in/fake")).status).toBe(200);
  });

  it("cookie の中身は見ない（在るだけで通す）", () => {
    // 期限切れのセッションを拒否するのは `getCurrentUser` で、`proxy` は導線しか持たない。
    expect(
      proxy(request("/", "better-auth.session_token=expired")).status,
    ).toBe(200);
  });
});
