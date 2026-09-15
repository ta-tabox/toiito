/**
 * メモの値の規則。
 * 利用者が入力してメモに保存する値（キーワード・ノート）を、保存する前に確かめる関数を置く。
 * メモの範囲（アンカー）の規則は `anchors.ts` が持つ。
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
