import { seed } from "@scripts/seed/index.ts";
import { OTHER_USER_INPUT, SEED_INPUTS } from "@scripts/seed/questions.ts";
import { SEED_USERS } from "@scripts/seed/users.ts";
import { afterAll, describe, expect, it, vi } from "vitest";
import * as db from "@/lib/db";
import type { OwnerId } from "@/lib/types";

// 接続先はテスト専用データベース。
// vitest.config.ts が env で渡し、ケースごとに空にする（tests/setup/truncate.ts）。
afterAll(async () => {
  await db.disconnect();
});

/**
 * シードが入れた利用者の ID を引く。
 *
 * 所有者を作るのはシード自身なので、他のテストのように先回りして作らない。
 */
async function seededOwner(email: string): Promise<OwnerId> {
  const user = await db.getUserByEmail(email);

  if (!user) {
    throw new Error(`シードが ${email} を入れていない`);
  }

  return user.id;
}

describe("シードの宣言", () => {
  it("メモの範囲が本文中のキーワードを指す", () => {
    const memos = [...SEED_INPUTS, OTHER_USER_INPUT].flatMap((question) =>
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

    expect(summary.users).toBe(SEED_USERS.length);
    expect(summary.questionIds).toHaveLength(SEED_INPUTS.length + 1);
    expect(summary.memos).toBeGreaterThan(0);

    const owner = await seededOwner(SEED_USERS[0].email);
    const questions = await db.listQuestions(owner);
    const memos = await db.listMemosWithContext(owner);

    expect(questions.map((question) => question.body).sort()).toEqual(
      SEED_INPUTS.map((input) => input.body).sort(),
    );

    // 集計は二人分なので、二人目の分を引いた数と突き合わせる。
    const otherMemos = OTHER_USER_INPUT.messages.reduce(
      (count, message) => count + (message.memos?.length ?? 0),
      0,
    );
    expect(memos).toHaveLength(summary.memos - otherMemos);

    for (const memo of memos) {
      expect(memo.message_body.slice(memo.anchor_start, memo.anchor_end)).toBe(
        memo.keyword,
      );
    }
  });

  it("二人目の問いは、一人目からは一件も見えない", async () => {
    await seed();

    const owner = await seededOwner(SEED_USERS[0].email);
    const other = await seededOwner(SEED_USERS[1].email);

    const [ownQuestion] = await db.listQuestions(other);

    expect(ownQuestion.body).toBe(OTHER_USER_INPUT.body);
    expect(await db.getQuestion(owner, ownQuestion.id)).toBeUndefined();
    expect(
      (await db.listQuestions(owner)).map((question) => question.body),
    ).not.toContain(OTHER_USER_INPUT.body);
  });

  it("NODE_ENV=production では投入せず落ちる", async () => {
    vi.stubEnv("NODE_ENV", "production");

    try {
      await expect(seed()).rejects.toThrow(/ALLOW_PROD_SEED/);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("利用者が既にいる DB へは何も入れない", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    try {
      await seed();
      const summary = await seed(); // 一度目の分が既に在る

      expect(summary.questionIds).toEqual([]);
      expect(warn).toHaveBeenCalled();

      const owner = await seededOwner(SEED_USERS[0].email);
      expect(await db.listQuestions(owner)).toHaveLength(SEED_INPUTS.length);
    } finally {
      warn.mockRestore();
    }
  });
});
