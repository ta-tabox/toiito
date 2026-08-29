/**
 * 本番の入口に Basic 認証を掛ける配線。
 *
 * 判定は `@/lib/basic-auth` が持ち、ここは 401 と `WWW-Authenticate` へ変換するだけにする。
 * #68（ログイン（Google OAuth）とリソースの所有権）が入ったら、このファイルごと外す。
 *
 * matcher を書かず全リクエストを通す。
 * 除外の綴りを誤ると、その経路だけアクセス制限の外に出たことが誰にも見えない（`docs/adr/0013-production-basic-auth.md`）。
 *
 * 資格情報の読み取りはモジュールの評価時に一度だけ走る。
 * 本番で設定が欠けていれば、リクエストを捌く前に落ちる。
 */

import { type NextRequest, NextResponse } from "next/server";
import { isAuthorized, readBasicAuthCredentials } from "@/lib/basic-auth";

const credentials = readBasicAuthCredentials(process.env);

/** すべてのリクエストに Basic 認証を掛ける。 */
export function middleware(request: NextRequest): NextResponse {
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
