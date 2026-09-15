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
 * エントリポイントは `requireCurrentUser` と、管理の画面と操作が通る `requireAdmin`。
 */

import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
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
  const requestHeaders = await headers();
  const session = await auth().api.getSession({ headers: requestHeaders });

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
 * 現在のユーザーが管理者なら、そのユーザーを返す。
 * 未サインインなら `/login` へ redirect し、`is_admin` が偽なら `notFound()` を呼び、どちらも呼び出し側へは戻らない。
 *
 * 管理の画面と、管理の操作を行う Server Action は、どれも最初に `requireAdmin` を呼ぶ。
 * 管理の画面が在ること自体を管理者でないユーザーへ伏せるので、403 でなく 404 にする。
 */
export async function requireAdmin(): Promise<User> {
  const user = await requireCurrentUser();

  if (!user.is_admin) {
    notFound();
  }

  return user;
}
