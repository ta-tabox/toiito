import { seed } from "@scripts/seed/index.ts";
import { SEED_INPUTS } from "@scripts/seed/questions.ts";
import { afterAll, describe, expect, it, vi } from "vitest";
import * as db from "@/lib/db";

// 接続先はテスト専用データベース。
// vitest.config.ts が env で渡し、ケースごとに空にする（tests/setup/truncate.ts）。
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
  it("空の DB へ宣言を一式入れ、メモから出所へ逆引きできる", async () => {
    const summary = await seed();

    expect(summary.questionIds).toHaveLength(SEED_INPUTS.length);
    expect(summary.memos).toBeGreaterThan(0);

    const questions = await db.listQuestions();
    const memos = await db.listMemosWithContext();

    expect(questions.map((question) => question.body).sort()).toEqual(
      SEED_INPUTS.map((input) => input.body).sort(),
    );
    expect(memos).toHaveLength(summary.memos);

    for (const memo of memos) {
      expect(memo.message_body.slice(memo.anchor_start, memo.anchor_end)).toBe(
        memo.keyword,
      );
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

    try {
      await seed();
      const summary = await seed(); // 一度目の分が既に在る

      expect(summary.questionIds).toEqual([]);
      expect(warn).toHaveBeenCalled();
      expect(await db.listQuestions()).toHaveLength(SEED_INPUTS.length);
    } finally {
      warn.mockRestore();
    }
  });
});
