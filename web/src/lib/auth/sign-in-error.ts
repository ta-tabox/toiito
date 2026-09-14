/**
 * Better Auth がログインの画面へ付けて送るエラーコードを、画面に出す文言へ写す。
 *
 * 文言はサインインできなかったことだけを伝え、許可リストに無いことも、このアプリが招待制であることも出さない。
 * コードの文字列を受け取るだけで、Better Auth にも next にも依存しない。
 */

/** `state` の照合に失敗したコードに出す文言。 */
const STATE_MESSAGE =
  "ログインを始めてから時間が経ったか、始めたときと別のブラウザで戻ったので、ログインできなかった。もう一度ログインを試せる。";

/** 個別の文言を持たないコードに出す文言。 */
const FALLBACK_MESSAGE =
  "ログインの途中で問題が起きた。もう一度ログインを試せる。";

/**
 * 個別の文言を持つエラーコードと、その文言。
 *
 * `Map` で持つので、`toString` のようなプロトタイプのキーが来ても個別の文言に当たらない。
 */
const MESSAGES_BY_CODE: ReadonlyMap<string, string> = new Map([
  // `lib/auth/index.ts` の `databaseHooks.session.create.before` が false を返したときのコード。
  ["unable_to_create_session", "ログインできなかった。"],

  // Google の同意画面でキャンセルしたときに、Google が付けて戻すコード。
  ["access_denied", "Google の画面でログインを取りやめた。"],

  ["state_not_found", STATE_MESSAGE],
  ["state_mismatch", STATE_MESSAGE],
]);

/**
 * エラーコード `error` から、ログインの画面に出す文言を返す。
 * `error` が無ければ undefined を返し、個別の文言を持たないコードには共通の文言を返す。
 */
export function formatSignInError(
  error: string | undefined,
): string | undefined {
  if (!error) {
    return undefined;
  }

  return MESSAGES_BY_CODE.get(error) ?? FALLBACK_MESSAGE;
}
