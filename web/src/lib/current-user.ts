/**
 * 現在の利用者を返す唯一の口。
 *
 * RSC と Server Action はここを通ってから db.ts を呼ぶ。
 * 経路を一本に絞るのは、誰を通すかの述語を後で一箇所へ入れられるようにするため（`docs/adr/0022-session-security.md` 決定 9）。
 * その述語はまだ空で、いま置いてあるのは器だけである。
 *
 * 認証そのものはまだ無い。
 * 中身は環境変数で固定の利用者を指すフェイクで、本物のログインは #68（ログイン（Google OAuth）とリソースの所有権）が入れる。
 * `better-auth` と将来の `@/lib/auth` を import してよいのはこのファイルだけで、それは biome の `noRestrictedImports` が見ている。
 *
 * 入口は getCurrentUser。
 */

import { cache } from "react";
import { getUserByEmail } from "@/lib/db";
import type { User } from "@/lib/types";

/** フェイク認証に効く環境変数。 */
type FakeUserEnv = {
  readonly TOIITO_FAKE_USER_EMAIL?: string;
  readonly NODE_ENV?: string;
  readonly VERCEL_ENV?: string;
};

/**
 * 本番でフェイク認証が設定されていたら落とす。
 *
 * 認証を丸ごと外す口なので、運用上の注意ではなくモジュールの評価時の例外にする（`docs/adr/0019-auth-better-auth.md` 決定 7）。
 * 要求を受けるまで判定を遅らせると、設定の誤りが本番の一枚目の画面まで表に出ない。
 *
 * `NODE_ENV` だけでは Preview を本番と見分けられない（`next build` の出力はどちらも production で走る。`docs/adr/0015-preview-neon-branch.md`）ので、Preview だけを `VERCEL_ENV` で除ける。
 * 引き金は `NODE_ENV` のままなので、他所のホストへ移して `VERCEL_ENV` が未定義になっても判定は素通しへ落ちない（`docs/adr/0013-production-basic-auth.md` が `VERCEL_ENV` を引き金にしない条件として挙げているのはその落ち方である）。
 *
 * 手元の `next build` も `NODE_ENV=production` で走るので、この変数は `.env.local` でなく `.env.development.local` へ置く（`web/README.md`「環境変数」）。
 */
export function assertFakeUserNotInProduction(env: FakeUserEnv): void {
  if (
    env.NODE_ENV === "production" &&
    env.VERCEL_ENV !== "preview" &&
    env.TOIITO_FAKE_USER_EMAIL
  ) {
    throw new Error(
      "本番で TOIITO_FAKE_USER_EMAIL は使えない。これは認証を丸ごと外す口で、Preview と E2E のためだけに在る（docs/adr/0019-auth-better-auth.md 決定 7）。手元の next build もここに当たるので、渡すなら .env.development.local へ置く",
    );
  }
}

assertFakeUserNotInProduction(process.env);

/**
 * フェイク認証が指す利用者の email を env から読む。
 *
 * 未設定なら落とす。
 * 素通しへ倒す分岐を作らないためで、「掛けたつもりで掛かっていない」形はこの器で既に二度出ている（`docs/adr/0022-session-security.md`）。
 */
export function readFakeUserEmail(env: FakeUserEnv): string {
  const email = env.TOIITO_FAKE_USER_EMAIL;

  if (!email) {
    throw new Error(
      "TOIITO_FAKE_USER_EMAIL が設定されていない。本物のログインが入るまで、現在の利用者はこの環境変数が指す（web/README.md「環境変数」）",
    );
  }

  return email;
}

/**
 * 現在の利用者を返す。
 *
 * `React.cache()` で包むので、1 リクエストの中で何度呼んでも DB は 1 回しか引かない。
 * 取り消しの窓を作らずに往復を減らす手段がこれで、Better Auth 側の `cookieCache` は禁じてある（`docs/adr/0022-session-security.md` 決定 6）。
 *
 * 指す利用者が DB に居なければ落とす。
 * 居ない相手のリソースは一件も無いので、素通りさせると空の画面が正常系に見える。
 */
export const getCurrentUser = cache(async (): Promise<User> => {
  const email = readFakeUserEmail(process.env);
  const user = await getUserByEmail(email);

  if (!user) {
    throw new Error(
      `TOIITO_FAKE_USER_EMAIL が指す利用者が DB に居ない: ${email}。pnpm seed で入れる`,
    );
  }

  return user;
});
