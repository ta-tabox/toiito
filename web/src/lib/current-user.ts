/**
 * 現在のユーザーを返す唯一の口。
 *
 * RSC と Server Action はここを通ってから db.ts を呼ぶ。
 * 経路を一本に絞るのは、「このユーザーを通してよいか」の判定を後から一箇所へ足せるようにするため（`docs/adr/0022-session-security.md` 決定 9）。
 * いまその判定は無く、引いたユーザーをそのまま返している。
 * 停止したユーザーを弾くような判定（#69（管理機能））が要るようになったとき、書き足す先はこの関数の中だけになる。
 *
 * ログインはまだ無く、ユーザーは環境変数が名指しする一人に固定される（`docs/adr/0031-ownership-before-auth.md` 決定 5）。
 * 本番でもそうなので、**外周を守っているのは `proxy.ts` の Basic 認証だけ**である。
 * Basic 認証を外すのは、#68（ログイン（Google OAuth）とリソースの所有権）で本物のログインを入れて本番で動作を確かめた後になる。
 * `better-auth` と将来の `@/lib/auth` を import してよいのはこのファイルだけで、それは biome の `noRestrictedImports` が見ている。
 *
 * 入口は getCurrentUser。
 */

import { cache } from "react";
import { getUserByEmail } from "@/lib/db";
import type { User } from "@/lib/types";

/**
 * 単一ユーザーの運用に効く環境変数。
 *
 * 索引の署名を持つのは `process.env` をそのまま渡せるようにするため（`lib/ai/provider.ts` の `FakeEnv` と同じ形）。
 * 省略可能な欄だけの型は weak type 検出に当たり、`ProcessEnv` を受け取れない。
 */
type SingleUserEnv = {
  readonly TOIITO_SINGLE_USER_EMAIL?: string;
  readonly [key: string]: string | undefined;
};

/**
 * 唯一のユーザーの email を env から読む。
 *
 * `TOIITO_SINGLE_USER_EMAIL` が未設定なら落とす。
 * 既定値へ倒すと、設定を忘れたまま誰かのつもりで動いてしまう。
 * 「掛けたつもりで掛かっていない」形はこのアプリで既に二度出ているので、倒し先を作らない（`docs/adr/0022-session-security.md`）。
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
 * `React.cache()` で包むので、1 リクエストの中で何度呼んでも DB は 1 回しか引かない。
 * 取り消しの窓を作らずに往復を減らす手段がこれで、Better Auth 側の `cookieCache` は禁じてある（`docs/adr/0022-session-security.md` 決定 6）。
 *
 * 名指しされたユーザーが DB に居なければ落とす。
 * 居ない相手のリソースは一件も無いので、素通りさせると空の画面が正常系に見える。
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
