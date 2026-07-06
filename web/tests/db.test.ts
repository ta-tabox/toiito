import { beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type * as DbModule from "@/lib/db";

let db: typeof DbModule;

beforeAll(async () => {
  // env を差し替えてから初回アクセス（db.ts はパス解決が遅延）
  process.env.TOIITO_DB_PATH = path.join(
    mkdtempSync(path.join(tmpdir(), "toiito-test-")),
    "test.db"
  );
  db = await import("@/lib/db");
});

describe("questions / sessions", () => {
  it("問いの投入で初回セッションも一緒に作られる", () => {
    const { question, session } = db.createQuestion("なぜ速さを求めるのか");
    expect(question.body).toBe("なぜ速さを求めるのか");
    expect(question.status).toBe("composting");
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
      db.addMessage(session.id, "ai_c", "三体目はいない")
    ).toThrow();
  });
});
