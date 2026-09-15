/**
 * 画面の URL の書式。
 * 画面へのリンク・遷移・Server Action の再検証が使うルートの型と、ルートの型から URL を組み立てる関数を置く。
 * 画面の URL を新しく組み立てるときは、ルートの型を `ROUTES` へ、組み立てる関数をこのモジュールへ足す。
 */

/**
 * 画面のルートの型。
 * `questionPathOf` が URL を組み立てる元になり、`revalidatePath` へ型のまま渡すときにも使う。
 */
export const ROUTES = {
  question: "/q/[id]",
} as const;

/**
 * 問いの対話画面で、`messageId` の発話の要素に付ける id を返す。
 *
 * `globals.css` の `[id^="msg-"]` が同じ接頭辞で発話の要素を指すので、接頭辞を変えるときは `globals.css` も直す。
 */
export function messageElementIdOf(messageId: string): string {
  return `msg-${messageId}`;
}

/**
 * `questionId` の問いの対話画面の URL を組み立てる。
 * `at.sessionId` を渡すとそのセッションを描く URL に、`at.messageId` を渡すとその発話の位置を指す URL になる。
 */
export function questionPathOf(
  questionId: string,
  at: { readonly sessionId?: string; readonly messageId?: string } = {},
): string {
  const path = ROUTES.question.replace("[id]", questionId);
  const query = at.sessionId ? `?s=${at.sessionId}` : "";
  const fragment = at.messageId ? `#${messageElementIdOf(at.messageId)}` : "";

  return `${path}${query}${fragment}`;
}
