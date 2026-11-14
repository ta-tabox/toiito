"use client";

/**
 * 問いに AI が寄せた材料を付ける操作のフォームを置く。
 * 付与を待つあいだは送信ボタンが押せなくなり、付かなかったときはその操作の応答として知らせを出す。
 *
 * 付与の実行と保存は持たず、呼び出し側が渡す Server Action が持つ。
 */

import { useActionState } from "react";
import { SubmitButton } from "@/components/ui/submit-button";

/**
 * 直前の付与の結果。
 * まだ一度も送っていなければ undefined。
 */
export type MaterialFormState = { readonly ok: boolean } | undefined;

/**
 * 材料を付けるボタンを描き、押されたら `action` を呼ぶ。
 * `action` が `ok: false` を返したら、付かなかったことを知らせる一文を出す。
 */
export function MaterialForm({
  action,
}: {
  action: (
    state: MaterialFormState,
    formData: FormData,
  ) => Promise<MaterialFormState>;
}) {
  const [state, formAction] = useActionState(action, undefined);

  return (
    <form action={formAction} className="flex flex-col items-start gap-2">
      <SubmitButton pendingLabel="培地を付けている（検索に少し時間がかかる）">
        培地を付ける
      </SubmitButton>
      {state?.ok === false && (
        <p role="alert" className="text-aux text-ink-weak">
          培地を付けられなかった。もう一度押すと、やり直せる。
        </p>
      )}
    </form>
  );
}
