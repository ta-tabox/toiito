/**
 * 永続化層。
 * Prisma + Postgres。
 * データモデルの意味の正は ARCHITECTURE.md、スキーマの正は prisma/schema.prisma。
 *
 * この層の外へ Prisma を出さない。
 * `@prisma/client` と生成型（`@/generated/prisma`）に触れてよいのはこのファイルだけ。
 * UI と Server Actions が受け取るのは types.ts のドメイン型に限る。
 * schema.prisma の値域を動かすと戻り値がドメイン型へ代入できなくなり、L0（tsc）が落ちる。
 *
 * repo 関数はすべて async。
 * DB 非依存の計算をここへ積まない（anchors.ts のような純関数層へ置く）。
 */

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { DATABASE_URL } from "@/lib/config";
import { isQuestionStatus, type QuestionStatus } from "@/lib/question";
import type {
  Memo,
  MemoWithContext,
  Message,
  Question,
  Session,
  SessionWithKeywords,
  Speaker,
} from "@/lib/types";

/**
 * 接続は遅延（初回アクセス時）。
 * モジュールを読み込んだだけで接続が張られると、DB へ触らない経路まで Postgres を要求する。
 * dev の hot reload で接続が増殖しないよう globalThis に載せる。
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/**
 * 遅延生成した接続を返す。
 * Prisma に渡してから落とすと原因が設定であることが読めないので、接続先が無ければここで落とす。
 */
function db(): PrismaClient {
  if (!globalForPrisma.prisma) {
    if (!DATABASE_URL) {
      throw new Error(
        "環境変数 DATABASE_URL が設定されていないため、データベースへ接続できません。設定すべき変数の一覧は web/README.md の「環境変数」を参照してください。",
      );
    }

    globalForPrisma.prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: DATABASE_URL }),

      // seq は並べ替えのためだけの列なので、読み出した行から落とす。
      // これで戻り値がドメイン型とちょうど一致し、BigInt が UI 側へ渡ることも起きない。
      omit: {
        question: { seq: true },
        session: { seq: true },
        message: { seq: true },
        memo: { seq: true },
      },
    });
  }

  return globalForPrisma.prisma;
}

/**
 * 接続を閉じる。
 *
 * テストとスクリプトの後始末用。
 * アプリの経路からは呼ばない（接続は使い回す）。
 */
export async function disconnect(): Promise<void> {
  await globalForPrisma.prisma?.$disconnect();
  globalForPrisma.prisma = undefined;
}

/**
 * 表示に使う問い文を返す。
 * 現在の形があればそれ、無ければ原型。
 */
export function questionText(q: Question): string {
  return q.current_form ?? q.body;
}

/**
 * 問いを作成する。
 * 最初のセッションも同時に作る。
 *
 * 一トランザクションにするのは、セッションを持たない問いを残さないため。
 * 対話画面は最新セッションが在ることを前提にしており、片方だけ在る状態は表示できない。
 */
export async function createQuestion(
  body: string,
): Promise<{ question: Question; session: Session }> {
  return db().$transaction(async (tx) => {
    const question = await tx.question.create({ data: { body } });
    const session = await tx.session.create({
      data: { question_id: question.id },
    });

    return { question, session };
  });
}

/**
 * 問いの一覧。
 * 新しい順。
 *
 * 並べ替えは created_at を第一キー、seq を第二キーにする。
 * 時刻が表示の意味を担い、seq は同着を割るためだけに使う（seq を置いた理由は schema.prisma の Message.seq）。
 */
export async function listQuestions(): Promise<Question[]> {
  return db().question.findMany({
    orderBy: [{ created_at: "desc" }, { seq: "desc" }],
  });
}

/**
 * 問いを一件引く。
 * 無ければ undefined を返す（見つからないことは正常系）。
 */
export async function getQuestion(id: string): Promise<Question | undefined> {
  return (await db().question.findUnique({ where: { id } })) ?? undefined;
}

/**
 * 問いの現在の形を更新する。
 * 原型（body）は触らない。
 *
 * 空文字・空白のみは「現在の形なし」として扱い、表示を原型へ戻す。
 * 存在しない問いへの言い直しは呼び出し側の誤りなので、問いが無ければ例外を投げる。
 * 黙って握らない。
 */
export async function setCurrentForm(
  questionId: string,
  form: string | null,
): Promise<Question> {
  const v = form?.trim() ? form.trim() : null;

  return db().question.update({
    where: { id: questionId },
    data: { current_form: v },
  });
}

/**
 * 問いの状態を更新する。
 *
 * 値域は QUESTION_STATUSES。
 * DB の enum が弾く前にここでも検査する。
 */
