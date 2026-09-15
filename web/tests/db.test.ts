import { randomUUID } from "node:crypto";
import { createOwner } from "@tests/setup/owner";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { parseAnchor } from "@/lib/anchors";
import * as db from "@/lib/db";
import { QUESTION_STATUSES } from "@/lib/question";
import type { Anchor, MaterialDraft, OwnerId } from "@/lib/types";

afterAll(async () => {
  await db.disconnect();
});

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
    const latest = await db.latestSession(owner, question.id);

    expect(question.body).toBe("なぜ速さを求めるのか");
    expect(question.status).toBe("new");
    expect(question.current_form).toBeNull();
    expect(session.question_id).toBe(question.id);
    expect(latest?.id).toBe(session.id);
  });

  it("再訪で新セッションを作ると latestSession が入れ替わる", async () => {
    const { question, session: first } = await db.createQuestion(
      owner,
      "問い2",
    );
    const second = await db.createSession(owner, question.id);
    const latest = await db.latestSession(owner, question.id);

    expect(latest?.id).toBe(second.id);
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
            memos: [{ anchor: parseAnchor(0, 2), keyword: "一度" }],
          },
        ],
      },
    );
    const second = await db.createSession(owner, question.id);
    const laterMessage = await db.addMessage(owner, second.id, {
      speaker: "ai_a",
      body: "二度目の応答",
    });
    await db.addMemo(owner, laterMessage.id, {
      anchor: parseAnchor(0, 2),
      keyword: "二度",
    });

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
    await db.addMemo(owner, messages[0].id, {
      anchor: parseAnchor(0, 2),
      keyword: "惰性",
    });
    await db.addMemo(owner, messages[0].id, {
      anchor: parseAnchor(3, 5),
      keyword: "惰性",
    });
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
      const updated = await db.setQuestionStatus(owner, question.id, s);
      expect(updated.status).toBe(s);
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
    ).rejects.toThrow(/問いの状態が QUESTION_STATUSES に無い/);

    const unchanged = await db.getQuestion(owner, question.id);
    expect(unchanged?.status).toBe("new");
  });
});

describe("messages", () => {
  it("三者の発話が投稿順で取れる", async () => {
    const { session } = await db.createQuestion(owner, "問い3");

    await db.addMessage(owner, session.id, { speaker: "human", body: "口火" });
    await db.addMessage(owner, session.id, {
      speaker: "ai_a",
      body: "具体の応答",
    });
    await db.addMessage(owner, session.id, {
      speaker: "ai_b",
      body: "抽象の応答",
    });
    const msgs = await db.listMessages(owner, session.id);

    expect(msgs.map((m) => m.speaker)).toEqual(["human", "ai_a", "ai_b"]);
  });

  it("不正な speaker は enum で弾かれる", async () => {
    const { session } = await db.createQuestion(owner, "問い4");

    await expect(
      db.addMessage(owner, session.id, {
        // @ts-expect-error 不変条件をスキーマ側でも表明していることの検証
        speaker: "ai_c",
        body: "三体目はいない",
      }),
    ).rejects.toThrow();
  });
});

