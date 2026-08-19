/**
 * メモの一覧と、そこから出所の発話への逆引き。
 *
 * 引くのは listMemosWithContext 一本。
 * 行ごとに問いやセッションを引き直さない。
 *
 * 各行のリンク先は `/q/<question_id>#msg-<message_id>`。
 * ジャンプはこの画面だけでは完結せず、三箇所が同じ綴りを共有して初めて成立する。
 * URL を書くのがここ、飛び先の `id="msg-…"` を発話へ付けるのが `q/[id]/page.tsx`、飛んだ先でその発話を目立たせるのが globals.css の `[id^="msg-"]:target`。
 * 綴りを変えるときは三箇所とも直す。
 *
 * 強調は CSS だけで足りるので、この画面に JS は足さない。
 */

import Link from "next/link";
import { excerptParts } from "@/lib/anchors";
import { listMemosWithContext } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * 引用でアンカーの前後へ添える文字数。
 * どの発話だったか思い出せる程度に留める。
 */
const EXCERPT_MARGIN = 40;

/**
 * メモの一覧。
 * 新しい順に並べ、各行から出所の発話へ逆引きする。
 */
export default async function MemosPage() {
  const memos = await listMemosWithContext();

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-10">
      <Link href="/" className="text-sm text-neutral-500 hover:underline">
        ← コンポスター
      </Link>

      <h1 className="mt-4 text-2xl font-bold tracking-wide">
        メモ{" "}
        <span className="text-sm font-normal text-neutral-500">
          引っかかった語から、その対話へ
        </span>
      </h1>

      <ul className="mt-8 space-y-3">
        {memos.map((memo) => {
          const quote = excerptParts(
            memo.message_body,
            memo.anchor_start,
            memo.anchor_end,
            EXCERPT_MARGIN,
          );

          return (
            <li key={memo.id}>
              <Link
                href={`/q/${memo.question_id}#msg-${memo.message_id}`}
                className="block rounded border border-neutral-200 p-4 hover:border-neutral-400"
              >
                <div className="text-base font-bold">{memo.keyword}</div>

                {memo.note && <div className="mt-1 text-sm">{memo.note}</div>}

                <div className="mt-2 whitespace-pre-wrap border-l-2 border-neutral-300 pl-3 text-sm text-neutral-500">
                  {quote.before}
                  <mark className="bg-amber-100 font-bold text-neutral-800">
                    {quote.anchor}
                  </mark>
                  {quote.after}
                </div>

                <div className="mt-2 text-xs text-neutral-500">
                  {memo.question_body}
                </div>
              </Link>
            </li>
          );
        })}

        {memos.length === 0 && (
          <li className="text-sm text-neutral-500">
            まだメモがない。対話の中で引っかかった語に印を付けるところから。
          </li>
        )}
      </ul>
    </main>
  );
}
