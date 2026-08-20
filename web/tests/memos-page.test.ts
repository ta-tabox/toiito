import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterAll, describe, expect, it } from "vitest";
import MemosPage from "@/app/memos/page";
import * as db from "@/lib/db";

afterAll(async () => {
  await db.disconnect();
});

/**
 * server component が返した要素ツリーを、描画せずに文字列へ畳む。
 *
 * react-dom で描くと next/link が client の実行時（hooks・router context）を要求する。
 * 検査したいのは「どの語が並び、どこへリンクするか」だけなので、ツリーのまま読む。
 */
function textOf(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }

  if (Array.isArray(node)) {
    return node.map(textOf).join("");
  }

  if (isValidElement(node)) {
    return textOf(childrenOf(node));
  }

  return "";
}

/** 要素ツリー中の href を出現順に集める。 */
function hrefsOf(node: ReactNode): string[] {
  if (Array.isArray(node)) {
    return node.flatMap(hrefsOf);
  }

  if (!isValidElement(node)) {
    return [];
  }

  const { href } = node.props as { href?: unknown };
  const here = typeof href === "string" ? [href] : [];

  return [...here, ...hrefsOf(childrenOf(node))];
}

/** 要素の子。props の型が unknown なので、読み出しをここ一箇所に閉じる。 */
function childrenOf(element: ReactElement): ReactNode {
  return (element.props as { children?: ReactNode }).children;
}

/** 前後に十分な地の文を持つ発話を作り、その中ほどの語にメモを付ける。 */
async function memoInLongMessage(keyword: string, note?: string) {
  const before = "前".repeat(100);
  const after = "後".repeat(100);
  const { question, session } = await db.createQuestion("逆引きの検査");
  const message = await db.addMessage(
    session.id,
    "ai_a",
    `${before}${keyword}${after}`,
  );
  const memo = await db.addMemo(
    message.id,
    before.length,
    before.length + keyword.length,
    keyword,
    note,
  );

  return { question, message, memo, before, after };
}

describe("/memos", () => {
  it("各行から出所の発話へ逆引きするリンクを張る", async () => {
    const { question, message } = await memoInLongMessage("逆引き対象");

    const hrefs = hrefsOf(await MemosPage());

    expect(hrefs).toContain(`/q/${question.id}#msg-${message.id}`);
  });

  it("キーワード・メモ・前後を添えた引用・問い本文を並べる", async () => {
    const keyword = "焦点の語";
    const { question, before, after } = await memoInLongMessage(
      keyword,
      "この言い換えが効いた",
    );

    const text = textOf(await MemosPage());

    expect(text).toContain(keyword);
    expect(text).toContain("この言い換えが効いた");
    expect(text).toContain(question.body);

    // 引用はアンカーの前後へ少しだけ広がる（本文全部でも、キーワードだけでもない）
    expect(text).toContain(`${"前".repeat(10)}${keyword}${"後".repeat(10)}`);
    expect(text).not.toContain(before + keyword + after);
  });

  it("新しいメモが先に来る", async () => {
    const older = "古いメモ";
    const newer = "新しいメモ";
    await memoInLongMessage(older);
    await memoInLongMessage(newer);

    const text = textOf(await MemosPage());

    expect(text.indexOf(newer)).toBeLessThan(text.indexOf(older));
  });
});