describe("memos", () => {
  it("正常系: 選択区間から作れて note は保存される", async () => {
    const { session } = await db.createQuestion(owner, "問い5");
    const message = await db.addMessage(owner, session.id, {
      speaker: "ai_a",
      body: "これは本文である",
    });
    const memo = await db.addMemo(owner, message.id, {
      anchor: parseAnchor(2, 4),
      keyword: "本文",
      note: "気になる語",
    });

    expect(memo.message_id).toBe(message.id);
    expect(memo.anchor_start).toBe(2);
    expect(memo.anchor_end).toBe(4);
    expect(memo.keyword).toBe("本文");
    expect(memo.note).toBe("気になる語");
  });

  it("note は省略可で、省略時は null になる", async () => {
    const { session } = await db.createQuestion(owner, "問い6");
    const message = await db.addMessage(owner, session.id, {
      speaker: "ai_b",
      body: "省略のテスト文",
    });
    const memo = await db.addMemo(owner, message.id, {
      anchor: parseAnchor(0, 2),
      keyword: "省略",
    });

    expect(memo.note).toBeNull();
  });

  it("anchor_end が本文長を超える場合は lib 側で拒否する", async () => {
    const { session } = await db.createQuestion(owner, "問い7");
    const message = await db.addMessage(owner, session.id, {
      speaker: "human",
      body: "五文字の文",
    });

    expect(message.body.length).toBe(5);
    await expect(
      db.addMemo(owner, message.id, {
        anchor: parseAnchor(0, 100),
        keyword: "はみ出し",
      }),
    ).rejects.toThrow(/anchor_end が本文長を超えている/);
  });

  it("空区間・負のアンカーは check 制約で弾かれる", async () => {
    const { session } = await db.createQuestion(owner, "問い7b");
    const message = await db.addMessage(owner, session.id, {
      speaker: "human",
      body: "区間の検査文",
    });

    // `parseAnchor` を通らない範囲を型の変換で作り、DB の check 制約が単独でも範囲を拒否することを見る。
    await expect(
      db.addMemo(owner, message.id, {
        anchor: { start: 2, end: 2 } as Anchor,
        keyword: "空区間",
      }),
    ).rejects.toThrow();
    await expect(
      db.addMemo(owner, message.id, {
        anchor: { start: -1, end: 3 } as Anchor,
        keyword: "負の開始",
      }),
    ).rejects.toThrow();
  });

  it("存在しない message にはメモを付けられない", async () => {
    await expect(
      db.addMemo(owner, randomUUID(), {
        anchor: parseAnchor(0, 1),
        keyword: "不整合",
      }),
    ).rejects.toThrow(/発話が見つからない/);
  });

  it("listMemosForSession はそのセッションのメモだけを返す", async () => {
    const { session: sessionA } = await db.createQuestion(owner, "問い8-A");
    const { session: sessionB } = await db.createQuestion(owner, "問い8-B");
    const msgA = await db.addMessage(owner, sessionA.id, {
      speaker: "ai_a",
      body: "セッションAの本文",
    });
    const msgB = await db.addMessage(owner, sessionB.id, {
      speaker: "ai_a",
      body: "セッションBの本文",
    });
    const memoA = await db.addMemo(owner, msgA.id, {
      anchor: parseAnchor(0, 3),
      keyword: "A",
    });
    await db.addMemo(owner, msgB.id, {
      anchor: parseAnchor(0, 3),
      keyword: "B",
    });

    const listed = await db.listMemosForSession(owner, sessionA.id);

    expect(listed.map((m) => m.id)).toEqual([memoA.id]);
  });

  it("listMemosWithContext は memos→messages→sessions→questions の join が正しく効く", async () => {
    const { question, session } = await db.createQuestion(
      owner,
      "問い9: 逆引き元の問い",
    );
    const message = await db.addMessage(owner, session.id, {
      speaker: "ai_b",
      body: "逆引き対象の本文",
    });
    const memo = await db.addMemo(owner, message.id, {
      anchor: parseAnchor(0, 4),
      keyword: "逆引き",
    });

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
    const message = await db.addMessage(owner, session.id, {
      speaker: "ai_a",
      body: "先の語と後の語",
    });
    const older = await db.addMemo(owner, message.id, {
      anchor: parseAnchor(0, 2),
      keyword: "先の語",
    });
    const newer = await db.addMemo(owner, message.id, {
      anchor: parseAnchor(4, 6),
      keyword: "後の語",
    });

    const listed = await db.listMemosWithContext(owner);
    const ids = listed.map((m) => m.id);

    expect(ids).toEqual([newer.id, older.id]);
  });
});

