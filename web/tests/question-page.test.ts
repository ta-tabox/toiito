import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterAll, describe, expect, it } from "vitest";
import QuestionPage from "@/app/q/[id]/page";
import { MessageBody } from "@/components/message-body";
import * as db from "@/lib/db";
import type { Memo, Message } from "@/lib/types";

afterAll(async () => {
  await db.disconnect();
});

/**
 * server component が返した要素ツリーを、描画せずに深さ優先で平らにする。
 *
 * react-dom で描くと MessageBody が client の実行時（hooks・DOM）を要求する。
 * 検査したいのは着地点の id と各 MessageBody が受け取る props だけなので、ツリーのまま読む。
 */
function elementsOf(node: ReactNode): ReactElement[] {
  if (Array.isArray(node)) {
    return node.flatMap(elementsOf);
  }

  if (!isValidElement(node)) {
    return [];
  }

  const { children } = node.props as { children?: ReactNode };

  return [node, ...elementsOf(children)];
}

/** 二つの発話を持ち、後ろの発話にだけメモが付いた問いを作る。 */
async function questionWithMemoOnSecondMessage() {
  const created = await db.createQuestionWithTranscript({
    body: "対話画面にメモが出るか",
    messages: [
      { speaker: "human", body: "口火を切る" },
      {
        speaker: "ai_a",
        body: "具体の応答",
        memos: [{ anchorStart: 0, anchorEnd: 2, keyword: "具体" }],
      },
    ],
  });

  return created;
}

/** 対話画面を描かせ、要素ツリーを平らにして返す。 */
async function renderTree(questionId: string) {
  return elementsOf(
    await QuestionPage({ params: Promise.resolve({ id: questionId }) }),
  );
}

describe("/q/[id]", () => {
  it("各発話に逆引きの着地点となる id を付ける", async () => {
    const { question, messages } = await questionWithMemoOnSecondMessage();

    const ids = (await renderTree(question.id))
      .map((element) => (element.props as { id?: unknown }).id)
      .filter((id) => id !== undefined);

    // id を持つのは発話だけ。
    // [id^="msg-"]:target が発話以外に当たらないことを、この一致が保証する。
    expect(ids).toEqual(messages.map((m) => `msg-${m.id}`));
  });

  it("各発話の本文へ、その発話に付いたメモだけを渡す", async () => {
    const { question, messages, memos } =
      await questionWithMemoOnSecondMessage();

    const bodies = (await renderTree(question.id))
      .filter((element) => element.type === MessageBody)
      .map((element) => element.props as { message: Message; memos: Memo[] });

    expect(bodies.map((body) => body.message.id)).toEqual(
      messages.map((m) => m.id),
    );
    expect(bodies.map((body) => body.memos.map((memo) => memo.id))).toEqual([
      [],
      [memos[0].id],
    ]);
  });
});
