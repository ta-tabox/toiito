/**
 * 発酵槽の入口画面。
 * 問いの投入フォームと、投入済みの問いの一覧。
 *
 * 表示に要る整形だけを持ち、状態遷移や絞り込みは lib 側へ置く。
 * 状態のラベルと開／閉の描き分けは Pill が持つ。
 */

import Link from "next/link";
import { createQuestionAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Pill } from "@/components/ui/pill";
import { Row } from "@/components/ui/row";
import { listQuestions, questionText } from "@/lib/db";
import { formatTimestamp } from "@/lib/format";

export const dynamic = "force-dynamic";

/**
 * 発酵槽の入口。
 * 投入フォームと問いの一覧。
 */
export default async function Home() {
  const questions = await listQuestions();

  return (
    <main className="mx-auto w-full max-w-reading flex-1 px-5 py-10">
      <h1 className="font-mincho text-question md:text-question-lg">
        toiito{" "}
        <span className="font-gothic text-aux text-ink-weak">問いの発酵槽</span>
      </h1>

      <Link
        href="/memos"
        className="mt-2 inline-block text-aux text-ink-weak hover:underline"
      >
        メモ一覧 →
      </Link>

      <form action={createQuestionAction} className="mt-8 flex gap-2">
        <Field
          name="body"
          placeholder="問いをポイっと"
          className="flex-1"
          autoComplete="off"
        />
        <Button type="submit" tone="solid">
          仕込む
        </Button>
      </form>

      <ul className="mt-8 space-y-4">
        {questions.map((q) => (
          <Row key={q.id} href={`/q/${q.id}`}>
            <div className="font-mincho text-question">{questionText(q)}</div>
            {q.current_form && (
              <div className="mt-2 text-meta text-ink-weak">原型: {q.body}</div>
            )}
            <div className="mt-2 flex items-center gap-2 text-meta text-ink-weak">
              <Pill status={q.status} />
              <span className="tabular-nums">
                {formatTimestamp(q.created_at)}
              </span>
            </div>
          </Row>
        ))}
        {questions.length === 0 && (
          <li className="text-aux text-ink-weak">
            まだ何も入っていない。最初の問いを投げ入れるところから。
          </li>
        )}
      </ul>
    </main>
  );
}
