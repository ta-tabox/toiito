/**
 * アクセス制限を試すサーバーへ渡す資格情報。
 *
 * 立てる側（`playwright.config.ts`）と叩く側（`e2e/basic-auth.spec.ts`）の両方が同じ値を要るので、決める口を一つにする。
 * 本番の値とは関係が無い。
 */

/** E2E 専用の資格情報。 */
export const BASIC_AUTH = {
  user: "e2e",
  password: "e2e-秘密:のことば",
} as const;
