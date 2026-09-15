/**
 * どのルートにも当たらない URL と、`notFound()` を呼んだ画面で描く画面。
 */

import Link from "next/link";

/** ページが見つからないことを伝え、問いの一覧へのリンクを描く。 */
export default function NotFoundPage() {
  return (
    <main className="mx-auto w-full max-w-reading flex-1 px-5 py-10">
      <Link href="/" className="text-aux text-ink-weak hover:underline">
        ← 問いの発酵槽
      </Link>

      <p className="mt-8 text-aux text-ink-weak">ページが見つからない。</p>
    </main>
  );
}
