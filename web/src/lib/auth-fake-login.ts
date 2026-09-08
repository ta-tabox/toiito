/**
 * Google を経ないサインインのエンドポイント（`POST /api/auth/sign-in/fake`）を足す Better Auth プラグイン。
 *
 * Preview と E2E だけが有効にする。
 * Preview の URL は PR ごとに変わり、Google は redirect URI の事前登録を要求してワイルドカードを受け付けないので、Preview では本物の OAuth を通せない（`docs/adr/0029-auth-better-auth.md` 決定 7）。
 * E2E は 2 人分の利用者と未サインインの状態を作る必要があり、実 OAuth ではどちらも自動化できない。
 *
 * 誰を通すかは判定しない。
 * 許可リストの照合は `auth.ts` の `databaseHooks.session.create.before` が行うので、このエンドポイントを通っても許可リストに無い email はセッションを作れない。
 * 利用者も作らない。
 * `user` 表に行が無い email は 400 になるので、Preview と E2E は先に `pnpm seed` を実行する。
 *
 * エントリポイントは `fakeLogin`。
 */

import { APIError, createAuthEndpoint } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";

/** `POST /api/auth/sign-in/fake` が受け取る本文。 */
type FakeSignInBody = { email: string };

/**
 * Google を経ないサインインを足すプラグインを返す。
 * `isEnabled` が false なら、エンドポイントは常に 404 を throw する。
 *
 * 無効なときもプラグインごと外さないのは、`auth.api.signInFake` の型を環境変数で消さないため。
 * 本番で有効にできないことは `readAuthConfig` が別に検証する（`docs/adr/0033-login-and-fake-sign-in.md` 決定 3）。
 */
export function fakeLogin(isEnabled: boolean) {
  return {
    id: "fake-login",

    endpoints: {
      signInFake: createAuthEndpoint(
        "/sign-in/fake",

        // 本文の型は `$Infer` で宣言する。
        // Better Auth が本文の schema に使う zod はこのアプリの依存に無いので、実行時の検証は `parseBody` が持つ。
        {
          method: "POST",
          metadata: { $Infer: { body: {} as FakeSignInBody } },
        },
        async (ctx) => {
          if (!isEnabled) {
            throw new APIError("NOT_FOUND", {
              message:
                "Google を経ないサインインは無効。有効にするには TOIITO_FAKE_LOGIN=1 を設定する",
            });
          }

          const { email } = parseBody(ctx.body);
          const found =
            await ctx.context.internalAdapter.findUserByEmail(email);

          if (!found) {
            throw new APIError("BAD_REQUEST", {
              message: `user 表に ${email} の行が無い。Preview と E2E は pnpm seed を先に実行する`,
            });
          }

          const session = await ctx.context.internalAdapter.createSession(
            found.user.id,
          );

          // `databaseHooks.session.create.before` が許可リストで拒否すると null になる。
          if (!session) {
            throw new APIError("FORBIDDEN", {
              message: `${email} は TOIITO_ALLOWED_EMAILS に載っていない`,
            });
          }

          await setSessionCookie(ctx, { session, user: found.user });

          return ctx.json({ email });
        },
      ),
    },
  };
}

/**
 * リクエスト本文から email を取り出す。
 * `email` が文字列でなければ 400 を throw する。
 *
 * 検証を手で書くのは、Better Auth が本文の schema に使う zod がこのアプリの依存に無いため。
 */
function parseBody(body: unknown): FakeSignInBody {
  if (
    typeof body !== "object" ||
    body === null ||
    !("email" in body) ||
    typeof body.email !== "string"
  ) {
    throw new APIError("BAD_REQUEST", {
      message: "本文に email（文字列）が要る",
    });
  }

  return { email: body.email };
}
