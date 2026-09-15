/**
 * 利用者の API キーの暗号化と、鍵の一覧を環境変数から読む写像の検査。
 *
 * env は `process.env` を触らず、env を模した object を渡す（規約は `src/lib/secrets-config.ts`）。
 */

import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  decryptApiKey,
  encryptApiKey,
  readEncryptionKeyRing,
} from "@/lib/secrets";

/** 暗号化する平文で、API キーの形をした値。 */
const PLAIN = "sk-ant-api03-plain-text-for-test";

/** 回転の前から使っている鍵の組。 */
const OLD_ENTRY = `old:${randomBytes(32).toString("base64")}`;

/** 回転で足す鍵の組。 */
const NEW_ENTRY = `new:${randomBytes(32).toString("base64")}`;

/** `entries` をカンマ区切りで並べた env から鍵の一覧を読む。 */
function ringOf(...entries: string[]) {
  return readEncryptionKeyRing({
    TOIITO_API_KEY_ENCRYPTION_KEYS: entries.join(","),
  });
}

/**
 * `run` が throw したエラーの文を返す。
 * `run` が throw しなければ throw する。
 */
function errorMessageOf(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }

  throw new Error("throw しなかった");
}

describe("encryptApiKey と decryptApiKey", () => {
  it("暗号化した値を同じ鍵の一覧で復号すると、元の平文に戻る", () => {
    const keys = ringOf(OLD_ENTRY);

    expect(decryptApiKey(encryptApiKey(PLAIN, keys), keys)).toBe(PLAIN);
  });

  it("暗号文は、平文も平文の base64 も含まない", () => {
    const stored = encryptApiKey(PLAIN, ringOf(OLD_ENTRY));

    expect(stored).not.toContain(PLAIN);
    expect(stored).not.toContain(Buffer.from(PLAIN).toString("base64"));
  });

  it("同じ平文を二回暗号化すると、暗号文が違う", () => {
    const keys = ringOf(OLD_ENTRY);

    expect(encryptApiKey(PLAIN, keys)).not.toBe(encryptApiKey(PLAIN, keys));
  });

  it("暗号文の鍵 ID に当たる鍵が一覧に無ければ throw する", () => {
    const stored = encryptApiKey(PLAIN, ringOf(OLD_ENTRY));

    expect(() => decryptApiKey(stored, ringOf(NEW_ENTRY))).toThrow(
      /鍵 ID old の鍵/,
    );
  });

  it("暗号文のどの 1 文字を書き換えても throw する", () => {
    const keys = ringOf(OLD_ENTRY);
    const stored = encryptApiKey(PLAIN, keys);
    const tampered = [...stored].map((char, index) => {
      const replacement = char === "A" ? "B" : "A";

      return stored.slice(0, index) + replacement + stored.slice(index + 1);
    });

    for (const value of tampered) {
      expect(() => decryptApiKey(value, keys)).toThrow();
    }
  });

  it("throw したエラー文は、平文も暗号文の本体も含まない", () => {
    const stored = encryptApiKey(PLAIN, ringOf(OLD_ENTRY));
    const [, ...cipherParts] = stored.split(":");
    const sameIdOtherValue = `old:${randomBytes(32).toString("base64")}`;
    const messages = [
      errorMessageOf(() => decryptApiKey(stored, ringOf(NEW_ENTRY))),
      errorMessageOf(() => decryptApiKey(stored, ringOf(sameIdOtherValue))),
    ];

    for (const message of messages) {
      expect(message).not.toContain(PLAIN);

      for (const part of cipherParts) {
        expect(message).not.toContain(part);
      }
    }
  });

  it("旧い鍵と新しい鍵を併記した一覧は、どちらの鍵の暗号文も復号する", () => {
    const rotating = ringOf(NEW_ENTRY, OLD_ENTRY);
    const storedWithOld = encryptApiKey(PLAIN, ringOf(OLD_ENTRY));
    const storedWithNew = encryptApiKey(PLAIN, ringOf(NEW_ENTRY));

    expect(decryptApiKey(storedWithOld, rotating)).toBe(PLAIN);
    expect(decryptApiKey(storedWithNew, rotating)).toBe(PLAIN);
  });

  it("旧い鍵と新しい鍵を併記した一覧で暗号化した値は、新しい鍵だけで復号でき、旧い鍵だけでは復号できない", () => {
    const stored = encryptApiKey(PLAIN, ringOf(NEW_ENTRY, OLD_ENTRY));

    expect(decryptApiKey(stored, ringOf(NEW_ENTRY))).toBe(PLAIN);
    expect(() => decryptApiKey(stored, ringOf(OLD_ENTRY))).toThrow();
  });
});

describe("readEncryptionKeyRing", () => {
  it("TOIITO_API_KEY_ENCRYPTION_KEYS が未設定なら throw する", () => {
    expect(() => readEncryptionKeyRing({})).toThrow(
      /TOIITO_API_KEY_ENCRYPTION_KEYS が空/,
    );
  });

  it("鍵 ID と鍵の値の区切りが無い組があれば throw する", () => {
    expect(() => ringOf(OLD_ENTRY, "no-separator")).toThrow(
      /2 番目の組が <鍵 ID>:<鍵の値> の形でない/,
    );
  });

  it("鍵の値が 32 バイトでなければ throw する", () => {
    expect(() => ringOf(`short:${randomBytes(16).toString("base64")}`)).toThrow(
      /1 番目の組の鍵の値が 32 バイトの base64 でない/,
    );
  });

  it("鍵 ID が重複していれば throw する", () => {
    expect(() =>
      ringOf(OLD_ENTRY, `old:${randomBytes(32).toString("base64")}`),
    ).toThrow(/鍵 ID が重複している: old/);
  });

  it("組の前後の空白と改行を除いて読む", () => {
    const stored = encryptApiKey(PLAIN, ringOf(OLD_ENTRY));

    expect(decryptApiKey(stored, ringOf(` ${OLD_ENTRY}\n`))).toBe(PLAIN);
  });

  it("throw したエラー文は、鍵の値を含まない", () => {
    const shortValue = randomBytes(16).toString("base64");
    const longValue = randomBytes(32).toString("base64");
    const cases = [
      { value: shortValue, entry: `short:${shortValue}` },
      { value: longValue, entry: longValue },
    ];

    for (const { value, entry } of cases) {
      expect(errorMessageOf(() => ringOf(entry))).not.toContain(value);
    }
  });
});
