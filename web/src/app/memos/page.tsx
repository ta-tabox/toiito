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
import { Row } from "@/components/ui/row";
import { excerptParts } from "@/lib/anchors";
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
 * 印の付いた区間の装飾。
 *
 * 面でなく線で出すのは、彩度を持つ面を人間の発話の一つに留めるため（DESIGN.md「彩度の規律」）。
 * `<mark>` の既定は黄色い面なので、背景を透かして下線へ置き換える。
 */
const MARKED_STYLE =
  "bg-transparent font-bold text-ink underline decoration-mark decoration-2 underline-offset-4";

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
  const memos = await listMemosWithContext();
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
    <main className="mx-auto w-full max-w-reading flex-1 px-5 py-10">
      <Link href="/" className="text-aux text-ink-weak hover:underline">
        ← 問いの発酵槽
      </Link>

      <h1 className="mt-4 font-mincho text-question md:text-question-lg">
        メモ{" "}
        <span className="font-gothic text-aux text-ink-weak">
          引っかかった語から、その対話へ
        </span>
      </h1>

      <ul className="mt-8 space-y-4">
        {memos.map((memo) => {
          const quote = excerptParts(
            memo.message_body,
            memo.anchor_start,
            memo.anchor_end,
            EXCERPT_MARGIN,
          );

          return (
            <Row key={memo.id} href={`/memos?memo=${memo.id}`}>
              <div className="font-bold text-utterance">{memo.keyword}</div>

              {memo.note && (
                <div className="mt-2 text-aux text-ink">{memo.note}</div>
              )}

              <div className="mt-2 whitespace-pre-wrap border-rule border-l-2 pl-3 text-aux text-ink-weak">
                {quote.before}
                <mark className={MARKED_STYLE}>{quote.anchor}</mark>
                {quote.after}
              </div>

              <div className="mt-2 text-meta text-ink-weak">
                {memo.question_body}
              </div>
            </Row>
          );
        })}

        {memos.length === 0 && (
          <li className="text-aux text-ink-weak">
            まだメモがない。対話の中で引っかかった語に印を付けるところから。
          </li>
        )}
      </ul>

      {opened && (
        <MemoDialog>
          <h2 className="font-mincho text-question">{opened.keyword}</h2>

          {opened.note && (
            <p className="mt-2 text-aux text-ink">{opened.note}</p>
          )}

          <div className="mt-4 max-h-64 overflow-y-auto whitespace-pre-wrap border-rule border-l-2 pl-3 text-aux text-ink-weak">
            {openedQuote?.before}
            <mark className={MARKED_STYLE}>{openedQuote?.anchor}</mark>
            {openedQuote?.after}
          </div>

          <p className="mt-4 text-meta text-ink-weak">{opened.question_body}</p>

          <Link
            href={`/q/${opened.question_id}?s=${opened.session_id}#msg-${opened.message_id}`}
            className="mt-4 inline-block text-aux text-ink-weak hover:underline"
          >
            この発話へ →
          </Link>
        </MemoDialog>
      )}
    </main>
  );
}
