// 縦一本（問い投入 → 二体応答 → メモ → 逆引き）が Prisma 経由で通ることの検査。
// actions.ts が組み立てている順序をそのまま lib で辿る。
// Server Actions 自体は next/cache・next/navigation を掴むので、配線の検証は L3（next build）に任せる。

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { callPersona } from "@/lib/claude";
import * as db from "@/lib/db";
import { loadPersona } from "@/lib/personas";

beforeAll(() => {
  process.env.TOIITO_FAKE_AI = "1";
});

afterAll(async () => {
  await db.disconnect();
});

describe("縦一本", () => {
  it("問いを投げると二体が応答し、その語にメモを付けて逆引きできる", async () => {
    const { question, session } = await db.createQuestion(
      "速さを求めることは、何を失うことなのか",
    );

    // 人間の口火 → ai_a（具体）→ ai_b（抽象）の逐次。
    // ai_b は ai_a の発話も含む transcript を受け取る（並列にしない理由）。
    await db.addMessage(session.id, "human", "急ぐほど問いが痩せる気がする");

    const aiA = await callPersona(
      loadPersona("ai_a"),
      question,
      await db.listMessages(session.id),
    );
    await db.addMessage(session.id, "ai_a", aiA);

    const transcriptForB = await db.listMessages(session.id);
    const aiB = await callPersona(
      loadPersona("ai_b"),
      question,
      transcriptForB,
    );
    await db.addMessage(session.id, "ai_b", aiB);

    expect(transcriptForB.map((m) => m.speaker)).toEqual(["human", "ai_a"]);

    const messages = await db.listMessages(session.id);
    expect(messages.map((m) => m.speaker)).toEqual(["human", "ai_a", "ai_b"]);
    expect(aiA).toContain("急ぐほど問いが痩せる気がする");
    expect(aiA).not.toBe(aiB); // 二体が別のペルソナとして応答している

    // 応答本文の一部を選択してメモを残す
    const target = messages[1];
    const memo = await db.addMemo(target.id, 0, 4, target.body.slice(0, 4));

    expect(await db.listMemosForSession(session.id)).toHaveLength(1);

    // メモからセッションと問いへ逆引きできる
    const found = (await db.listMemosWithContext()).find(
      (m) => m.id === memo.id,
    );

    expect(found?.session_id).toBe(session.id);
    expect(found?.question_body).toBe("速さを求めることは、何を失うことなのか");
    expect(found?.speaker).toBe("ai_a");
  });
});
