import { seed } from "@scripts/seed.mts";
import { SEED_INPUTS } from "@scripts/seed-questions.mts";
import { afterAll, describe, expect, it, vi } from "vitest";
import * as db from "@/lib/db";

// 接続先はテスト専用データベース。vitest.config.ts が env で渡す。
// この DB は他のテストファイルと共有していて空とは限らないので、投入そのものは
// seed が呼ぶ口（createQuestionWithTranscript）へ直に当てる。
// seed 自身については、空でない DB で何もしないことを見る。
afterAll(async () => {
  await db.disconnect();
});

describe("シードの宣言", () => {
  it("メモの範囲が本文中のキーワードを指す", () => {
    const memos = SEED_INPUTS.flatMap((question) =>
      question.messages.flatMap((message) =>
        (message.memos ?? []).map((memo) => ({ ...memo, body: message.body })),
      ),
    );

    expect(SEED_INPUTS.length).toBeGreaterThanOrEqual(2);
    expect(memos.length).toBeGreaterThan(0);

    for (const memo of memos) {
      // ずれたまま投入すると、UI では無関係な語に下線が付く。
      expect(memo.body.slice(memo.anchorStart, memo.anchorEnd)).toBe(
        memo.keyword,
      );
    }
  });
});

describe("シードの投入", () => {
  it("宣言した一件を入れると、メモから出所へ逆引きできる", async () => {
    const input = SEED_INPUTS[0];
    const created = await db.createQuestionWithTranscript(input);

    expect(created.question.body).toBe(input.body);
    expect(created.messages).toHaveLength(input.messages.length);
    expect(created.memos.length).toBeGreaterThan(0);

    const found = (await db.listMemosWithContext()).filter(
      (memo) => memo.question_id === created.question.id,
    );

    expect(found).toHaveLength(created.memos.length);

    for (const memo of found) {
      expect(memo.message_body.slice(memo.anchor_start, memo.anchor_end)).toBe(
        memo.keyword,
      );
      expect(memo.question_body).toBe(input.body);
    }
  });

  it("NODE_ENV=production では投入せず落ちる", async () => {
    vi.stubEnv("NODE_ENV", "production");

    try {
      await expect(seed()).rejects.toThrow(/ALLOW_PROD_SEED/);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("問いが既にある DB へは何も入れない", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    // 全件を数えると並行して走る他のテストの投入を拾うので、
    // 宣言した問い文（このファイルしか書かない）だけを数える。
    const seededBodies = SEED_INPUTS.map((input) => input.body);
    const countSeeded = async (): Promise<number> =>
      (await db.listQuestions()).filter((question) =>
        seededBodies.includes(question.body),
      ).length;

    try {
      const before = await countSeeded();
      const summary = await seed(); // 前のテストが入れた分が既に在る

      expect(before).toBeGreaterThan(0);
      expect(summary.questionIds).toEqual([]);
      expect(warn).toHaveBeenCalled();
      expect(await countSeeded()).toBe(before);
    } finally {
      warn.mockRestore();
    }
  });
});
