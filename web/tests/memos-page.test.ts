import { createOwner } from "@tests/setup/owner";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import MemosPage from "@/app/memos/page";
import * as db from "@/lib/db";
import type { OwnerId } from "@/lib/types";

afterAll(async () => {
  await db.disconnect();
});

// repo 関数はどれも所有者を要求するので、空にした後のケースごとに一人作る。
let owner: OwnerId;

beforeEach(async () => {
  owner = await createOwner();
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

/**
 * 要素の子。
 * props の型が unknown なので、読み出しをここ一箇所に閉じる。
 */
function childrenOf(element: ReactElement): ReactNode {
  return (element.props as { children?: ReactNode }).children;
}

/** 前後に十分な地の文を持つ発話を作り、その中ほどの語にメモを付ける。 */
async function memoInLongMessage(keyword: string, note?: string) {
  const before = "前".repeat(100);
  const after = "後".repeat(100);
  const { question, session } = await db.createQuestion(owner, "逆引きの検査");
  const message = await db.addMessage(
    owner,
    session.id,
    "ai_a",
    `${before}${keyword}${after}`,
  );
  const memo = await db.addMemo(
    owner,
    message.id,
    before.length,
    before.length + keyword.length,
    keyword,
    note,
  );

  return { question, session, message, memo, before, after };
}

/** クエリ無しで一覧を描く。 */
async function listPage() {
  return MemosPage({ searchParams: Promise.resolve({}) });
}

describe("/memos", () => {
  it("各行はそのメモの拡大表示へリンクする", async () => {
    const { memo } = await memoInLongMessage("拡大表示の対象");

    const hrefs = hrefsOf(await listPage());

    expect(hrefs).toContain(`/memos?memo=${memo.id}`);
  });

  it("拡大表示したメモから、当時のセッションの発話へ逆引きする", async () => {
    const { question, session, message, memo } =
      await memoInLongMessage("逆引き対象");

    // 再訪を挟む。
    // セッションを名指ししていないと、着地先が最新セッションになって発話が DOM に無い（issue #57）。
    await db.createSession(owner, question.id);

    const opened = await MemosPage({
      searchParams: Promise.resolve({ memo: memo.id }),
    });

    expect(hrefsOf(opened)).toContain(
      `/q/${question.id}?s=${session.id}#msg-${message.id}`,
    );
  });

  it("クエリで指していなければ拡大表示を出さない", async () => {
    const { question, session, message } =
      await memoInLongMessage("開かない対象");

    const hrefs = hrefsOf(await listPage());

    // 逆引きのリンクは拡大表示の中にしか無い。
    expect(hrefs).not.toContain(
      `/q/${question.id}?s=${session.id}#msg-${message.id}`,
    );
  });

  it("キーワード・メモ・前後を添えた引用・問い本文を並べる", async () => {
    const keyword = "焦点の語";
    const { question, before, after } = await memoInLongMessage(
      keyword,
      "この言い換えが効いた",
    );

    const text = textOf(await listPage());

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

    const text = textOf(await listPage());

    expect(text.indexOf(newer)).toBeLessThan(text.indexOf(older));
  });
});
