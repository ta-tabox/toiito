import { randomUUID } from "node:crypto";
import { createOwner } from "@tests/setup/owner";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import * as db from "@/lib/db";
import { QUESTION_STATUSES } from "@/lib/question";
import type { OwnerId } from "@/lib/types";

// 接続先はテスト専用データベース。
// vitest.config.ts が env で渡し、ケースごとに空にする（tests/setup/truncate.ts）。
afterAll(async () => {
  await db.disconnect();
});

// repo 関数はどれも所有者を要求するので、空にした後のケースごとに一人作る。
let owner: OwnerId;

beforeEach(async () => {
  owner = await createOwner();
});

describe("questions / sessions", () => {
  it("問いの投入で初回セッションも一緒に作られる", async () => {
    const { question, session } = await db.createQuestion(
      owner,
      "なぜ速さを求めるのか",
    );

    expect(question.body).toBe("なぜ速さを求めるのか");
    expect(question.status).toBe("new");
    expect(question.current_form).toBeNull();
    expect(session.question_id).toBe(question.id);
    expect((await db.latestSession(owner, question.id))?.id).toBe(session.id);
  });

  it("再訪で新セッションを作ると latestSession が入れ替わる", async () => {
    const { question, session: first } = await db.createQuestion(
      owner,
      "問い2",
    );
    const second = await db.createSession(owner, question.id);

    expect((await db.latestSession(owner, question.id))?.id).toBe(second.id);
    expect(first.id).not.toBe(second.id);
  });

  it("listSessionsWithKeywords はセッションを古い順で返す", async () => {
    const { question, session: first } = await db.createQuestion(
      owner,
      "再訪する問い",
    );
    const second = await db.createSession(owner, question.id);

    const sessions = await db.listSessionsWithKeywords(owner, question.id);

    expect(sessions.map((session) => session.id)).toEqual([
      first.id,
      second.id,
    ]);
  });

  it("listSessionsWithKeywords は各セッションに、そのセッションのキーワードだけを付ける", async () => {
    const { question, session: first } = await db.createQuestionWithTranscript(
      owner,
      {
        body: "どのセッションで言った語か",
        messages: [
          {
            speaker: "ai_a",
            body: "一度目の応答",
            memos: [{ anchorStart: 0, anchorEnd: 2, keyword: "一度" }],
          },
        ],
      },
    );
    const second = await db.createSession(owner, question.id);
    const laterMessage = await db.addMessage(
      owner,
      second.id,
      "ai_a",
      "二度目の応答",
    );
    await db.addMemo(owner, laterMessage.id, 0, 2, "二度");

    const sessions = await db.listSessionsWithKeywords(owner, question.id);

    expect(sessions.map((session) => session.keywords)).toEqual([
      ["一度"],
      ["二度"],
    ]);
    expect(sessions[0].id).toBe(first.id);
  });

  it("listSessionsWithKeywords はメモの無いセッションへ空の配列を返し、同じ語は一度だけ出す", async () => {
    const { question, messages } = await db.createQuestionWithTranscript(
      owner,
      {
        body: "同じ語に何度も印を付ける",
        messages: [{ speaker: "ai_a", body: "惰性と惰性" }],
      },
    );
    await db.addMemo(owner, messages[0].id, 0, 2, "惰性");
    await db.addMemo(owner, messages[0].id, 3, 5, "惰性");
    await db.createSession(owner, question.id);

    const sessions = await db.listSessionsWithKeywords(owner, question.id);

    expect(sessions.map((session) => session.keywords)).toEqual([["惰性"], []]);
  });

  it("一覧は新しい順", async () => {
    const { question: older } = await db.createQuestion(
      owner,
      "先に投げた問い",
    );
    const { question: newer } = await db.createQuestion(
      owner,
      "後に投げた問い",
    );

    const list = await db.listQuestions(owner);

    expect(list.map((q) => q.id)).toEqual([newer.id, older.id]);
  });
});

describe("原型と現在の形", () => {
  it("現在の形を立てても原型は不変で、表示は現在の形が勝つ", async () => {
    const { question } = await db.createQuestion(
      owner,
      "傷が言えるとは抽象化か",
    );
    const updated = await db.setCurrentForm(
      owner,
      question.id,
      "傷が癒えるとは抽象化か",
    );

    expect(updated.body).toBe("傷が言えるとは抽象化か"); // 原型は動かない
    expect(updated.current_form).toBe("傷が癒えるとは抽象化か");
    expect(db.questionText(updated)).toBe("傷が癒えるとは抽象化か");
  });

  it("現在の形が無ければ表示は原型に落ちる", async () => {
    const { question } = await db.createQuestion(owner, "原型だけの問い");
    expect(db.questionText(question)).toBe("原型だけの問い");
  });

  it("空白のみは現在の形なし扱いで原型へ戻る", async () => {
    const { question } = await db.createQuestion(owner, "戻る問い");
    await db.setCurrentForm(owner, question.id, "いったん言い直す");
    const back = await db.setCurrentForm(owner, question.id, "   ");

    expect(back.current_form).toBeNull();
    expect(db.questionText(back)).toBe("戻る問い");
  });

  it("現在の形は前後の空白を落として保存する", async () => {
    const { question } = await db.createQuestion(owner, "空白の問い");
    const updated = await db.setCurrentForm(owner, question.id, "  詰めた形  ");

    expect(updated.current_form).toBe("詰めた形");
  });
});

