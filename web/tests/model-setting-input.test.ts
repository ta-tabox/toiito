/**
 * 設定の画面のフォームの値から、保存するモデルと暗号化した API キーを作る写像の検査。
 */

import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { ANTHROPIC_MODELS } from "@/lib/ai/anthropic";
import { parseModelSettingForm } from "@/lib/ai/model-setting-input";
import { decryptApiKey, readEncryptionKeyRing } from "@/lib/secrets";

/** テストの中だけで使う暗号化の鍵の一覧。 */
const keys = readEncryptionKeyRing({
  TOIITO_API_KEY_ENCRYPTION_KEYS: `test:${randomBytes(32).toString("base64")}`,
});

describe("parseModelSettingForm", () => {
  it("選んだモデルと、前後の空白を除いて暗号化した API キーを返す", () => {
    const input = parseModelSettingForm(
      { model: ANTHROPIC_MODELS.opus5, apiKey: "  sk-ant-pasted\n" },
      keys,
    );

    expect(input.model).toBe(ANTHROPIC_MODELS.opus5);
    expect(decryptApiKey(input.encrypted_api_key ?? "", keys)).toBe(
      "sk-ant-pasted",
    );
  });

  it("API キーの欄が空なら、暗号文を持たない値を返す", () => {
    const input = parseModelSettingForm(
      { model: ANTHROPIC_MODELS.haiku45, apiKey: "   " },
      keys,
    );

    expect(input).toEqual({ model: ANTHROPIC_MODELS.haiku45 });
  });

  it("モデルの欄が空なら、既定のモデルへ戻す null を返す", () => {
    const input = parseModelSettingForm({ model: "", apiKey: "" }, keys);

    expect(input).toEqual({ model: null });
  });

  it("モデルの欄が選べるモデルの外なら throw する", () => {
    const parse = () =>
      parseModelSettingForm({ model: "claude-unknown", apiKey: "" }, keys);

    expect(parse).toThrow("claude-unknown");
  });
});
