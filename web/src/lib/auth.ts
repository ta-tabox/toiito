/**
 * Better Auth のインスタンス。
 *
 * 設定の読み取りは `auth-config.ts`、Google を経ないサインインは `auth-fake-login.ts` が持ち、`auth.ts` は配線だけを持つ。
 * セッションを読む処理も持たない。
 * 読むのは `current-user.ts` だけで、`biome.json` の `noRestrictedImports` が `@/lib/auth` の import をそのファイルとルートハンドラへ限定する（`docs/adr/0022-session-security.md` 決定 9）。
 *
 * リソースごとの所有者の照合も持たない。
 * `auth.ts` が決めるのはサインインを許すかどうかまでで、他人のリソースを拒否するのは `db.ts` の repo 関数である。
 *
 * エントリポイントは `auth`。
 */

import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { isAllowedEmail, readAuthConfig } from "@/lib/auth-config";
import { fakeLogin } from "@/lib/auth-fake-login";
import { authDatabaseClient, getUserById } from "@/lib/db";

/**
 * セッションの寿命（秒）。
 *
 * 既定の 7 日は「最後に使ってから 7 日」なので、常用すると実質的に無期限になる。
 * 共有端末に開いたままのブラウザを無期限では引き受けないので、1 日で必ず切れる形にする（`docs/adr/0022-session-security.md` 決定 3）。
 */
const SESSION_EXPIRES_IN_SECONDS = 60 * 60 * 24;

/**
 * 組み立て済みの Better Auth。
 * `auth` が最初に呼ばれるまで undefined。
 */
let instance: ReturnType<typeof createAuth> | undefined;

/**
 * Better Auth のインスタンスを返す。
 * 最初の呼び出しで環境変数を読んで組み立て、以後は同じインスタンスを返す。
 *
 * モジュールの評価時でなく最初の呼び出しまで遅らせるのは、`next build` がルートハンドラのモジュールを評価して設定を集めるため。
 * 評価時に読むと、認証の環境変数を持たない CI（`.github/workflows/check.yml`）でビルドが失敗する。
 */
export function auth(): ReturnType<typeof createAuth> {
  instance ??= createAuth();

  return instance;
}

/**
 * 環境変数を読んで Better Auth を組み立てる。
 * 設定が欠けていれば `readAuthConfig` が throw する。
 */
function createAuth() {
  const config = readAuthConfig(process.env);

  return betterAuth({
    appName: "toiito",
    secret: config.secret,

    // Google は redirect URI の事前登録を要求するので、Google を設定するときだけ基点を明示する。
    // Google を設定しない Preview と E2E では、Better Auth がリクエストのヘッダから組み立てる。
    baseURL: config.google?.baseUrl,

    database: prismaAdapter(authDatabaseClient(), { provider: "postgresql" }),

    socialProviders: config.google
      ? {
          google: {
            clientId: config.google.clientId,
            clientSecret: config.google.clientSecret,
          },
        }
      : {},

    session: {
      expiresIn: SESSION_EXPIRES_IN_SECONDS,

      // 使っても期限を延ばさない。
      // 延ばすと、許可リストの照合がサインイン時だけで足りる根拠（許可リストから外しても最大 1 日で切れる）が消える。
      disableSessionRefresh: true,

      // `cookieCache` と `deferSessionRefresh` は書かない。
      // どちらも既定で無効で、有効にしない理由は互いに別である（`docs/ARCHITECTURE.md`「セッションについて今も効く禁止則」）。
    },

    account: {
      // 同じ email の別プロバイダが 1 人の利用者へまとめられる形を、相手が実在しないうちは開けない（`docs/adr/0029-auth-better-auth.md` 決定 6）。
      // 無効から有効へは後で動かせるが、一度まとめた行は分けられない。
      accountLinking: { enabled: false },

      // サインインのたびにトークンを書き直す既定を止める。
      // 下の `databaseHooks.account.create.before` が作成時に取り除くので、更新の経路も閉じないと 2 回目のサインインで入り直す。
      updateAccountOnSignIn: false,
    },

    advanced: {
      // 環境で値が変わらない 2 つだけを明示する（`docs/adr/0022-session-security.md` 決定 1）。
      // `secure` は書かない。
      // `defaultCookieAttributes` は Better Auth が算出した既定を上書きするので、`secure: true` と書くと手元の `pnpm dev`（http）でも設定されてサインインできなくなる。
      // 本番で設定されていることは `docs/DEPLOY.md`「ログイン」の curl が確認する。
      defaultCookieAttributes: { httpOnly: true, sameSite: "lax" },
    },

    databaseHooks: {
      session: {
        create: {
          before: async (session) => {
            const user = await getUserById(session.userId);

            if (!user || !isAllowedEmail(config.allowedEmails, user.email)) {
              console.warn(
                `サインインを拒否した: ${user?.email ?? session.userId}。TOIITO_ALLOWED_EMAILS に載っていない`,
              );

              return false;
            }
          },
        },
      },

      account: {
        create: {
          before: async (account) => ({
            data: {
              ...account,
              accessToken: null,
              refreshToken: null,
              idToken: null,
            },
          }),
        },
      },
    },

    // `nextCookies` は最後に置く。
    // Better Auth が組み立てた Set-Cookie を Next の cookie ストアへ写す after フックなので、後ろにプラグインがあるとその分の cookie を取りこぼす。
    plugins: [fakeLogin(config.isFakeLoginEnabled), nextCookies()],
  });
}
