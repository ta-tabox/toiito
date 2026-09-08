/**
 * 現在のユーザーの取得と、サインイン・サインアウトの実行。
 *
 * RSC と Server Action は `requireCurrentUser` を経由してから `db.ts` の repo 関数を呼ぶ。
 * 「このユーザーを通してよいか」の判定を後から 1 箇所へ足せるので、経路を 1 本に絞る（`docs/adr/0022-session-security.md` 決定 9）。
 * その判定はまだ無く、いま見ているのは Better Auth のセッションが在るかどうかだけである。
 * `better-auth` と `@/lib/auth` を import してよいのはこのファイルとルートハンドラだけで、`biome.json` の `noRestrictedImports` が検査する。
 *
 * 誰がサインインできるかは決めない。
 * 許可リストの照合は `auth.ts` の `databaseHooks.session.create.before` が行う。
 *
 * エントリポイントは `requireCurrentUser`。
 */

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { auth } from "@/lib/auth";
import { getUserById } from "@/lib/db";
import type { User } from "@/lib/types";

/**
 * サインインの画面。
 * 未サインインのリクエストの送り先。
 */
export const LOGIN_PATH = "/login";

/** サインインした後に戻る画面。 */
const AFTER_SIGN_IN_PATH = "/";

/**
 * 現在のユーザーを返す。
 * 未サインインなら undefined を返す。
 *
 * `React.cache()` で包むので、1 リクエストの中で何度呼んでも DB への往復は 1 往復で済む。
 * セッションを取り消せる状態を保ったまま往復を減らせるので、Better Auth の `cookieCache` でなく `React.cache()` を使う（`docs/adr/0022-session-security.md` 決定 6）。
 */
export const getCurrentUser = cache(async (): Promise<User | undefined> => {
  const session = await auth().api.getSession({ headers: await headers() });

  if (!session) {
    return undefined;
  }

  // セッションが写している値でなく `user` 表を SELECT する。
  // `OwnerId` を付けてよいのは `user` 表を読んだ `db.ts` だけで、その型が repo 関数へ所有者を渡せる唯一の根拠になる。
  return getUserById(session.user.id);
});

/**
 * 現在のユーザーを返す。
 * 未サインインなら `/login` へ redirect し、呼び出し側へは戻らない。
 */
export async function requireCurrentUser(): Promise<User> {
  const user = await getCurrentUser();

  if (!user) {
    redirect(LOGIN_PATH);
  }

  return user;
}

/**
 * Google の同意画面の URL を返す。
 *
 * リクエストを送るのは呼び出し側（Server Action）で、`startGoogleSignIn` は URL を組み立てるところまでを持つ。
 * Google を設定していない環境では URL が返らないので throw する。
 */
export async function startGoogleSignIn(): Promise<string> {
  const { url } = await auth().api.signInSocial({
    body: { provider: "google", callbackURL: AFTER_SIGN_IN_PATH },
    headers: await headers(),
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
  await auth().api.signInFake({ body: { email }, headers: await headers() });
}

/**
 * 現在のセッションを取り消し、cookie を削除する。
 * 未サインインで呼んでも成功する。
 */
export async function signOutCurrentUser(): Promise<void> {
  await auth().api.signOut({ headers: await headers() });
}
