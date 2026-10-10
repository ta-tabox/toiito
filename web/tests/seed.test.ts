import { reseedUsage, seed } from "@scripts/seed/index.ts";
import { OTHER_USER_INPUT, SEED_INPUTS } from "@scripts/seed/questions.ts";
import { SEED_USAGE } from "@scripts/seed/usage.ts";
import { SEED_USERS } from "@scripts/seed/users.ts";
import { createOwner } from "@tests/setup/owner";
import { afterAll, describe, expect, it, vi } from "vitest";
import * as db from "@/lib/db";
import type { OwnerId } from "@/lib/types";

afterAll(async () => {
  await db.disconnect();
});

/**
 * シードが入れたユーザーの ID を取得する。
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
      expect(memo.body.slice(memo.anchor.start, memo.anchor.end)).toBe(
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
    const seenByOwner = await db.getQuestion(owner, ownQuestion.id);
    const ownerQuestions = await db.listQuestions(owner);

    expect(ownQuestion.body).toBe(OTHER_USER_INPUT.body);
    expect(seenByOwner).toBeUndefined();
    expect(ownerQuestions.map((question) => question.body)).not.toContain(
      OTHER_USER_INPUT.body,
    );
  });

  it("一人目は管理者として入り、二人目は管理者でないまま入る", async () => {
    await seed();

    const first = await db.getUserByEmail(SEED_USERS[0].email);
    const second = await db.getUserByEmail(SEED_USERS[1].email);

    expect(first?.is_admin).toBe(true);
    expect(second?.is_admin).toBe(false);
  });

  it("利用量の見本は、宣言した利用者の行として入る", async () => {
    const summary = await seed();

    const first = await seededOwner(SEED_USERS[0].email);
    const second = await seededOwner(SEED_USERS[1].email);
    const firstLogs = await db.listUsageLogs(first);
    const secondLogs = await db.listUsageLogs(second);

    expect(summary.usageLogs).toBe(SEED_USAGE.length);
    expect(firstLogs).toHaveLength(
      SEED_USAGE.filter((row) => row.user === "first").length,
    );
    expect(secondLogs).toHaveLength(
      SEED_USAGE.filter((row) => row.user === "second").length,
    );
  });

  it("NODE_ENV=production では投入せず落ちる", async () => {
    vi.stubEnv("NODE_ENV", "production");

    try {
      await expect(seed()).rejects.toThrow(/ALLOW_PROD_SEED/);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("ユーザーが既にいる DB へは何も入れない", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    try {
      await seed();
      const summary = await seed(); // 一度目の分が既に在る

      expect(summary.questionIds).toEqual([]);
      expect(warn).toHaveBeenCalled();

      const owner = await seededOwner(SEED_USERS[0].email);
      const ownerQuestions = await db.listQuestions(owner);
      expect(ownerQuestions).toHaveLength(SEED_INPUTS.length);
    } finally {
      warn.mockRestore();
    }
  });
});

describe("利用量の見本の入れ直し", () => {
  it("見本を入れた後に入れ直しても、シードの二人の行は宣言の行数のまま増えない", async () => {
    await seed();

    const count = await reseedUsage();
    const first = await seededOwner(SEED_USERS[0].email);
    const second = await seededOwner(SEED_USERS[1].email);
    const firstLogs = await db.listUsageLogs(first);
    const secondLogs = await db.listUsageLogs(second);

    expect(count).toBe(SEED_USAGE.length);
    expect(firstLogs.length + secondLogs.length).toBe(SEED_USAGE.length);
  });

  it("入れ直した見本の時刻は、入れ直した時刻を基準にする", async () => {
    await seed();
    const first = await seededOwner(SEED_USERS[0].email);
    await db.deleteUsageLogs(first);
    const before = Date.now();

    await reseedUsage();

    const logs = await db.listUsageLogs(first);
    const newest = logs[logs.length - 1];

    // 見本の最新の行は数時間前に置かれるので、入れ直した時刻から一日以内に収まる。
    expect(before - newest.created_at.getTime()).toBeLessThan(
      24 * 60 * 60 * 1000,
    );
  });

  it("シードの二人以外の利用者の行は削除しない", async () => {
    await seed();
    const outsider = await createOwner("outsider@example.com");
    await db.recordUsage(outsider, {
      provider: "anthropic",
      model: "claude-sonnet-5",
      kind: "persona",
      input_tokens: 1,
      output_tokens: 1,
    });

    await reseedUsage();

    const outsiderLogs = await db.listUsageLogs(outsider);
    expect(outsiderLogs).toHaveLength(1);
  });

  it("シードのユーザーが居ない DB では、何も書かずに throw する", async () => {
    await expect(reseedUsage()).rejects.toThrow(/pnpm seed/);
  });
});
