import { seed } from "@scripts/seed.mts";
import { afterAll, describe, expect, it, vi } from "vitest";
import * as db from "@/lib/db";

// 接続先はテスト専用データベース。vitest.config.ts が env で渡す。
// seed は DATABASE_URL しか見ないので、投入先の指定はこの一点で済む。
// 表明は投入した問い（summary.questionIds）に絞る——同じ DB へ他のテストも並行して書く。
afterAll(async () => {
  await db.disconnect();
});

describe("シード投入", () => {
  it("問いと対話が入り、メモから出所へ逆引きできる", async () => {
    const summary = await seed();

    expect(summary.questionIds.length).toBeGreaterThanOrEqual(2);
    expect(summary.messages).toBeGreaterThan(summary.questionIds.length);

    const seeded = (await db.listMemosWithContext()).filter((memo) =>
      summary.questionIds.includes(memo.question_id),
    );

    expect(seeded).toHaveLength(summary.memos);
    expect(seeded.length).toBeGreaterThan(0);

    for (const memo of seeded) {
      // アンカーが keyword の位置を指していること。
      // ずれたまま入ると、UI では無関係な語に下線が付く。
      expect(memo.message_body.slice(memo.anchor_start, memo.anchor_end)).toBe(
        memo.keyword,
      );

      expect(memo.question_body).not.toBe("");
      expect(["human", "ai_a", "ai_b"]).toContain(memo.speaker);
    }
  });

  it("既存の行がある DB へは、足す前に警告を出す", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    try {
      await seed(); // 前のテストが入れた分が既に在る
      expect(warn).toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });
});
