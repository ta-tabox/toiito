import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type * as DbModule from "@/lib/db";

let db: typeof DbModule;

beforeAll(async () => {
  // env を差し替えてから初回アクセス（db.ts はパス解決が遅延）
  process.env.TOIITO_DB_PATH = path.join(
    mkdtempSync(path.join(tmpdir(), "toiito-test-")),
    "test.db",
  );
  db = await import("@/lib/db");
});

describe("questions / sessions", () => {
  it("問いの投入で初回セッションも一緒に作られる", () => {
    const { question, session } = db.createQuestion("なぜ速さを求めるのか");
    expect(question.body).toBe("なぜ速さを求めるのか");
    expect(question.status).toBe("composting");
    expect(question.current_form).toBeNull();
    expect(session.question_id).toBe(question.id);
    expect(db.latestSession(question.id)?.id).toBe(session.id);
  });

  it("再訪で新セッションを作ると latestSession が入れ替わる", () => {
    const { question, session: first } = db.createQuestion("問い2");
    const second = db.createSession(question.id);
    expect(db.latestSession(question.id)?.id).toBe(second.id);
    expect(first.id).not.toBe(second.id);
  });

  it("一覧は新しい順", () => {
    const list = db.listQuestions();
    expect(list.length).toBeGreaterThanOrEqual(2);
  });
});

describe("原型と現在の形", () => {
  it("現在の形を立てても原型は不変で、表示は現在の形が勝つ", () => {
    const { question } = db.createQuestion("傷が言えるとは抽象化か");
    const updated = db.setCurrentForm(question.id, "傷が癒えるとは抽象化か")!;
    expect(updated.body).toBe("傷が言えるとは抽象化か"); // 原型は動かない
    expect(updated.current_form).toBe("傷が癒えるとは抽象化か");
    expect(db.questionText(updated)).toBe("傷が癒えるとは抽象化か");
  });

  it("現在の形が無ければ表示は原型に落ちる", () => {
    const { question } = db.createQuestion("原型だけの問い");
    expect(db.questionText(question)).toBe("原型だけの問い");
  });

  it("空白のみは現在の形なし扱いで原型へ戻る", () => {
    const { question } = db.createQuestion("戻る問い");
    db.setCurrentForm(question.id, "いったん言い直す");
    const back = db.setCurrentForm(question.id, "   ")!;
    expect(back.current_form).toBeNull();
    expect(db.questionText(back)).toBe("戻る問い");
  });

  it("現在の形は前後の空白を落として保存する", () => {
    const { question } = db.createQuestion("空白の問い");
    expect(db.setCurrentForm(question.id, "  詰めた形  ")!.current_form).toBe(
      "詰めた形",
    );
  });
});

describe("問いの状態機械", () => {
  it("6状態すべてに遷移できる", () => {
    const { question } = db.createQuestion("状態の問い");
    for (const s of db.QUESTION_STATUSES) {
      expect(db.setQuestionStatus(question.id, s)?.status).toBe(s);
    }
  });

  it("perennial（閉じないことが正しい問い）が open と別状態として存在する", () => {
    expect(db.QUESTION_STATUSES).toContain("open");
    expect(db.QUESTION_STATUSES).toContain("perennial");
  });

  it("closed は廃止されている（promoted と discarded に割れた）", () => {
    expect(db.QUESTION_STATUSES).not.toContain("closed");
    const { question } = db.createQuestion("旧状態の問い");
    expect(() =>
      // @ts-expect-error 値域は型でもスキーマでも表明している
      db.setQuestionStatus(question.id, "closed"),
    ).toThrow();
  });

  it("未知の状態は lib 側で弾く（DB へ届かせない）", () => {
    const { question } = db.createQuestion("不正状態の問い");
    expect(() =>
      // @ts-expect-error 値域は型でもスキーマでも表明している
      db.setQuestionStatus(question.id, "fermenting"),
    ).toThrow(/unknown question status/);
    expect(db.getQuestion(question.id)?.status).toBe("composting");
  });
});

describe("messages", () => {
  it("三者の発話が投稿順で取れる", () => {
    const { session } = db.createQuestion("問い3");
    db.addMessage(session.id, "human", "口火");
    db.addMessage(session.id, "ai_a", "具体の応答");
    db.addMessage(session.id, "ai_b", "抽象の応答");
    const msgs = db.listMessages(session.id);
    expect(msgs.map((m) => m.speaker)).toEqual(["human", "ai_a", "ai_b"]);
  });

  it("不正な speaker は check 制約で弾かれる", () => {
    const { session } = db.createQuestion("問い4");
    expect(() =>
      // @ts-expect-error 不変条件をスキーマ側でも表明していることの検証
      db.addMessage(session.id, "ai_c", "三体目はいない"),
    ).toThrow();
  });
});

describe("memos", () => {
  it("正常系: 選択区間から作れて note は保存される", () => {
    const { session } = db.createQuestion("問い5");
    const message = db.addMessage(session.id, "ai_a", "これは本文である");
    const memo = db.addMemo(message.id, 2, 4, "本文", "気になる語");
    expect(memo.message_id).toBe(message.id);
    expect(memo.anchor_start).toBe(2);
    expect(memo.anchor_end).toBe(4);
    expect(memo.keyword).toBe("本文");
    expect(memo.note).toBe("気になる語");
  });

  it("note は省略可で、省略時は null になる", () => {
    const { session } = db.createQuestion("問い6");
    const message = db.addMessage(session.id, "ai_b", "省略のテスト文");
    const memo = db.addMemo(message.id, 0, 2, "省略");
    expect(memo.note).toBeNull();
  });

  it("anchor_end が本文長を超える場合は lib 側で拒否する", () => {
    const { session } = db.createQuestion("問い7");
    const message = db.addMessage(session.id, "human", "五文字の文");
    expect(message.body.length).toBe(5);
    expect(() => db.addMemo(message.id, 0, 100, "はみ出し")).toThrow(
      /anchor_end/,
    );
  });

  it("存在しない message_id（外部キー不整合）は失敗する", () => {
    expect(() => db.addMemo("no-such-message", 0, 1, "不整合")).toThrow();
  });

  it("listMemosForSession はそのセッションのメモだけを返す", () => {
    const { session: sessionA } = db.createQuestion("問い8-A");
    const { session: sessionB } = db.createQuestion("問い8-B");
    const msgA = db.addMessage(sessionA.id, "ai_a", "セッションAの本文");
    const msgB = db.addMessage(sessionB.id, "ai_a", "セッションBの本文");
    const memoA = db.addMemo(msgA.id, 0, 3, "A");
    db.addMemo(msgB.id, 0, 3, "B");

    const listed = db.listMemosForSession(sessionA.id);
    expect(listed.map((m) => m.id)).toEqual([memoA.id]);
  });

  it("listMemosWithContext は memos→messages→sessions→questions の join が正しく効く", () => {
    const { question, session } = db.createQuestion("問い9: 逆引き元の問い");
    const message = db.addMessage(session.id, "ai_b", "逆引き対象の本文");
    const memo = db.addMemo(message.id, 0, 4, "逆引き");

    const found = db.listMemosWithContext().find((m) => m.id === memo.id);
    expect(found).toBeDefined();
    expect(found?.session_id).toBe(session.id);
    expect(found?.question_id).toBe(question.id);
    expect(found?.question_body).toBe("問い9: 逆引き元の問い");
    expect(found?.speaker).toBe("ai_b");
    expect(found?.message_body).toBe("逆引き対象の本文");
  });
});
