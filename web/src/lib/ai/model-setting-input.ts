/**
 * 設定の画面のフォームの値から、`saveModelSetting` へ渡すモデルと暗号化した API キーを作る関数を置く。
 * 行の書き込みは持たず `db.ts` が、暗号化の方式は `secrets.ts` が持つ。
 *
 * 例: モデルの欄が `claude-opus-5` で API キーの欄が `sk-ant-…` なら、モデルと API キーの暗号文を返す。
 * モデルの欄が空なら既定のモデルへ戻す null を返し、API キーの欄が空なら保存済みの API キーを変えないよう暗号文を省く。
 */

import { isAnthropicModel } from "@/lib/ai/anthropic";
import { type EncryptionKeyRing, encryptApiKey } from "@/lib/secrets";
import type { ModelSettingInput } from "@/lib/types";

/** 設定の画面のフォームから受け取る、まだ検証していない値。 */
export type ModelSettingForm = {
  readonly model: string;
  readonly apiKey: string;
};

/**
 * フォームの値（`form`）を検証し、API キーがあれば `keys` で暗号化して、`saveModelSetting` へ渡す値を返す。
 * モデルの欄が空でなく `ANTHROPIC_MODELS` の値域の外なら throw する。
 *
 * API キーは前後の空白を除いてから暗号化するので、貼り付けで混じった改行が API キーの一部として保存されない。
 */
export function parseModelSettingForm(
  form: ModelSettingForm,
  keys: EncryptionKeyRing,
): ModelSettingInput {
  const model = form.model.trim();
  if (model && !isAnthropicModel(model)) {
    throw new Error(`選べるモデルの外の値: ${model}`);
  }

  const apiKey = form.apiKey.trim();
  if (!apiKey) {
    return { model: model || null };
  }

  return {
    model: model || null,
    encrypted_api_key: encryptApiKey(apiKey, keys),
  };
}
