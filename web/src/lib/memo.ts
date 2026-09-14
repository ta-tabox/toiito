/**
 * メモのキーワードの検証。
 *
 * Server Action がフォームから受け取ったキーワードを、`addMemo` へ渡す前に通す。
 * DB も next も DOM も import しない。
 */

/**
 * `value` の前後の空白を除いた文字列を、メモのキーワードとして返す。
 * 前後の空白を除くと空になるなら throw する。
 */
export function parseMemoKeyword(value: string): string {
  const keyword = value.trim();

  if (!keyword) {
    throw new Error(`メモのキーワードが空か空白だけ: ${JSON.stringify(value)}`);
  }

  return keyword;
}
