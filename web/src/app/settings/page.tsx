/**
 * 現在の利用者が、AI を呼ぶときのモデルと自分の API キーを設定するページを置く。
 * フォームの値の検証と暗号化は持たず、`saveModelSettingAction` の先の `parseModelSettingForm` が持つ。
 *
 * API キーは登録済みかどうかだけを描き、平文も暗号文もその一部も HTML に出さない。
 * API キーの入力欄は保存のたびに空で描き、空のまま保存すると保存済みの API キーを変えない。
 */

import Link from "next/link";
import { deleteApiKeyAction, saveModelSettingAction } from "@/app/actions";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
import { ANTHROPIC_MODELS } from "@/lib/ai/anthropic";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { getModelSettingSummary } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * 設定の画面。
 * モデルの選択と API キーの登録・差し替えを一つのフォームで受け、登録済みの API キーの削除を別のフォームで受ける。
 */
export default async function SettingsPage() {
  const { id: owner } = await requireCurrentUser();
  const summary = await getModelSettingSummary(owner);

  return (
    <main className="mx-auto w-full max-w-reading flex-1 px-5 py-10">
      <Link href="/" className="text-aux text-ink-weak hover:underline">
        ← 問いの発酵槽
      </Link>

      <h1 className="mt-4 font-mincho text-question md:text-question-lg">
        設定{" "}
        <span className="font-gothic text-aux text-ink-weak">
          AI のモデルと API キー
        </span>
      </h1>

      <form action={saveModelSettingAction} className="mt-8 space-y-6">
        <div>
          <label htmlFor="model" className="text-aux text-ink-weak">
            モデル
          </label>
          <Select
            id="model"
            name="model"
            defaultValue={summary.model ?? ""}
            className="mt-2"
          >
            <option value="">既定のモデル</option>
            {Object.values(ANTHROPIC_MODELS).map((model) => (
              <option key={model} value={model}>
                {model}
              </option>
            ))}
          </Select>
        </div>

        <div>
          <label htmlFor="api_key" className="text-aux text-ink-weak">
            API キー（
            <span data-api-key-status>
              {summary.has_api_key ? "登録済み" : "未登録"}
            </span>
            ）
          </label>
          <Field
            id="api_key"
            name="api_key"
            type="password"
            autoComplete="off"
            placeholder={
              summary.has_api_key ? "差し替えるときだけ入力" : "sk-ant-…"
            }
            className="mt-2"
          />
        </div>

        {!summary.has_api_key && (
          <p className="text-aux text-ink-weak">
            API キーを登録するまで、選んだモデルは使われず既定のモデルで動く。
          </p>
        )}

        <SubmitButton tone="solid" pendingLabel="保存している">
          保存する
        </SubmitButton>
      </form>

      {summary.has_api_key && (
        <form action={deleteApiKeyAction} className="mt-8">
          <SubmitButton pendingLabel="削除している">
            API キーを削除する
          </SubmitButton>
        </form>
      )}
    </main>
  );
}
