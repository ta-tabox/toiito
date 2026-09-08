/**
 * 現在のユーザーを返す。
 *
 * RSC と Server Action は `getCurrentUser` を経由してから `db.ts` の repo 関数を呼ぶ。
 * 「このユーザーを通してよいか」の判定を後から 1 箇所へ足せるので、経路を 1 本に絞る（`docs/adr/0022-session-security.md` 決定 9）。
 * その判定はまだ無く、`user` 表から取得したユーザーをそのまま返す。
 * ログインがまだ無いので、ユーザーは `TOIITO_SINGLE_USER_EMAIL` が名指しする 1 人に固定される（`docs/adr/0031-ownership-before-auth.md` 決定 5）。
 * 本番も同じなので、認証を持たないリクエストを拒否するのは `proxy.ts` の Basic 認証だけである。
 * `better-auth` と `@/lib/auth` を import してよいのはこのファイルだけで、`biome.json` の `noRestrictedImports` が検査する。
 *
 * エントリポイントは `getCurrentUser`。
 */

import { cache } from "react";
import { getUserByEmail } from "@/lib/db";
import type { User } from "@/lib/types";

/**
 * `readSingleUserEmail` が受け取る環境変数。
 *
 * 省略可能なプロパティだけの型は weak type 検出に当たって `ProcessEnv` を代入できないので、インデックスシグネチャを持たせる（`lib/ai/provider.ts` の `FakeEnv` と同じ形）。
 */
type SingleUserEnv = {
  readonly TOIITO_SINGLE_USER_EMAIL?: string;
  readonly [key: string]: string | undefined;
};

/**
 * `TOIITO_SINGLE_USER_EMAIL` を読む。
 *
 * 未設定なら throw する。
 * 既定値を返すと、設定を忘れたまま別のユーザーとして動いてしまうため（`docs/adr/0022-session-security.md`）。
 */
export function readSingleUserEmail(env: SingleUserEnv): string {
  const email = env.TOIITO_SINGLE_USER_EMAIL;

  if (!email) {
    throw new Error(
      "TOIITO_SINGLE_USER_EMAIL が設定されていない。ログインが入るまで、現在のユーザーはこの環境変数が名指しする（web/README.md「環境変数」）",
    );
  }

  return email;
}

/**
 * 現在のユーザーを返す。
 *
 * `TOIITO_SINGLE_USER_EMAIL` が名指しするユーザーが `user` 表に無ければ throw する。
 * 行が無いユーザーの所有物は 0 件なので、throw しないと空の一覧が正常な結果に見える。
 * `React.cache()` で包むので、1 リクエストの中で何度呼んでも `user` 表への SELECT は 1 回で済む。
 * セッションを取り消せる状態を保ったまま往復を減らせるので、Better Auth の `cookieCache` でなく `React.cache()` を使う（`docs/adr/0022-session-security.md` 決定 6）。
 */
export const getCurrentUser = cache(async (): Promise<User> => {
  const email = readSingleUserEmail(process.env);
  const user = await getUserByEmail(email);

  if (!user) {
    throw new Error(
      `TOIITO_SINGLE_USER_EMAIL が名指しするユーザーが DB に居ない: ${email}。手元と Preview は pnpm seed、本番は docs/DEPLOY.md「唯一のユーザーの行を入れる」の手順で用意する`,
    );
  }

  return user;
});
