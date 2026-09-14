/**
 * 現在のユーザーを取得する。
 *
 * RSC と Server Action は `requireCurrentUser` を経由してから `db.ts` の repo 関数を呼ぶ。
 * 「このユーザーを通してよいか」の判定を後から 1 箇所へ足せるので、経路を 1 本に絞る。
 * その判定はまだ無く、いま見ているのは Better Auth のセッションが在るかどうかだけである。
 * `@/lib/auth` を import してよいのはこのファイルと `sign-in.ts` とルートハンドラだけで、`biome.json` の `noRestrictedImports` が検査する。
 *
 * 誰がサインインできるかは決めない。
 * 許可リストの照合は `auth/index.ts` の `databaseHooks.session.create.before` が行う。
 *
 * エントリポイントは `requireCurrentUser`。
 */

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { auth } from "@/lib/auth";
import { LOGIN_PATH } from "@/lib/auth/protected-paths";
import { getUserById } from "@/lib/db";
import type { User } from "@/lib/types";

/**
 * 現在のユーザーを返す。
 * 未サインインなら undefined を返す。
 *
 * `React.cache()` で包むので、1 リクエストの中で何度呼んでも DB への往復は 1 往復で済む。
 * セッションを取り消せる状態を保ったまま往復を減らせるので、Better Auth の `cookieCache` でなく `React.cache()` を使う。
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
