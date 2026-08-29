"use client";

/**
 * メモ一件を拡大表示するモーダルの外枠。
 *
 * 引き受けるのは開閉だけで、中身は呼び出し側（/memos）が組んで渡す。
 * 開いているかどうかの正は URL のクエリ（`?memo=<id>`）で、このコンポーネントは state を持たない。
 * 対話画面の下線から特定のメモを開く経路があり、そこから指せる口が URL しか無いため。
 *
 * `<dialog>` を使うのは Esc・背景の不活性化・フォーカスの閉じ込めを自前で書かないため。
 * 閉じる手段は Esc と閉じるボタンの二つ。
 * 背景を押して閉じる形は入れない。
 * `<dialog>` の背景は擬似要素で単独では押せず、dialog 自身の click を見る形になるので、キーボードから届かない操作が一つ増える。
 */

import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useRef } from "react";

/**
 * メモの拡大表示。
 * 閉じるとクエリの無い一覧へ戻る。
 */
export function MemoDialog({ children }: { children: ReactNode }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const router = useRouter();

  // showModal は属性でなく命令でしか開けないので、mount してから呼ぶ。
  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  return (
    <dialog
      ref={dialogRef}
      onClose={() => router.replace("/memos")}
      className="m-auto w-full max-w-xl rounded border border-neutral-300 p-0 backdrop:bg-neutral-900/40"
    >
      <div className="p-6">
        {children}

        {/* method="dialog" の submit は JS を挟まずに閉じる。 */}
        <form method="dialog" className="mt-6 flex justify-end">
          <button
            type="submit"
            className="rounded px-3 py-1 text-sm text-neutral-500 hover:underline"
          >
            閉じる
          </button>
        </form>
      </div>
    </dialog>
  );
}
