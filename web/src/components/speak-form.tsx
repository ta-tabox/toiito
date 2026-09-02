"use client";

/**
 * 一往復を起こす二つのフォーム——新しい発話と、成立しなかった発話の再送。
 * 送信中であることを画面に見せるためだけの client component。
 *
 * 持つのは表示だけで、入力の検証も送信先の決定も引き受けない。
 * Server Action は bind 済みのものを呼び出し側から受け取る。
 */

import { useFormStatus } from "react-dom";
import { MESSAGE_BODY_MAX_LENGTH } from "@/lib/message";

/** 対話へ発話を送るフォーム。 */
export function SpeakForm({
  action,
}: {
  action: (formData: FormData) => Promise<void>;
}) {
  return (
    <form action={action} className="mt-8 flex flex-col gap-2">
      <textarea
        name="body"
        rows={3}
        maxLength={MESSAGE_BODY_MAX_LENGTH}
        placeholder="問いについて、いま思うことを"
        className="w-full rounded border border-neutral-300 px-3 py-2"
      />
      <SubmitButton label="発話する（二体が応答するまで少し待つ）" />
    </form>
  );
}

/**
 * 預かってある発話をもう一度送るフォーム。
 *
 * 本文は預かりの側が持っているので、送るものを画面から受け取らない。
 * 打ち直させないことがこのフォームの用件で、入力欄を出すとそれを裏切る。
 */
export function RetryForm({ action }: { action: () => Promise<void> }) {
  return (
    <form action={action} className="mt-3 flex flex-col">
      <SubmitButton label="もう一度試す" />
    </form>
  );
}

/**
 * 送信ボタン。
 *
 * 応答を待つ間は押せなくなり、ラベルが「二体が応答中」の表示へ変わる。
 * useFormStatus は親フォームの状態を読むので、form を描く側と同じコンポーネントには置けない（常に pending: false が返る）。
 */
function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="self-end rounded bg-neutral-800 px-4 py-2 text-white hover:bg-neutral-700 disabled:bg-neutral-400 disabled:hover:bg-neutral-400"
    >
      {pending ? <RespondingLabel /> : label}
    </button>
  );
}

/**
 * 応答待ちのラベル。
 *
 * 三つの点が順に明滅して、止まっているのではないことを示す。
 * 点は読み上げから外す（文字の「…」と違い、鳴らしても意味にならない）。
 * 正の値だと最初の一巡が揃って光り、波に見え始めるまで待たせることになるので、animation-delay を負にして位相をずらす。
 */
function RespondingLabel() {
  return (
    <span className="inline-flex items-center gap-1.5">
      二体が応答中
      <span className="inline-flex gap-1" aria-hidden="true">
        <span className="size-1.5 animate-pulse rounded-full bg-current" />
        <span className="size-1.5 animate-pulse rounded-full bg-current [animation-delay:-0.66s]" />
        <span className="size-1.5 animate-pulse rounded-full bg-current [animation-delay:-1.33s]" />
      </span>
    </span>
  );
}
