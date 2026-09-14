/**
 * サインインとサインアウトを Better Auth へ依頼する。
 *
 * 現在のユーザーは読まない。
 * 読むのは `current-user.ts` だけで、RSC と Server Action が現在のユーザーを取得する経路を 1 本に保つ。
 *
 * 誰がサインインできるかは決めない。
 * 許可リストの照合は `auth/index.ts` の `databaseHooks.session.create.before` が行う。
 *
 * ログインの画面に並べるサインインの手段（`readSignInMethods`）は `auth/index.ts` が環境変数から解決し、このファイルが再 export する。
 * `biome.json` が `@/lib/auth` の import をこのファイルと `current-user.ts` とルートハンドラへ限定するので、ログインの画面はこのファイルから import する。
 */

import { headers } from "next/headers";
import { auth } from "@/lib/auth";

export { readSignInMethods } from "@/lib/auth";

/** サインインした後に戻る画面。 */
const AFTER_SIGN_IN_PATH = "/";

/**
 * Google の同意画面の URL を返す。
 *
 * リクエストを送るのは呼び出し側（Server Action）で、`startGoogleSignIn` は URL を組み立てるところまでを持つ。
 * Google を設定していない環境では URL が返らないので throw する。
 */
export async function startGoogleSignIn(): Promise<string> {
  const requestHeaders = await headers();
  const { url } = await auth().api.signInSocial({
    body: { provider: "google", callbackURL: AFTER_SIGN_IN_PATH },
    headers: requestHeaders,
  });

  if (!url) {
    throw new Error(
      "Google の同意画面の URL が返らなかった。GOOGLE_CLIENT_ID と GOOGLE_CLIENT_SECRET を設定しているか確かめる（web/README.md「環境変数」）",
    );
  }

  return url;
}

/**
 * `email` のユーザーとして、Google を経ずにサインインする。
 *
 * `TOIITO_FAKE_LOGIN=1` の環境でだけ成功する。
 * 許可リストに無い email と、`user` 表に行が無い email は throw する。
 */
export async function signInAsFakeUser(email: string): Promise<void> {
  const requestHeaders = await headers();
  await auth().api.signInFake({ body: { email }, headers: requestHeaders });
}

/**
 * 現在のセッションを取り消し、cookie を削除する。
 * 未サインインで呼んでも成功する。
 */
export async function signOutCurrentUser(): Promise<void> {
  const requestHeaders = await headers();
  await auth().api.signOut({ headers: requestHeaders });
}
