"use client";

/**
 * `app/` の配下の画面が throw した例外を受けて出す、日本語の一枚。
 *
 * 例外の文面は開発者に向けた一文で、本番の Next は Server Component の例外の文面を伏せるので、画面には出さない。
 * ルートの `layout.tsx` が throw した例外は受けない（Next の `global-error.tsx` の担当で、置いていない）。
 */

import Link from "next/link";
import { Button } from "@/components/ui/button";

/**
 * 例外を受けた画面。
 * 「読み直す」を押すと、`retry` が画面のデータを取得し直して描き直す。
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

      <h1 className="mt-4 font-mincho text-question md:text-question-lg">
        この操作は終わらなかった。
      </h1>
      <p className="mt-4 text-aux text-ink-weak">
        画面が古くなっていたか、サーバーで問題が起きた。読み直すと、いまの状態を表示する。
      </p>

      <div className="mt-8">
        <Button type="button" tone="solid" onClick={retry}>
          読み直す
        </Button>
      </div>
    </main>
  );
}