describe("問いの状態機械", () => {
  it("7状態すべてに遷移できる", async () => {
    const { question } = await db.createQuestion(owner, "状態の問い");

    for (const s of QUESTION_STATUSES) {
      expect((await db.setQuestionStatus(owner, question.id, s)).status).toBe(
        s,
      );
    }
  });

  it("permanent（閉じないことが正しい問い）が holding と別状態として存在する", () => {
    expect(QUESTION_STATUSES).toContain("holding");
    expect(QUESTION_STATUSES).toContain("permanent");
  });

  it("closed は廃止されている（exported と resolved と discarded に割れた）", async () => {
    expect(QUESTION_STATUSES).not.toContain("closed");

    const { question } = await db.createQuestion(owner, "旧状態の問い");
    await expect(
      // @ts-expect-error 値域は型でもスキーマでも表明している
      db.setQuestionStatus(owner, question.id, "closed"),
    ).rejects.toThrow();
  });

  it("未知の状態は lib 側で弾く（DB へ届かせない）", async () => {
    const { question } = await db.createQuestion(owner, "不正状態の問い");

    await expect(
      // @ts-expect-error 値域は型でもスキーマでも表明している
      db.setQuestionStatus(owner, question.id, "fermenting"),
    ).rejects.toThrow(/unknown question status/);
    expect((await db.getQuestion(owner, question.id))?.status).toBe("new");
  });
});

describe("messages", () => {
  it("三者の発話が投稿順で取れる", async () => {
    const { session } = await db.createQuestion(owner, "問い3");

    await db.addMessage(owner, session.id, "human", "口火");
    await db.addMessage(owner, session.id, "ai_a", "具体の応答");
    await db.addMessage(owner, session.id, "ai_b", "抽象の応答");
    const msgs = await db.listMessages(owner, session.id);

    expect(msgs.map((m) => m.speaker)).toEqual(["human", "ai_a", "ai_b"]);
  });

  it("不正な speaker は enum で弾かれる", async () => {
    const { session } = await db.createQuestion(owner, "問い4");

    await expect(
      // @ts-expect-error 不変条件をスキーマ側でも表明していることの検証
      db.addMessage(owner, session.id, "ai_c", "三体目はいない"),
    ).rejects.toThrow();
  });
});

describe("memos", () => {
  it("正常系: 選択区間から作れて note は保存される", async () => {
    const { session } = await db.createQuestion(owner, "問い5");
    const message = await db.addMessage(
      owner,
      session.id,
      "ai_a",
      "これは本文である",
    );
    const memo = await db.addMemo(
      owner,
      message.id,
      2,
      4,
      "本文",
      "気になる語",
    );

    expect(memo.message_id).toBe(message.id);
    expect(memo.anchor_start).toBe(2);
    expect(memo.anchor_end).toBe(4);
    expect(memo.keyword).toBe("本文");
    expect(memo.note).toBe("気になる語");
  });

  it("note は省略可で、省略時は null になる", async () => {
    const { session } = await db.createQuestion(owner, "問い6");
    const message = await db.addMessage(
      owner,
      session.id,
      "ai_b",
      "省略のテスト文",
    );
    const memo = await db.addMemo(owner, message.id, 0, 2, "省略");

    expect(memo.note).toBeNull();
  });

  it("anchor_end が本文長を超える場合は lib 側で拒否する", async () => {
    const { session } = await db.createQuestion(owner, "問い7");
    const message = await db.addMessage(
      owner,
      session.id,
      "human",
      "五文字の文",
    );

    expect(message.body.length).toBe(5);
    await expect(
      db.addMemo(owner, message.id, 0, 100, "はみ出し"),
    ).rejects.toThrow(/anchor_end/);
  });

  it("空区間・負のアンカーは check 制約で弾かれる", async () => {
    const { session } = await db.createQuestion(owner, "問い7b");
    const message = await db.addMessage(
      owner,
      session.id,
      "human",
      "区間の検査文",
    );

    await expect(
      db.addMemo(owner, message.id, 2, 2, "空区間"),
    ).rejects.toThrow();
    await expect(
      db.addMemo(owner, message.id, -1, 3, "負の開始"),
    ).rejects.toThrow();
  });

  it("存在しない message にはメモを付けられない", async () => {
    await expect(
      db.addMemo(owner, randomUUID(), 0, 1, "不整合"),
    ).rejects.toThrow(/message not found/);
  });

  it("listMemosForSession はそのセッションのメモだけを返す", async () => {
    const { session: sessionA } = await db.createQuestion(owner, "問い8-A");
    const { session: sessionB } = await db.createQuestion(owner, "問い8-B");
    const msgA = await db.addMessage(
      owner,
      sessionA.id,
      "ai_a",
      "セッションAの本文",
    );
    const msgB = await db.addMessage(
      owner,
      sessionB.id,
      "ai_a",
      "セッションBの本文",
    );
    const memoA = await db.addMemo(owner, msgA.id, 0, 3, "A");
    await db.addMemo(owner, msgB.id, 0, 3, "B");

    const listed = await db.listMemosForSession(owner, sessionA.id);

    expect(listed.map((m) => m.id)).toEqual([memoA.id]);
  });

  it("listMemosWithContext は memos→messages→sessions→questions の join が正しく効く", async () => {
    const { question, session } = await db.createQuestion(
      owner,
      "問い9: 逆引き元の問い",
    );
    const message = await db.addMessage(
      owner,
      session.id,
      "ai_b",
      "逆引き対象の本文",
    );
    const memo = await db.addMemo(owner, message.id, 0, 4, "逆引き");

    const [found] = await db.listMemosWithContext(owner);

    expect(found.id).toBe(memo.id);
    expect(found.session_id).toBe(session.id);
    expect(found.question_id).toBe(question.id);
    expect(found.question_body).toBe("問い9: 逆引き元の問い");
    expect(found.speaker).toBe("ai_b");
    expect(found.message_body).toBe("逆引き対象の本文");
  });

  it("listMemosWithContext は新しい順に返す", async () => {
    const { session } = await db.createQuestion(owner, "問い10: 並びの検査");
    const message = await db.addMessage(
      owner,
      session.id,
      "ai_a",
      "先の語と後の語",
    );
    const older = await db.addMemo(owner, message.id, 0, 2, "先の語");
    const newer = await db.addMemo(owner, message.id, 4, 6, "後の語");

    const ids = (await db.listMemosWithContext(owner)).map((m) => m.id);

    expect(ids).toEqual([newer.id, older.id]);
  });
});

