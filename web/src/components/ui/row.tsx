/**
 * 一覧の一行。
 * 問いの一覧とメモの一覧が共有する（`.claude/rules/design.md`「部品の型」）。
 *
 * 行の中身は呼び出し側が組む。
 * 問いとメモで並べるものが違うので、`Row` が持つのは背景・枠線・余白だけにする。
 *
 * 行そのものがリンクなので、中へさらにリンクを置かない（入れ子のリンクは押し先が定まらない）。
 */

import Link from "next/link";
import type { ReactNode } from "react";

/**
 * 一覧の一行。
 * `<ul>` の直下へ置く。
 */
export function Row({ href, children }: { href: string; children: ReactNode }) {
  return (
    <li>
      <Link
        href={href}
        className="block rounded border border-rule bg-surface-low p-3 hover:border-moss md:p-4"
      >
        {children}
      </Link>
    </li>
  );
}
