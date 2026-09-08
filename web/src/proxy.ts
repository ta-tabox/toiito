/**
 * 本番のすべてのリクエストへ Basic 認証を適用する配線（Next の proxy 規約。決定と理由は `docs/adr/0013-production-basic-auth.md`）。
 *
 * 判定は `@/lib/basic-auth` が持ち、`proxy` は 401 と `WWW-Authenticate` へ変換するだけにする。
 * #68（ログイン（Google OAuth）とリソースの所有権）が入ったら、このファイルごと外す。
 *
 * matcher を書かず全リクエストを通す。
 * 除外の書き方を誤ると、その経路だけアクセス制限の外に出たことが誰にも見えない。
 * 資格情報の読み取りはモジュールの評価時に一度だけ走るので、本番で設定が欠けていればリクエストを捌く前に落ちる。
 * 旧 middleware 規約へ戻さない（Edge で走ると `proxy.ts` が読む三つが実行時に undefined になり、資格情報が無いと判断して検証なしで通す）。
 */

import { type NextRequest, NextResponse } from "next/server";
import { isAuthorized, readBasicAuthCredentials } from "@/lib/basic-auth";

// 読む三つを名指しで渡す。
// 依存する環境変数がこの引数の並びで全部読め、テストが同じ形で差し替えられる。
const credentials = readBasicAuthCredentials({
  TOIITO_BASIC_AUTH_USER: process.env.TOIITO_BASIC_AUTH_USER,
  TOIITO_BASIC_AUTH_PASSWORD: process.env.TOIITO_BASIC_AUTH_PASSWORD,
  NODE_ENV: process.env.NODE_ENV,
});

/** すべてのリクエストへ Basic 認証を適用する。 */
export function proxy(request: NextRequest): NextResponse {
  if (credentials === null) {
    return NextResponse.next();
  }

  if (isAuthorized(request.headers.get("authorization"), credentials)) {
    return NextResponse.next();
  }

  return new NextResponse("Unauthorized", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="toiito", charset="UTF-8"',
    },
  });
}