export async function setQuestionStatus(
  questionId: string,
  status: QuestionStatus,
): Promise<Question> {
  if (!isQuestionStatus(status)) {
    throw new Error(`unknown question status: ${status}`);
  }

  return db().question.update({ where: { id: questionId }, data: { status } });
}

/**
 * セッションを一件引く。
 * 無ければ undefined を返す（見つからないことは正常系）。
 */
export async function getSession(id: string): Promise<Session | undefined> {
  return (await db().session.findUnique({ where: { id } })) ?? undefined;
}

/**
 * 問いの最新セッションを引く。
 *
 * 対話画面が表示するのはこれ一つ。
 * 同時刻に並んだ場合は挿入順（seq）で決める。
 */
export async function latestSession(
  questionId: string,
): Promise<Session | undefined> {
  return (
    (await db().session.findFirst({
      where: { question_id: questionId },
      orderBy: [{ started_at: "desc" }, { seq: "desc" }],
    })) ?? undefined
  );
}

/**
 * 同じ問いに新しいセッションを足す（再訪）。
 *
 * 既存のセッションは畳まない。
 * 何度戻ったかが読み返せることが目的。
 */
export async function createSession(questionId: string): Promise<Session> {
  return db().session.create({ data: { question_id: questionId } });
}

/**
 * 問いのセッションを、そのセッションで付いたメモのキーワードごと古い順に返す。
 *
 * 日付だけの一覧ではどのセッションだったか思い出せないので、人間が印を付けた語を手掛かりとして添える。
 * 同じ語に何度も印を付けることがあるため、キーワードは重複を落として返す。
 * 並びは古い順で、latestSession（新しい順の先頭）とは逆になる。
 * 読み返しは投入からの順に辿るので、切り替え口に出す回数（1 回目・2 回目）と並びが一致する方を採る。
 * セッションごとにメモを引くと N+1 になるので、メモは問い単位で一度に引いてから束ね直す。
 */
export async function listSessionsWithKeywords(
  questionId: string,
): Promise<SessionWithKeywords[]> {
  const sessions = await db().session.findMany({
    where: { question_id: questionId },
    orderBy: [{ started_at: "asc" }, { seq: "asc" }],
  });

  const memos = await db().memo.findMany({
    where: { message: { session: { question_id: questionId } } },
    select: { keyword: true, message: { select: { session_id: true } } },
    orderBy: [{ created_at: "asc" }, { seq: "asc" }],
  });

  return sessions.map((session) => ({
    ...session,
    keywords: [
      ...new Set(
        memos
          .filter((memo) => memo.message.session_id === session.id)
          .map((memo) => memo.keyword),
      ),
    ],
  }));
}

/**
 * セッション内の発話を投稿順で返す。
 *
 * この順序が三者対話の中身そのものなので、時刻が並んだときは seq で決める。
 */
export async function listMessages(sessionId: string): Promise<Message[]> {
  return db().message.findMany({
    where: { session_id: sessionId },
    orderBy: [{ created_at: "asc" }, { seq: "asc" }],
  });
}

/**
 * 発話を追記する。
 *
 * messages は immutable で、更新も削除もしない。
 * メモのアンカーが本文のオフセットを指しており、本文が動くと別の位置を指し始めるため（ARCHITECTURE.md「データモデル」）。
 */
export async function addMessage(
  sessionId: string,
  speaker: Speaker,
  body: string,
): Promise<Message> {
  return db().message.create({
    data: { session_id: sessionId, speaker, body },
  });
}

/**
 * メッセージ本文の一部にメモを付ける。
 *
 * DB の check は本文長を知らないため `start >= 0 && end > start` しか守れない。
 * `anchor_end <= 本文長` はここの責務なので、挿入前に検査して文脈付きで拒否する。
 */
export async function addMemo(
  messageId: string,
  anchorStart: number,
  anchorEnd: number,
  keyword: string,
  note?: string,
): Promise<Memo> {
  const message = await db().message.findUnique({ where: { id: messageId } });

  if (!message) {
    throw new Error(`addMemo: message not found: ${messageId}`);
  }

  if (anchorEnd > message.body.length) {
    throw new Error(
      `addMemo: anchor_end (${anchorEnd}) exceeds body length (${message.body.length}) of message ${messageId}`,
    );
  }

  return db().memo.create({
    data: {
      message_id: messageId,
      anchor_start: anchorStart,
      anchor_end: anchorEnd,
      keyword,
      note: note ?? null,
    },
  });
}

/**
 * セッション内の全メモを投稿順で返す。
 *
 * 対話画面のアンダーライン描画用。
 */
