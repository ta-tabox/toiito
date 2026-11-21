/**
 * 利用者の API キーの暗号文を暗号化し直すスクリプトと、鍵 ID ごとの件数の出力の検査。
 *
 * 鍵の一覧は `process.env` を触らず、env を模した値から作る。
 */

import { randomBytes } from "node:crypto";
import {
  reencryptApiKeys,
  reportApiKeys,
  resolveKeysTarget,
} from "@scripts/reencrypt-api-keys";
import { createOwner } from "@tests/setup/owner";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import * as db from "@/lib/db";
import {
  decryptApiKey,
  encryptApiKey,
  keyIdOf,
  readEncryptionKeyRing,
} from "@/lib/secrets";
import type { OwnerId } from "@/lib/types";

/** 保存する平文で、API キーの形をした値。 */
const PLAIN_API_KEY = "sk-ant-api03-plain-text-for-reencrypt-test";

/** 回転の前から使っている鍵の組。 */
const OLD_ENTRY = `k1:${randomBytes(32).toString("base64")}`;

/** 回転で足す鍵の組。 */
const NEW_ENTRY = `k2:${randomBytes(32).toString("base64")}`;

/** 回転の前の鍵の一覧。 */
const beforeRotation = readEncryptionKeyRing({
  TOIITO_API_KEY_ENCRYPTION_KEYS: OLD_ENTRY,
});

/** 回転の段 1 の後の、新しい鍵を先頭に置いて旧い鍵と並べた鍵の一覧。 */
const duringRotation = readEncryptionKeyRing({
  TOIITO_API_KEY_ENCRYPTION_KEYS: `${NEW_ENTRY},${OLD_ENTRY}`,
});

afterAll(async () => {
  await db.disconnect();
});

let owner: OwnerId;

beforeEach(async () => {
  owner = await createOwner();
  await db.saveModelSetting(owner, {
    model: null,
    encrypted_api_key: encryptApiKey(PLAIN_API_KEY, beforeRotation),
  });
});

describe("reencryptApiKeys", () => {
  it("旧い鍵の暗号文が新しい鍵の暗号文に置き換わり、復号した値は変わらない", async () => {
    const result = await reencryptApiKeys(duringRotation);
    const credentials = await db.getModelCredentials(owner);
    const stored = credentials?.encrypted_api_key ?? "";

    expect(result).toEqual({ reencrypted: 1, changedByUser: 0 });
    expect(keyIdOf(stored)).toBe("k2");
    expect(decryptApiKey(stored, duringRotation)).toBe(PLAIN_API_KEY);
  });

  it("新しい鍵の暗号文は書き換えない", async () => {
    const other = await createOwner("other@example.com");
    const encrypted = encryptApiKey("sk-ant-other", duringRotation);
    await db.saveModelSetting(other, {
      model: null,
      encrypted_api_key: encrypted,
    });

    const result = await reencryptApiKeys(duringRotation);
    const credentials = await db.getModelCredentials(other);

    expect(result.reencrypted).toBe(1);
    expect(credentials?.encrypted_api_key).toBe(encrypted);
  });

  it("鍵の一覧に旧い鍵が無ければ throw し、どの行も書き換えない", async () => {
    const before = await db.getModelCredentials(owner);
    const newOnly = readEncryptionKeyRing({
      TOIITO_API_KEY_ENCRYPTION_KEYS: NEW_ENTRY,
    });

    await expect(reencryptApiKeys(newOnly)).rejects.toThrow("k1");
    expect(await db.getModelCredentials(owner)).toEqual(before);
  });
});

describe("reportApiKeys", () => {
  it("旧い鍵の暗号文が残っていれば、その件数を出す", async () => {
    const report = await reportApiKeys(duringRotation);

    expect(report.remaining).toBe(1);
    expect(report.text).toContain("k1: 1 件");
    expect(report.text).toContain(
      "暗号化に使う鍵（k2）以外の鍵 ID の暗号文: 1 件",
    );
  });

  it("暗号化し直した後は、旧い鍵の暗号文の件数が 0 になる", async () => {
    await reencryptApiKeys(duringRotation);

    const report = await reportApiKeys(duringRotation);

    expect(report.remaining).toBe(0);
    expect(report.text).toContain("k2（暗号化に使う鍵）: 1 件");
    expect(report.text).toContain(
      "暗号化に使う鍵（k2）以外の鍵 ID の暗号文: 0 件",
    );
  });
});

describe("resolveKeysTarget", () => {
  it("適用先の接続先と鍵の一覧を、適用先ごとの変数から読む", () => {
    const target = resolveKeysTarget("prod", {
      DIRECT_URL_PROD: "postgresql://prod",
      TOIITO_API_KEY_ENCRYPTION_KEYS_PROD: NEW_ENTRY,
      TOIITO_API_KEY_ENCRYPTION_KEYS: OLD_ENTRY,
    });

    expect(target).toEqual({
      name: "prod",
      directUrl: "postgresql://prod",
      encryptionKeys: NEW_ENTRY,
    });
  });

  it("適用先の鍵の一覧の変数が無ければ、手元の鍵の一覧があっても throw する", () => {
    const resolve = () =>
      resolveKeysTarget("prod", {
        DIRECT_URL_PROD: "postgresql://prod",
        TOIITO_API_KEY_ENCRYPTION_KEYS: OLD_ENTRY,
      });

    expect(resolve).toThrow("TOIITO_API_KEY_ENCRYPTION_KEYS_PROD");
  });
});
