"use client";

/**
 * `app/` の配下のルートセグメントが描画中か Server Action で throw したとき、そのセグメントの代わりに描く画面。
 * 失敗したことを伝え、セグメントを取得し直す操作を出す。
 *
 * 例外の文面は開発者に向けた一文で、本番の Next は Server Component の例外の文面を伏せるので、画面には出さない。
 */

import Link from "next/link";
import { Button } from "@/components/ui/button";

/**
 * 失敗の知らせと、再読み込みのボタンを描く。
 * ボタンを押すと、`retry` がセグメントのデータを取得し直して描き直す。
 */
export default function ErrorPage({
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <main className="mx-auto w-full max-w-reading flex-1 px-5 py-10">
      <Link href="/" className="text-aux text-ink-weak hover:underline">
        ← 問いの発酵槽
      </Link>

      <p role="alert" className="mt-8 text-aux text-ink-weak">
        処理に失敗した。
      </p>
      <div className="mt-3">
        <Button type="button" onClick={retry}>
          再読み込み
        </Button>
      </div>
    </main>
  );
}