export async function listMemosForSession(sessionId: string): Promise<Memo[]> {
  return db().memo.findMany({
    where: { message: { session_id: sessionId } },
    orderBy: [{ created_at: "asc" }, { seq: "asc" }],
  });
}

/**
 * 全メモを、出所の発話・セッション・問いごと新しい順に返す。
 *
 * メモからの逆引き用。
 * `memos → messages → sessions → questions` を一度に引き、N+1 に割らない。
 * 古い順で読む用途が無く、件数を絞るときも先頭から取れば新しい分が残るので、並びは新しい順で確定させる。
 * 表示側で反転すると、絞った後の並べ替えになって古い分が残る。
 */
export async function listMemosWithContext(): Promise<MemoWithContext[]> {
  const rows = await db().memo.findMany({
    include: {
      message: { include: { session: { include: { question: true } } } },
    },
    orderBy: [{ created_at: "desc" }, { seq: "desc" }],
  });

  return rows.map(({ message, ...memo }) => ({
    ...memo,
    session_id: message.session_id,
    question_id: message.session.question_id,
    question_body: message.session.question.body,
    speaker: message.speaker,
    message_body: message.body,
  }));
}

/** 対話とメモをまとめて作るときの、一件のメモ。 */
export type MemoInput = {
  anchorStart: number;
  anchorEnd: number;
  keyword: string;
  note?: string;
};

/** 対話とメモをまとめて作るときの、一件の発話。 */
export type MessageInput = {
  speaker: Speaker;
  body: string;
  memos?: MemoInput[];
};

/**
 * 問いを対話ごと作るときの入力。
 *
 * currentForm と status は、既定（原型のまま・new）から動かすときだけ渡す。
 * メモの範囲（anchorStart / anchorEnd）は呼び出し側が決める。
 * 本文中の位置を求めるのは DB 非依存の計算で、この層の仕事ではない。
 */
export type QuestionInput = {
  body: string;
  currentForm?: string;
  status?: QuestionStatus;
  messages: MessageInput[];
};

/**
 * 問いを、初回セッションの対話とメモごと作る。
 *
 * 書き込みの順序と経路はアプリと同じ（createQuestion → addMessage → addMemo）。
 * 投入の口を別に作ると、アプリで起きることが投入したデータでは起きなくなり、画面で確かめている状態が実際の状態とずれる。
 * 一つのトランザクションには畳まない。
 * 畳むには repo 関数を tx 版へ組み直すことになり、アプリと同じ経路を通るという上の性質を失う。
 */
export async function createQuestionWithTranscript(
  input: QuestionInput,
): Promise<{
  question: Question;
  session: Session;
  messages: Message[];
  memos: Memo[];
}> {
  const created = await createQuestion(input.body);
  const session = created.session;
  let question = created.question;

  if (input.currentForm !== undefined) {
    question = await setCurrentForm(question.id, input.currentForm);
  }

  if (input.status !== undefined) {
    question = await setQuestionStatus(question.id, input.status);
  }

  const messages: Message[] = [];
  const memos: Memo[] = [];

  for (const messageInput of input.messages) {
    const message = await addMessage(
      session.id,
      messageInput.speaker,
      messageInput.body,
    );
    messages.push(message);

    for (const memoInput of messageInput.memos ?? []) {
      memos.push(
        await addMemo(
          message.id,
          memoInput.anchorStart,
          memoInput.anchorEnd,
          memoInput.keyword,
          memoInput.note,
        ),
      );
    }
  }

  return { question, session, messages, memos };
}

/**
 * DB の準備不足に由来する Prisma の失敗。
 *
 * P1001 サーバへ届かない / P1003 データベースが無い / P2021 テーブルが無い。
 */
const SETUP_ERROR_CODES = new Set(["P1001", "P1003", "P2021"]);

/**
 * DB の準備ができていない失敗なら、手当てを促す文へ包み直す。
 *
 * Prisma のエラーコードを読めるのはこの層だけなので、判定もここが持つ（この層の外へ Prisma を出さない）。
 * それ以外の失敗はそのまま返す。
 * 原因を伏せると、準備の問題でない失敗まで docker を疑わせることになる。
 */
export function withSetupGuidance(cause: unknown): unknown {
  const code =
    typeof cause === "object" && cause !== null && "code" in cause
      ? cause.code
      : undefined;

  if (typeof code !== "string" || !SETUP_ERROR_CODES.has(code)) {
    return cause;
  }

  return new Error(
    "データベースの準備ができていない。docker compose up -d で立て、web/ で pnpm exec prisma migrate deploy を積んでから再実行する（HARNESS.md「ローカル Postgres」）",
    { cause },
  );
}
