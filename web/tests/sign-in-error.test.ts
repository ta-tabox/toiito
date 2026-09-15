import { describe, expect, it } from "vitest";
import { formatSignInError } from "@/lib/auth/sign-in-error";

/** 個別の文言を持つエラーコード。 */
const CODES_WITH_OWN_MESSAGE = [
  "unable_to_create_session",
  "access_denied",
  "state_not_found",
  "state_mismatch",
];

/** Better Auth が送りうるが、個別の文言を持たないエラーコード。 */
const CODES_WITHOUT_OWN_MESSAGE = [
  "account_not_linked",
  "internal_server_error",
];

describe("formatSignInError", () => {
  it.each(CODES_WITH_OWN_MESSAGE)(
    "%s には、個別の文言を持たないコードと違う文言を返す",
    (code) => {
      const message = formatSignInError(code);

      expect(message).toBeDefined();
      expect(message).not.toBe(formatSignInError(CODES_WITHOUT_OWN_MESSAGE[0]));
    },
  );

  it("個別の文言を持たないコードには、どれにも同じ文言を返す", () => {
    const messages = CODES_WITHOUT_OWN_MESSAGE.map(formatSignInError);

    expect(messages[0]).toBeDefined();
    expect(new Set(messages).size).toBe(1);
  });

  it("error が無ければ undefined を返す", () => {
    expect(formatSignInError(undefined)).toBeUndefined();
    expect(formatSignInError("")).toBeUndefined();
  });
});
