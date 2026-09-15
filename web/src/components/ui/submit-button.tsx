"use client";

/**
 * フォームの送信ボタン。
 * 親の `form` が送信しているあいだは押せなくなり、ラベルを送信中のものへ替える。
 *
 * 送信中のラベルは呼び出し側が渡し、`SubmitButton` は文言を持たない。
 * 見た目は `Button` がそのまま持つ。
 */

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";

/**
 * 送信ボタン。
 * 親の `form` が送信中なら `pendingLabel` を出して押せなくなり、そうでなければ `children` を出す。
 *
 * `useFormStatus` は親フォームの状態を読むので、`form` を描くコンポーネントの中で直に呼ぶと常に `pending: false` が返る。
 */
export function SubmitButton({
  pendingLabel,
  children,
  ...props
}: { pendingLabel: ReactNode } & Omit<
  React.ComponentProps<typeof Button>,
  "type" | "disabled"
>) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending} {...props}>
      {pending ? pendingLabel : children}
    </Button>
  );
}
