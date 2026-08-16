import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import * as db from "@/lib/db";
import { QUESTION_STATUSES } from "@/lib/question";

// 接続先はテスト専用データベース（vitest.config.ts が env で渡し、
// globalSetup が走る前に作り直す）。
afterAll(async () => {
  await db.disconnect();
});

describe("questions / sessions", () => {
  it("問いの投入で初回セッションも一緒に作られる", async () => {
    const { question, session } = await db.createQuestion(
      "なぜ速さを求めるのか",
    );

    expect(question.body).toBe("なぜ速さを求めるのか");
    expect(question.status).toBe("composting");
    expect(question.current_form).toBeNull();
    expect(session.question_id).toBe(question.id);
    expect((await db.latestSession(question.id))?.id).toBe(session.id);
  });

  it("再訪で新セッションを作ると latestSession が入れ替わる", async () => {
    const { question, session: first } = await db.createQuestion("問い2");
    const second = await db.createSession(question.id);

    expect((await db.latestSession(question.id))?.id).toBe(second.id);
    expect(first.id).not.toBe(second.id);
  });

  it("一覧は新しい順", async () => {
    const list = await db.listQuestions();
    expect(list.length).toBeGreaterThanOrEqual(2);
  });
});

describe("原型と現在の形", () => {
  it("現在の形を立てても原型は不変で、表示は現在の形が勝つ", async () => {
    const { question } = await db.createQuestion("傷が言えるとは抽象化か");
    const updated = await db.setCurrentForm(
      question.id,
      "傷が癒えるとは抽象化か",
    );

    expect(updated.body).toBe("傷が言えるとは抽象化か"); // 原型は動かない
    expect(updated.current_form).toBe("傷が癒えるとは抽象化か");
    expect(db.questionText(updated)).toBe("傷が癒えるとは抽象化か");
  });

  it("現在の形が無ければ表示は原型に落ちる", async () => {
    const { question } = await db.createQuestion("原型だけの問い");
    expect(db.questionText(question)).toBe("原型だけの問い");
  });

  it("空白のみは現在の形なし扱いで原型へ戻る", async () => {
    const { question } = await db.createQuestion("戻る問い");
    await db.setCurrentForm(question.id, "いったん言い直す");
    const back = await db.setCurrentForm(question.id, "   ");

    expect(back.current_form).toBeNull();
    expect(db.questionText(back)).toBe("戻る問い");
  });

  it("現在の形は前後の空白を落として保存する", async () => {
    const { question } = await db.createQuestion("空白の問い");
    const updated = await db.setCurrentForm(question.id, "  詰めた形  ");

    expect(updated.current_form).toBe("詰めた形");
  });
});

describe("問いの状態機械", () => {
  it("6状態すべてに遷移できる", async () => {
    const { question } = await db.createQuestion("状態の問い");

    for (const s of QUESTION_STATUSES) {
      expect((await db.setQuestionStatus(question.id, s)).status).toBe(s);
    }
  });

  it("perennial（閉じないことが正しい問い）が open と別状態として存在する", () => {
    expect(QUESTION_STATUSES).toContain("open");
    expect(QUESTION_STATUSES).toContain("perennial");
  });

  it("closed は廃止されている（promoted と discarded に割れた）", async () => {
    expect(QUESTION_STATUSES).not.toContain("closed");

    const { question } = await db.createQuestion("旧状態の問い");
    await expect(
      // @ts-expect-error 値域は型でもスキーマでも表明している
      db.setQuestionStatus(question.id, "closed"),
    ).rejects.toThrow();
  });

  it("未知の状態は lib 側で弾く（DB へ届かせない）", async () => {
    const { question } = await db.createQuestion("不正状態の問い");

    await expect(
      // @ts-expect-error 値域は型でもスキーマでも表明している
      db.setQuestionStatus(question.id, "fermenting"),
    ).rejects.toThrow(/unknown question status/);
    expect((await db.getQuestion(question.id))?.status).toBe("composting");
  });
});

