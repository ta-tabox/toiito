/**
 * 未サインインのリクエストをログインの画面へ送る配線（Next の proxy 規約）。
 *
 * 見るのはセッションの cookie が在るかどうかだけで、DB へは問い合わせない（`docs/adr/0029-auth-better-auth.md` 決定 5）。
 * cookie が在っても中身が有効とは限らないので、`proxy` を通ったことは認可の根拠にならない。
 * 他人のリソースを拒否するのは `db.ts` の repo 関数で、期限切れのセッションを拒否するのは `getCurrentUser` である。
 *
 * matcher を書かず全リクエストを通す。
 * 除外の書き方を誤ると、その経路だけ判定の外に出たことが誰にも見えない。
 * どの経路が未サインインでも開くかは `@/lib/protected-paths` が持つ。
 */

import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";
import { LOGIN_PATH, requiresSignIn } from "@/lib/protected-paths";

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
