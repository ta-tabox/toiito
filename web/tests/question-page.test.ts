import { createOwner } from "@tests/setup/owner";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import QuestionPage from "@/app/q/[id]/page";
import { MessageBody } from "@/components/message-body";
import { SpeakForm } from "@/components/speak-form";
import { parseAnchor } from "@/lib/anchors";
import * as db from "@/lib/db";
import { questionPathOf } from "@/lib/routes";
import type { Memo, Message, OwnerId } from "@/lib/types";

/**
 * `requireCurrentUser` が返すユーザー。
 * `beforeEach` が作った所有者を、モックの外から差し替えるための入れ物。
 */
const currentUser = vi.hoisted(() => ({ value: undefined as unknown }));

// 本物の `requireCurrentUser` は Better Auth のセッションを読むので、リクエストの外では呼べない。
// ここで見たいのは所有者を受け取った後の描画なので、セッションの読み取りごと差し替える（サインインの検査は `e2e/auth.spec.ts`）。
vi.mock("@/lib/auth/current-user", () => ({
  requireCurrentUser: async () => currentUser.value,
}));

afterAll(async () => {
  await db.disconnect();
});

let owner: OwnerId;

beforeEach(async () => {
  owner = await createOwner();
  currentUser.value = await db.getUserById(owner);
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

/** `notFound()` が throw する例外の `digest`。 */
const NOT_FOUND_DIGEST = "NEXT_HTTP_ERROR_FALLBACK;404";

/**
 * 要素ツリーの文字列を連結して返す。
 * 要素が undefined なら空文字列を返す。
 */
function textOf(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }

  if (Array.isArray(node)) {
    return node.map(textOf).join("");
  }

  if (!isValidElement(node)) {
    return "";
  }

  const { children } = node.props as { children?: ReactNode };

  return textOf(children);
}

/**
 * 平らにした要素ツリーから、再送の枠（`PendingTurn`）が受け取った本文を集める。
 *
 * `PendingTurn` は export されていないので、関数の名前で要素を見分ける。
 */
function pendingBodiesOf(tree: ReactElement[]): unknown[] {
  return tree
    .filter(
      (element) =>
        typeof element.type === "function" &&
        element.type.name === "PendingTurn",
    )
    .map((element) => (element.props as { body?: unknown }).body);
}

/** 二つの発話を持ち、後ろの発話にだけメモが付いた問いを作る。 */
async function questionWithMemoOnSecondMessage() {
  const created = await db.createQuestionWithTranscript(owner, {
    body: "対話画面にメモが出るか",
    messages: [
      { speaker: "human", body: "口火を切る" },
      {
        speaker: "ai_a",
        body: "具体の応答",
        memos: [{ anchor: parseAnchor(0, 2), keyword: "具体" }],
      },
    ],
  });

  return created;
}

/**
 * 対話画面を描かせ、要素ツリーを平らにして返す。
 * セッション ID を渡すとそのセッション、渡さなければ最新セッションを描く。
 */
async function renderTree(questionId: string, sessionId?: string) {
  const tree = await QuestionPage({
    params: Promise.resolve({ id: questionId }),
    searchParams: Promise.resolve({ s: sessionId }),
  });

  return elementsOf(tree);
}

describe("/q/[id]", () => {
  it("各発話に逆引きの着地点となる id を付ける", async () => {
    const { question, messages } = await questionWithMemoOnSecondMessage();

    const tree = await renderTree(question.id);
    const ids = tree
      .map((element) => (element.props as { id?: unknown }).id)
      .filter((id) => id !== undefined);

    // id を持つのは発話だけ。
    // 着地の強調が発話以外に付かないことを、この一致が保証する。
    expect(ids).toEqual(messages.map((m) => `msg-${m.id}`));
  });

  it("?s が指すセッションを描く（再訪しても当時の発話が残る）", async () => {
    const { question, messages } = await questionWithMemoOnSecondMessage();
    const revisit = await db.createSession(owner, question.id);
    const later = await db.addMessage(owner, revisit.id, {
      speaker: "human",
      body: "日を空けてまた話す",
    });

    const ids = (id?: string) =>
      renderTree(question.id, id).then((tree) =>
        tree
          .map((element) => (element.props as { id?: unknown }).id)
          .filter((id) => id !== undefined),
      );

    const latestIds = await ids();
    const pastIds = await ids(messages[0].session_id);

    // 既定は最新セッション。
    // 当時の発話は ?s で名指ししたときにだけ出る（メモからの逆引きがこの経路を使う）。
    expect(latestIds).toEqual([`msg-${later.id}`]);
    expect(pastIds).toEqual(messages.map((m) => `msg-${m.id}`));
  });

  it("過去セッションを読むときは発話フォームを出さない", async () => {
    const { question, session } = await questionWithMemoOnSecondMessage();
    await db.createSession(owner, question.id);

    const hasSpeakForm = (id?: string) =>
      renderTree(question.id, id).then((tree) =>
        tree.some((element) => element.type === SpeakForm),
      );

    const onLatest = await hasSpeakForm();
    const onPast = await hasSpeakForm(session.id);

    expect(onLatest).toBe(true);
    expect(onPast).toBe(false);
  });

  it("各発話の本文へ、その発話に付いたメモだけを渡す", async () => {
    const { question, messages, memos } =
      await questionWithMemoOnSecondMessage();

    const tree = await renderTree(question.id);
    const bodies = tree
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

  it("?s に他の問いのセッション id を渡すと 404 になる", async () => {
    const { question } = await questionWithMemoOnSecondMessage();
    const other = await db.createQuestion(owner, "別の問い");

    await expect(
      renderTree(question.id, other.session.id),
    ).rejects.toMatchObject({ digest: NOT_FOUND_DIGEST });
  });

  it("最新セッションに送れなかった発話があると、その本文を再送の枠に出す", async () => {
    const { question, session } = await questionWithMemoOnSecondMessage();
    await db.savePendingBody(owner, session.id, "送れなかった発話");

    const tree = await renderTree(question.id);

    expect(pendingBodiesOf(tree)).toEqual(["送れなかった発話"]);
  });

  it("過去セッションを読むときは、最新セッションの送れなかった発話を出さない", async () => {
    const { question, session } = await questionWithMemoOnSecondMessage();
    const latest = await db.createSession(owner, question.id);
    await db.savePendingBody(owner, latest.id, "送れなかった発話");

    const tree = await renderTree(question.id, session.id);

    expect(pendingBodiesOf(tree)).toEqual([]);
  });

  it("セッション切替のリンクには、そのセッションのキーワードを先頭の 3 語まで出す", async () => {
    const { question, session } = await db.createQuestionWithTranscript(owner, {
      body: "キーワードが多いセッション",
      messages: [
        {
          speaker: "human",
          body: "一二三四",
          memos: ["一", "二", "三", "四"].map((keyword, index) => ({
            anchor: parseAnchor(index, index + 1),
            keyword,
          })),
        },
      ],
    });
    await db.createSession(owner, question.id);

    const tree = await renderTree(question.id);
    const pastHref = questionPathOf(question.id, { sessionId: session.id });
    const pastLink = tree.find(
      (element) => (element.props as { href?: unknown }).href === pastHref,
    );

    expect(textOf(pastLink)).toMatch(/ · 一・二・三$/);
  });
});
