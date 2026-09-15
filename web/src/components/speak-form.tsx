"use client";

/**
 * 新しい発話を送る `SpeakForm` と、送信に失敗した発話を再送する `RetryForm` を持つ。
 * どちらも、応答を待つあいだは送信ボタンが押せなくなり、ラベルが「二体が応答中」の表示へ変わる。
 *
 * 入力の検証も送信先の決定も行わない。
 * Server Action は bind 済みのものを引数で受け取る。
 */

import { TextArea } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { MESSAGE_BODY_MAX_LENGTH } from "@/lib/message";

/** 対話へ発話を送るフォーム。 */
export function SpeakForm({
  action,
}: {
  action: (formData: FormData) => Promise<void>;
}) {
  return (
    <form action={action} className="mt-8 flex flex-col gap-2">
      <TextArea
        name="body"
        rows={3}
        maxLength={MESSAGE_BODY_MAX_LENGTH}
        placeholder="問いについて、いま思うことを"
      />
      <SubmitButton
        tone="solid"
        className="self-end"
        pendingLabel={<RespondingLabel />}
      >
        発話する（二体が応答するまで少し待つ）
      </SubmitButton>
    </form>
  );
}

/**
 * `pending_messages` に残っている発話の再送フォーム。
 *
 * 送る本文は `pending_messages` が持っているので、入力欄を出さない。
 * `SpeakForm` と同時に表示されるので、ボタンを `tone="quiet"` で薄くして主要な操作を一つに保つ。
 */
export function RetryForm({ action }: { action: () => Promise<void> }) {
  return (
    <form action={action} className="mt-3 flex flex-col">
      <SubmitButton
        tone="quiet"
        className="self-end"
        pendingLabel={<RespondingLabel />}
      >
        再送
      </SubmitButton>
    </form>
  );
}

/**
 * 応答待ちのラベル。
 * 三つの点が順に明滅して、止まっているのではないことを示す。
 *
 * 進み具合は出さず、点は読み上げから外す（`.claude/rules/design.md`「やらないこと」「動き」）。
 * `animation-delay` を負にするのは、正の値だと最初の一巡が揃って光り、波に見え始めるまで待たせるため。
 */
function RespondingLabel() {
  return (
    <span className="inline-flex items-center gap-2">
      二体が応答中
      <span className="inline-flex gap-1" aria-hidden="true">
        <span className="size-1.5 rounded-full bg-current motion-safe:animate-pulse" />
        <span className="size-1.5 rounded-full bg-current motion-safe:animate-pulse [animation-delay:-0.66s]" />
        <span className="size-1.5 rounded-full bg-current motion-safe:animate-pulse [animation-delay:-1.33s]" />
      </span>
    </span>
  );
}
