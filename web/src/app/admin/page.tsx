/**
 * 管理の画面で、ユーザーの一覧とユーザーごとの問いとセッションの数を表で描くページを置く。
 * 管理者かどうかの判定は持たず、`requireAdmin` が持つ。
 */

import Link from "next/link";
import { requireAdmin } from "@/lib/auth/current-user";
import { listUsersForAdmin } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * 管理の画面。
 * ユーザーごとの問いの数とセッションの数を表で描く。
 */
export default async function AdminPage() {
  await requireAdmin();
  const users = await listUsersForAdmin();

  return (
    <main className="mx-auto w-full max-w-reading flex-1 px-5 py-10">
      <Link href="/" className="text-aux text-ink-weak hover:underline">
        ← 問いの発酵槽
      </Link>

      <h1 className="mt-4 font-mincho text-question md:text-question-lg">
        利用者{" "}
        <span className="font-gothic text-aux text-ink-weak">
          問いとセッションの数
        </span>
      </h1>

      <div className="mt-8 overflow-x-auto">
        <table className="w-full text-aux">
          <thead className="text-meta text-ink-weak">
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
            </tr>
          </thead>

          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="border-rule border-b">
                <td className="px-2 py-2">{user.name}</td>
                <td className="break-all px-2 py-2">{user.email}</td>
                <td className="px-2 py-2 text-right tabular-nums">
                  {user.question_count}
                </td>
                <td className="px-2 py-2 text-right tabular-nums">
                  {user.session_count}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