describe("所有権", () => {
  /** アクセス権の無い相手と、その人が持つ問い一件・発話一件・メモ一件。 */
  async function otherWithOneOfEach() {
    const other = await createOwner("other@example.com");
    const { question, session, messages, memos } =
      await db.createQuestionWithTranscript(other, {
        body: "アクセス権の無い問い",
        messages: [
          {
            speaker: "ai_a",
            body: "アクセス権の無い発話",
            memos: [{ anchor: parseAnchor(0, 2), keyword: "アクセス" }],
          },
        ],
      });

    return { other, question, session, message: messages[0], memo: memos[0] };
  }

  it("読み出しは、アクセス権の無い問いを一件も返さない", async () => {
    const { other, question, session, message } = await otherWithOneOfEach();
    await db.createQuestion(owner, "自分の問い");

    // 行が在るときだけ意味のある検査になるので、`other` に一件作ってから読む。
    await db.savePendingBody(other, session.id, "アクセス権の無い未送信の発話");

    const questions = await db.listQuestions(owner);
    const othersQuestion = await db.getQuestion(owner, question.id);
    const othersSession = await db.getSession(owner, session.id);
    const latest = await db.latestSession(owner, question.id);
    const sessions = await db.listSessionsWithKeywords(owner, question.id);
    const messages = await db.listMessages(owner, session.id);
    const memosInSession = await db.listMemosForSession(owner, session.id);
    const pending = await db.getPendingBody(owner, session.id);
    const memosWithContext = await db.listMemosWithContext(owner);

    expect(questions.map((q) => q.body)).toEqual(["自分の問い"]);
    expect(othersQuestion).toBeUndefined();
    expect(othersSession).toBeUndefined();
    expect(latest).toBeUndefined();
    expect(sessions).toEqual([]);
    expect(messages).toEqual([]);
    expect(memosInSession).toEqual([]);
    expect(pending).toBeUndefined();
    expect(memosWithContext.map((m) => m.message_body)).not.toContain(
      message.body,
    );
  });

  it("書き込みは、アクセス権の無い問い・セッション・発話のどれへも届かない", async () => {
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
      db.addMessage(owner, session.id, { speaker: "human", body: "割り込み" }),
    ).rejects.toThrow(/セッションが見つからない/);
    await expect(
      db.savePendingBody(owner, session.id, "割り込み"),
    ).rejects.toThrow(/セッションが見つからない/);
    await expect(
      db.commitTurn(owner, session.id, {
        human: "割り込み",
        ai_a: "具体の応答",
        ai_b: "抽象の応答",
      }),
    ).rejects.toThrow(/セッションが見つからない/);
    await expect(
      db.addMemo(owner, message.id, {
        anchor: parseAnchor(0, 2),
        keyword: "横取り",
      }),
    ).rejects.toThrow(/発話が見つからない/);
  });

  it("アクセス権の無い問いと存在しない問いは、同じ失敗になる", async () => {
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

describe("materials", () => {
  /** 一つの論点について、立場の違う外部の材料が二件ある下書き。 */
  const drafts: MaterialDraft[] = [
    {
      kind: "external",
      topic: "速さと余白",
      body: "速さは余白を生むとする調査",
      source_url: "https://example.com/speed-creates-slack",
      created_by: "auto",
    },
    {
      kind: "external",
      topic: "速さと余白",
      body: "速さは余白を削るとする調査",
      source_url: "https://example.com/speed-consumes-slack",
      created_by: "auto",
    },
  ];

  it("status が new の問いに材料を付けると、行が付与の順で入り、status が stocked になる", async () => {
    const { question } = await db.createQuestion(owner, "なぜ速さを求めるのか");

    await db.addMaterials(owner, question.id, drafts);

    const materials = await db.listMaterials(owner, question.id);
    const reread = await db.getQuestion(owner, question.id);

    expect(materials.map((material) => material.body)).toEqual(
      drafts.map((draft) => draft.body),
    );
    expect(reread?.status).toBe("stocked");
  });

  it("status が holding の問いに材料を付けても、status は holding のまま変わらない", async () => {
    const { question } = await db.createQuestion(owner, "持ち続ける問い");
    await db.setQuestionStatus(owner, question.id, "holding");

    await db.addMaterials(owner, question.id, drafts);

    const materials = await db.listMaterials(owner, question.id);
    const reread = await db.getQuestion(owner, question.id);

    expect(materials).toHaveLength(drafts.length);
    expect(reread?.status).toBe("holding");
  });

  it("owner 以外が所有する問いへの付与は throw し、行も status も変わらない", async () => {
    const other = await createOwner("other@example.com");
    const { question } = await db.createQuestion(other, "アクセス権の無い問い");

    await expect(db.addMaterials(owner, question.id, drafts)).rejects.toThrow(
      /問いが見つからない/,
    );

    const materials = await db.listMaterials(other, question.id);
    const reread = await db.getQuestion(other, question.id);

    expect(materials).toEqual([]);
    expect(reread?.status).toBe("new");
  });

  it("空配列を渡すと、材料の行は入らず、status も new のまま変わらない", async () => {
    const { question } = await db.createQuestion(owner, "材料の無い問い");

    const added = await db.addMaterials(owner, question.id, []);

    const materials = await db.listMaterials(owner, question.id);
    const reread = await db.getQuestion(owner, question.id);

    expect(added).toEqual([]);
    expect(materials).toEqual([]);
    expect(reread?.status).toBe("new");
  });
});
