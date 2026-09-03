"use client";

/**
 * 発話フォーム。
 * 送信中であることを画面に見せるためだけの client component。
 *
 * 持つのは表示だけで、入力の検証も送信先の決定も引き受けない。
 * Server Action は bind 済みのものを呼び出し側から受け取る。
 */

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { TextArea } from "@/components/ui/field";

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
        placeholder="問いについて、いま思うことを"
      />
      <SubmitButton />
    </form>
  );
}

/**
 * 送信ボタン。
 *
 * 応答を待つ間は押せなくなり、ラベルが「二体が応答中」の表示へ変わる。
 * useFormStatus は親フォームの状態を読むので、form を描く側と同じコンポーネントには置けない（常に pending: false が返る）。
 */
function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" tone="solid" disabled={pending} className="self-end">
      {pending ? <RespondingLabel /> : "発話する（二体が応答するまで少し待つ）"}
    </Button>
  );
}

/**
 * 応答待ちのラベル。
 *
 * 三つの点が順に明滅して、止まっているのではないことを示す。
 * 進み具合は出さない（DESIGN.md「やらないこと」の進捗インジケータに当たる）。
 * 点は読み上げから外す（文字の「…」と違い、鳴らしても意味にならない）。
 * 正の値だと最初の一巡が揃って光り、波に見え始めるまで待たせることになるので、animation-delay を負にして位相をずらす。
 * 動きを切っている人には点だけが静かに並ぶ（DESIGN.md「動き」）。
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
