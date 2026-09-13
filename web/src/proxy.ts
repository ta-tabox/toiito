/**
 * 未サインインのリクエストをログインの画面へ送る配線（Next の proxy 規約）。
 *
 * 見るのはセッションの cookie が在るかどうかだけで、DB へは問い合わせない（`docs/adr/0036-auth-better-auth.md` 決定 5）。
 * cookie が在っても中身が有効とは限らないので、`proxy` を通ったことは認可の根拠にならない。
 * 他人のリソースを拒否するのは `db.ts` の repo 関数で、期限切れのセッションを拒否するのは `getCurrentUser` である。
 *
 * Next の `config.matcher` で経路を除外しない。
 * matcher で除外した経路では `proxy` そのものが呼ばれないので、除外を書き誤るとその経路は未サインインのまま開き、`proxy()` を直接呼ぶ `tests/proxy.test.ts` でも検出できない。
 * 未サインインで開く経路は `@/lib/auth/protected-paths` の一覧だけで決める。
 */

import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";
import { LOGIN_PATH, requiresSignIn } from "@/lib/auth/protected-paths";

/** 未サインインのリクエストをログインの画面へ送る。 */
export function proxy(request: NextRequest): NextResponse {
  if (!requiresSignIn(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  if (getSessionCookie(request)) {
    return NextResponse.next();
  }

  return NextResponse.redirect(new URL(LOGIN_PATH, request.url));
}