describe("所有権", () => {
  /** 他人と、その人が持つ問い一件・発話一件・メモ一件。 */
  async function otherWithOneOfEach() {
    const other = await createOwner("other@example.com");
    const { question, session, messages, memos } =
      await db.createQuestionWithTranscript(other, {
        body: "他人の問い",
        messages: [
          {
            speaker: "ai_a",
            body: "他人の発話",
            memos: [{ anchorStart: 0, anchorEnd: 2, keyword: "他人" }],
          },
        ],
      });

    return { other, question, session, message: messages[0], memo: memos[0] };
  }

  it("読み出しは、他人の問いを一件も返さない", async () => {
    const { question, session, message } = await otherWithOneOfEach();
    await db.createQuestion(owner, "自分の問い");

    expect((await db.listQuestions(owner)).map((q) => q.body)).toEqual([
      "自分の問い",
    ]);
    expect(await db.getQuestion(owner, question.id)).toBeUndefined();
    expect(await db.getSession(owner, session.id)).toBeUndefined();
    expect(await db.latestSession(owner, question.id)).toBeUndefined();
    expect(await db.listSessionsWithKeywords(owner, question.id)).toEqual([]);
    expect(await db.listMessages(owner, session.id)).toEqual([]);
    expect(await db.listMemosForSession(owner, session.id)).toEqual([]);
    expect(
      (await db.listMemosWithContext(owner)).map((m) => m.message_body),
    ).not.toContain(message.body);
  });

  it("書き込みは、他人の問い・セッション・発話のどれへも届かない", async () => {
    const { question, session, message } = await otherWithOneOfEach();

    await expect(db.createSession(owner, question.id)).rejects.toThrow(
      /問いが見つからない/,
    );
    await expect(
      db.setCurrentForm(owner, question.id, "言い直し"),
    ).rejects.toThrow(/問いが見つからない/);
    await expect(
      db.setQuestionStatus(owner, question.id, "stocked"),
    ).rejects.toThrow(/問いが見つからない/);
    await expect(
      db.addMessage(owner, session.id, "human", "割り込み"),
    ).rejects.toThrow(/セッションが見つからない/);
    await expect(db.addMemo(owner, message.id, 0, 2, "横取り")).rejects.toThrow(
      /message not found/,
    );
  });

  it("他人の問いと存在しない問いは、同じ失敗になる", async () => {
    const { question } = await otherWithOneOfEach();

    // 二つを見分けられると、URL を差し替えるだけで在ることが読める。
    const missing = await db
      .createSession(owner, randomUUID())
      .catch((error: Error) => error.message);
    const others = await db
      .createSession(owner, question.id)
      .catch((error: Error) => error.message);

    expect(others).toBe(String(missing).replace(/: .*$/, `: ${question.id}`));
  });
});
