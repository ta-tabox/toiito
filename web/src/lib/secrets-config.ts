/**
 * 利用者の API キーを暗号化する鍵の一覧を `process.env` から読む関数を置く。
 * 値の形式の検証は持たず、`secrets.ts` の `readEncryptionKeyRing` が持つ。
 */

import { type EncryptionKeyRing, readEncryptionKeyRing } from "@/lib/secrets";

/**
 * `process.env` の `TOIITO_API_KEY_ENCRYPTION_KEYS` から鍵の一覧を読む。
 * 未設定か形式が不正なら throw する。
 *
 * モジュールの評価時でなく呼ぶたびに読むので、鍵を持たない CI の `next build` がこのモジュールを評価しても throw しない。
 */
export function encryptionKeyRing(): EncryptionKeyRing {
  return readEncryptionKeyRing(process.env);
}
