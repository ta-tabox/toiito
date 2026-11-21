/**
 * 選択肢から一つを選ぶ欄。
 * 見た目は入力欄（`Field`）と同じ `FIELD_STYLE` を持ち、フォーカスの有無で枠線と背景を変える。
 */

import { FIELD_STYLE } from "@/components/ui/field";

/** 選択肢から一つを選ぶ欄。 */
export function Select({
  className = "",
  ...props
}: React.ComponentProps<"select">) {
  return <select className={`${FIELD_STYLE} ${className}`} {...props} />;
}
