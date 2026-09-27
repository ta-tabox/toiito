/**
 * 管理の画面で、ユーザーの一覧と、ユーザーごとの問いとセッションの数と直近の AI の利用量を表で描くページを置く。
 * 管理者かどうかの判定は持たず、`requireAdmin` が持つ。
 */

import Link from "next/link";
import { Fragment } from "react";
import { requireAdmin } from "@/lib/auth/current-user";
import { listUsersForAdmin, summarizeUsage } from "@/lib/db";
import type { ApiKeySource } from "@/lib/usage";
import { USAGE_WINDOW_DAYS, usageWindowStartOf } from "@/lib/usage-window";

export const dynamic = "force-dynamic";

/** 利用量の行に出す、API キーの出所の見出し。 */
const KEY_SOURCE_LABELS: Record<ApiKeySource, string> = {
  system: "運営",
  user: "利用者",
};

/**
 * 管理の画面。
 * ユーザーごとの問いの数とセッションの数と、直近 `USAGE_WINDOW_DAYS` 日の AI の利用量を、キーの出所ごとの行に分けて表で描く。
 */
export default async function AdminPage() {
  await requireAdmin();
  const users = await listUsersForAdmin();
  const summaries = await summarizeUsage(usageWindowStartOf(new Date()));

  return (
    <main className="mx-auto w-full max-w-reading flex-1 px-5 py-10">
      <Link href="/" className="text-aux text-ink-weak hover:underline">
        ← 問いの発酵槽
      </Link>

      <h1 className="mt-4 font-mincho text-question md:text-question-lg">
        利用者{" "}
        <span className="font-gothic text-aux text-ink-weak">
          問いとセッションの数・直近 {USAGE_WINDOW_DAYS} 日の AI の利用量
        </span>
      </h1>

      <div className="mt-8 overflow-x-auto">
        <table className="w-full text-aux">
          <thead className="whitespace-nowrap text-meta text-ink-weak">
            <tr className="border-rule border-b">
              <th scope="col" className="px-2 py-2 text-left font-normal">
                名前
              </th>
              <th scope="col" className="px-2 py-2 text-left font-normal">
                メール
              </th>
              <th scope="col" className="px-2 py-2 text-right font-normal">
                問い
              </th>
              <th scope="col" className="px-2 py-2 text-right font-normal">
                セッション
              </th>
              <th scope="col" className="px-2 py-2 text-left font-normal">
                キー
              </th>
              <th scope="col" className="px-2 py-2 text-right font-normal">
                呼び出し
              </th>
              <th scope="col" className="px-2 py-2 text-right font-normal">
                入力トークン
              </th>
              <th scope="col" className="px-2 py-2 text-right font-normal">
                出力トークン
              </th>
              <th scope="col" className="px-2 py-2 text-right font-normal">
                web 検索
              </th>
            </tr>
          </thead>

          <tbody>
            {users.map((user) => {
              const usages = summaries.filter(
                (summary) => summary.user_id === user.id,
              );
              const rowSpan = Math.max(usages.length, 1);
              const userCells = (
                <>
                  <td
                    rowSpan={rowSpan}
                    className="whitespace-nowrap px-2 py-2 align-top"
                  >
                    {user.name}
                  </td>
                  <td
                    rowSpan={rowSpan}
                    className="break-all px-2 py-2 align-top"
                  >
                    {user.email}
                  </td>
                  <td
                    rowSpan={rowSpan}
                    className="px-2 py-2 text-right align-top tabular-nums"
                  >
                    {user.question_count}
                  </td>
                  <td
                    rowSpan={rowSpan}
                    className="px-2 py-2 text-right align-top tabular-nums"
                  >
                    {user.session_count}
                  </td>
                </>
              );

              if (usages.length === 0) {
                return (
                  <tr key={user.id} className="border-rule border-b">
                    {userCells}
                    <td colSpan={5} className="px-2 py-2 text-ink-weak">
                      利用なし
                    </td>
                  </tr>
                );
              }

              return (
                <Fragment key={user.id}>
                  {usages.map((usage, index) => (
                    <tr
                      key={usage.key_source}
                      className={
                        index === usages.length - 1
                          ? "border-rule border-b"
                          : undefined
                      }
                    >
                      {index === 0 ? userCells : null}
                      <td className="whitespace-nowrap px-2 py-2">
                        {KEY_SOURCE_LABELS[usage.key_source]}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">
                        {usage.call_count.toLocaleString("ja-JP")}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">
                        {usage.input_tokens.toLocaleString("ja-JP")}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">
                        {usage.output_tokens.toLocaleString("ja-JP")}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">
                        {usage.web_search_count.toLocaleString("ja-JP")}
                      </td>
                    </tr>
                  ))}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </main>
  );
}
