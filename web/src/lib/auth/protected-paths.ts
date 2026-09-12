/**
 * URL の経路が、サインインしたユーザーを要求するかどうかの判定。
 *
 * 判定するのは経路だけで、cookie もセッションも見ない。
 * next にも better-auth にも依存しないので、経路の判定を単体テストから直に呼べる。
 *
 * 他人のリソースを拒否する層ではない。
 * `requiresSignIn` が true を返す経路でも、誰が何を読めるかを決めるのは `db.ts` の repo 関数である（`docs/adr/0029-auth-better-auth.md` 決定 5）。
 */

/**
 * サインインの画面。
 * 未サインインのリクエストの送り先。
 */
export const LOGIN_PATH = "/login";

/**
 * サインインを要求しない経路の接頭辞。
 *
 * `/api/auth` はサインインそのものを行う経路で、`/_next` はページを描くのに要る資産である。
 * どちらもサインインを要求すると、サインインする手段が無くなる。
 */
const PUBLIC_PREFIXES = [LOGIN_PATH, "/api/auth", "/_next"];

/** サインインを要求しない、単独のファイル。 */
const PUBLIC_PATHS = ["/favicon.ico"];

/**
 * `pathname` がサインインしたユーザーを要求するかを判定する。
 *
 * 一覧に無い経路はすべて true を返す。
 * 経路を足したときに、書き忘れが検証なしで通す側へ倒れないようにするため。
 */
export function requiresSignIn(pathname: string): boolean {
  if (PUBLIC_PATHS.includes(pathname)) {
    return false;
  }

  return !PUBLIC_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}
