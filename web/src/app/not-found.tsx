/**
 * URL が指すものを出せないときの、日本語の一枚。
 *
 * 無い問いと、このアカウントから開けない問いを同じ文面にする。
 * 文面を分けると、URL の id を差し替えるだけで在ることが読める。
 */

import Link from "next/link";

/** 出せないものを指された画面。 */
export default function NotFoundPage() {
  return (
    <main className="mx-auto w-full max-w-reading flex-1 px-5 py-10">
      <Link href="/" className="text-aux text-ink-weak hover:underline">
        ← 問いの発酵槽
      </Link>

      <h1 className="mt-4 font-mincho text-question md:text-question-lg">
        ここには何も無い。
      </h1>
      <p className="mt-4 text-aux text-ink-weak">
        開こうとしたものは無いか、このアカウントからは開けない。
      </p>
    </main>
  );
}