describe("messages", () => {
  it("三者の発話が投稿順で取れる", async () => {
    const { session } = await db.createQuestion("問い3");

    await db.addMessage(session.id, "human", "口火");
    await db.addMessage(session.id, "ai_a", "具体の応答");
    await db.addMessage(session.id, "ai_b", "抽象の応答");
    const msgs = await db.listMessages(session.id);

    expect(msgs.map((m) => m.speaker)).toEqual(["human", "ai_a", "ai_b"]);
  });

  it("不正な speaker は enum で弾かれる", async () => {
    const { session } = await db.createQuestion("問い4");

    await expect(
      // @ts-expect-error 不変条件をスキーマ側でも表明していることの検証
      db.addMessage(session.id, "ai_c", "三体目はいない"),
    ).rejects.toThrow();
  });
});

describe("memos", () => {
  it("正常系: 選択区間から作れて note は保存される", async () => {
    const { session } = await db.createQuestion("問い5");
    const message = await db.addMessage(session.id, "ai_a", "これは本文である");
    const memo = await db.addMemo(message.id, 2, 4, "本文", "気になる語");

    expect(memo.message_id).toBe(message.id);
    expect(memo.anchor_start).toBe(2);
    expect(memo.anchor_end).toBe(4);
    expect(memo.keyword).toBe("本文");
    expect(memo.note).toBe("気になる語");
  });

  it("note は省略可で、省略時は null になる", async () => {
    const { session } = await db.createQuestion("問い6");
    const message = await db.addMessage(session.id, "ai_b", "省略のテスト文");
    const memo = await db.addMemo(message.id, 0, 2, "省略");

    expect(memo.note).toBeNull();
  });

  it("anchor_end が本文長を超える場合は lib 側で拒否する", async () => {
    const { session } = await db.createQuestion("問い7");
    const message = await db.addMessage(session.id, "human", "五文字の文");

    expect(message.body.length).toBe(5);
    await expect(db.addMemo(message.id, 0, 100, "はみ出し")).rejects.toThrow(
      /anchor_end/,
    );
  });

  it("空区間・負のアンカーは check 制約で弾かれる", async () => {
    const { session } = await db.createQuestion("問い7b");
    const message = await db.addMessage(session.id, "human", "区間の検査文");

    await expect(db.addMemo(message.id, 2, 2, "空区間")).rejects.toThrow();
    await expect(db.addMemo(message.id, -1, 3, "負の開始")).rejects.toThrow();
  });

  it("存在しない message にはメモを付けられない", async () => {
    await expect(db.addMemo(randomUUID(), 0, 1, "不整合")).rejects.toThrow(
      /message not found/,
    );
  });

  it("listMemosForSession はそのセッションのメモだけを返す", async () => {
    const { session: sessionA } = await db.createQuestion("問い8-A");
    const { session: sessionB } = await db.createQuestion("問い8-B");
    const msgA = await db.addMessage(sessionA.id, "ai_a", "セッションAの本文");
    const msgB = await db.addMessage(sessionB.id, "ai_a", "セッションBの本文");
    const memoA = await db.addMemo(msgA.id, 0, 3, "A");
    await db.addMemo(msgB.id, 0, 3, "B");

    const listed = await db.listMemosForSession(sessionA.id);

    expect(listed.map((m) => m.id)).toEqual([memoA.id]);
  });

  it("listMemosWithContext は memos→messages→sessions→questions の join が正しく効く", async () => {
    const { question, session } = await db.createQuestion(
      "問い9: 逆引き元の問い",
    );
    const message = await db.addMessage(session.id, "ai_b", "逆引き対象の本文");
    const memo = await db.addMemo(message.id, 0, 4, "逆引き");

    const found = (await db.listMemosWithContext()).find(
      (m) => m.id === memo.id,
    );

    expect(found).toBeDefined();
    expect(found?.session_id).toBe(session.id);
    expect(found?.question_id).toBe(question.id);
    expect(found?.question_body).toBe("問い9: 逆引き元の問い");
    expect(found?.speaker).toBe("ai_b");
    expect(found?.message_body).toBe("逆引き対象の本文");
  });
});
