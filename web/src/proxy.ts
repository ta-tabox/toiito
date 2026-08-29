/**
 * 本番の入口に Basic 認証を掛ける配線（Next の proxy 規約）。
 *
 * 判定は `@/lib/basic-auth` が持ち、ここは 401 と `WWW-Authenticate` へ変換するだけにする。
 * #68（ログイン（Google OAuth）とリソースの所有権）が入ったら、このファイルごと外す。
 *
 * matcher を書かず全リクエストを通す。
 * 除外の綴りを誤ると、その経路だけアクセス制限の外に出たことが誰にも見えない（`docs/adr/0013-production-basic-auth.md`）。
 *
 * 資格情報の読み取りはモジュールの評価時に一度だけ走る。
 * 本番で設定が欠けていれば、リクエストを捌く前に落ちる。
 *
 * proxy は常に Node.js ランタイムで走るので、`process.env` は本物である。
 * 旧 middleware 規約の既定だった Edge では、ここが読む三つが実行時に undefined になり、資格情報が無いと判断して素通ししていた（2026-08-29 に生成物で確認）。
 */

import { type NextRequest, NextResponse } from "next/server";
import { isAuthorized, readBasicAuthCredentials } from "@/lib/basic-auth";

// 読む三つを名指しで渡す。
// 何に依存しているかがここだけで読め、テストが同じ形で差し替えられる。
const credentials = readBasicAuthCredentials({
  TOIITO_BASIC_AUTH_USER: process.env.TOIITO_BASIC_AUTH_USER,
  TOIITO_BASIC_AUTH_PASSWORD: process.env.TOIITO_BASIC_AUTH_PASSWORD,
  NODE_ENV: process.env.NODE_ENV,
});

/** すべてのリクエストに Basic 認証を掛ける。 */
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
