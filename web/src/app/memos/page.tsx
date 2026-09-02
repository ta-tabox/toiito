/**
 * メモの一覧と、そこから出所の発話への逆引き。
 *
 * 引くのは listMemosWithContext 一本。
 * 行ごとに問いやセッションを引き直さない。
 *
 * 各行を押すとメモ一件が `?memo=<id>` で拡大表示される。
 * 開いているメモを URL で持つのは、対話画面の下線から特定のメモを名指しで開く経路があるため。
 * client の state に持つと、そこから指せる口が無くなる。
 *
 * 出所の発話への逆引き（`/q/<question_id>?s=<session_id>#msg-<message_id>`）は拡大表示の中に置く。
 * セッションを名指しするのは、再訪で最新が入れ替わってもメモを付けた当時の発話へ着地させるため。
 * 落とすと問いの画面には飛ぶが、着地先が DOM に無く、何も起きずに終わる。
 * ジャンプはこの画面だけでは完結せず、三箇所が同じ書式を共有して初めて成立する。
 * URL を書くのがここ、飛び先の `id="msg-…"` を発話へ付けるのが `q/[id]/page.tsx`、飛んだ先でその発話を光らせるのが `landing-mark.tsx`。
 * 書式を変えるときは三箇所とも直す。
 */

import Link from "next/link";
import { MemoDialog } from "@/components/memo-dialog";
import { excerptParts } from "@/lib/anchors";
import { getCurrentUser } from "@/lib/current-user";
import { listMemosWithContext } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * 引用でアンカーの前後へ添える文字数。
 * どの発話だったか思い出せる程度に留める。
 */
const EXCERPT_MARGIN = 40;

/**
 * 拡大表示で前後へ添える文字数。
 * 一覧より広く取り、前後の流れごと読み返せるようにする。
 */
const DIALOG_EXCERPT_MARGIN = 200;

/**
 * メモの一覧。
 * 新しい順に並べ、各行から出所の発話へ逆引きする。
 */
export default async function MemosPage({
  searchParams,
}: {
  searchParams: Promise<{ memo?: string }>;
}) {
  const { memo: openedId } = await searchParams;
  const memos = await listMemosWithContext((await getCurrentUser()).id);
  const opened = memos.find((memo) => memo.id === openedId);
  const openedQuote =
    opened &&
    excerptParts(
      opened.message_body,
      opened.anchor_start,
      opened.anchor_end,
      DIALOG_EXCERPT_MARGIN,
    );

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
                href={`/memos?memo=${memo.id}`}
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

      {opened && (
        <MemoDialog>
          <h2 className="text-xl font-bold leading-relaxed">
            {opened.keyword}
          </h2>

          {opened.note && <p className="mt-2 text-sm">{opened.note}</p>}

          <div className="mt-4 max-h-64 overflow-y-auto whitespace-pre-wrap border-l-2 border-neutral-300 pl-3 text-sm text-neutral-500">
            {openedQuote?.before}
            <mark className="bg-amber-100 font-bold text-neutral-800">
              {openedQuote?.anchor}
            </mark>
            {openedQuote?.after}
          </div>

          <p className="mt-4 text-xs text-neutral-500">
            {opened.question_body}
          </p>

          <Link
            href={`/q/${opened.question_id}?s=${opened.session_id}#msg-${opened.message_id}`}
            className="mt-2 inline-block text-sm text-neutral-500 hover:underline"
          >
            この発話へ →
          </Link>
        </MemoDialog>
      )}
    </main>
  );
}
