/**
 * サインインの画面。
 *
 * 未サインインのリクエストが送られてくる先で、送るのは `proxy.ts` と各画面の `requireCurrentUser` である。
 * 認証の判断は持たない。
 * 押せるボタンを設定から決めるだけで、誰を通すかは `auth.ts` の許可リストの照合が決める。
 *
 * 既にサインインしていれば問いの一覧へ送る。
 * サインインしたままログインの画面が開くと、押しても何も起きないボタンが並ぶ。
 */

import { redirect } from "next/navigation";
import { signInAsFakeUserAction, signInWithGoogleAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { readAuthConfig } from "@/lib/auth/config";
import { getCurrentUser } from "@/lib/auth/current-user";

export const dynamic = "force-dynamic";

/**
 * サインインの画面。
 * Google のボタンと、`TOIITO_FAKE_LOGIN=1` のときだけ出る許可リストのボタンを並べる。
 */
export default async function LoginPage() {
  if (await getCurrentUser()) {
    redirect("/");
  }

  const config = readAuthConfig(process.env);

  return (
    <main className="mx-auto w-full max-w-reading flex-1 px-5 py-10">
      <h1 className="font-mincho text-question md:text-question-lg">
        toiito{" "}
        <span className="font-gothic text-aux text-ink-weak">問いの発酵槽</span>
      </h1>

      <p className="mt-8 text-aux text-ink-weak">
        自分の問いを読み書きするには、ログインが要る。
      </p>

      {config.google && (
        <form action={signInWithGoogleAction} className="mt-8">
          <Button type="submit" tone="solid">
            Google でログイン
          </Button>
        </form>
      )}

      {config.isFakeLoginEnabled && (
        <section className="mt-8 border-rule border-t pt-8">
          <h2 className="text-meta text-ink-weak">
            Google を経ないログイン（Preview と E2E だけ）
          </h2>

          <ul className="mt-2 flex flex-col items-start gap-2">
            {config.allowedEmails.map((email) => (
              <li key={email}>
                <form action={signInAsFakeUserAction}>
                  <input type="hidden" name="email" value={email} />
                  <Button type="submit">{email}</Button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
