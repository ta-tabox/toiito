/**
 * 発話本文の長さの上限。
 *
 * `db.ts`・`turn.ts`・クライアント側のフォームの三つから import するので、独立したファイルに置く。
 */

/**
 * 発話本文に許す最大文字数（UTF-16 code unit）。
 *
 * textarea の `maxLength` が同じ単位で数えるので、ブラウザが入力を止める位置とサーバーが拒否する位置が一致する。
 * この値が無いと、上限は Next の `serverActions.bodySizeLimit` の既定（1MB）だけになる。
 */
export const MESSAGE_BODY_MAX_LENGTH = 4000;
