/**
 * 問いの `status` を、人間が選べる値の中から選び直す部品を置く。
 * 選んだ値の検査と書き込みは持たず、呼び出し側が渡す Server Action が持つ。
 *
 * 選ぶボタンは閉じた `details` の中に置き、開くまでは現在の値のピルだけを出す。
 * 対話を読み返しているあいだ、値を選ぶ操作が本文と並んで目に入らないようにするため。
 */

import { Pill } from "@/components/ui/pill";
import { type QuestionStatus, SELECTABLE_STATUSES } from "@/lib/question";

/**
 * 現在の `status` のピルと、人間が選べる値ごとの送信ボタンを描く。
 * 押したボタンの値を、フォームの `status` として `action` へ送る。
 */
export function StatusForm({
  status,
  action,
}: {
  status: QuestionStatus;
  action: (formData: FormData) => Promise<void>;
}) {
  return (
    <details className="text-meta text-ink-weak">
      <summary className="cursor-pointer">
        <Pill status={status} />
        <span className="ml-2">状態を選ぶ</span>
      </summary>
      <form action={action} className="mt-2 flex flex-wrap gap-2">
        {SELECTABLE_STATUSES.map((candidate) => (
          <button
            key={candidate}
            type="submit"
            name="status"
            value={candidate}
            aria-current={candidate === status ? "true" : undefined}
            className="rounded-full outline-rule hover:outline aria-[current]:font-bold"
          >
            <Pill status={candidate} />
          </button>
        ))}
      </form>
    </details>
  );
}
