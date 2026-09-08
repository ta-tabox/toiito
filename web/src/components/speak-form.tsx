"use client";

/**
 * 新しい発話を送る `SpeakForm` と、送信に失敗した発話を再送する `RetryForm` を持つ。
 * 送信中であることを画面へ表示するための client component。
 *
 * 入力の検証も送信先の決定も行わない。
 * Server Action は bind 済みのものを引数で受け取る。
 */

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { TextArea } from "@/components/ui/field";
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
      <SubmitButton label="発話する（二体が応答するまで少し待つ）" />
    </form>
  );
}

/**
 * `pending_messages` に残っている発話の再送フォーム。
 *
 * 送る本文は `pending_messages` が持っているので、入力欄を出さない。
 */
export function RetryForm({ action }: { action: () => Promise<void> }) {
  return (
    <form action={action} className="mt-3 flex flex-col">
      <SubmitButton label="再送" tone="quiet" />
    </form>
  );
}

/**
 * 送信ボタン。
 * 応答を待つ間は押せなくなり、ラベルが「二体が応答中」の表示へ変わる。
 *
 * `useFormStatus` は親フォームの状態を読むので、`form` を描くコンポーネントには置けない（常に `pending: false` が返る）。
 * `RetryForm` と `SpeakForm` は同時に表示されるので、`RetryForm` を `tone="quiet"` で薄くして主要な操作を一つに保つ。
 */
function SubmitButton({
  label,
  tone = "solid",
}: {
  label: string;
  tone?: "solid" | "quiet";
}) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" tone={tone} disabled={pending} className="self-end">
      {pending ? <RespondingLabel /> : label}
    </Button>
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
