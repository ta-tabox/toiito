/**
 * 永続化層。Prisma + Postgres。
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
import { isQuestionStatus, type QuestionStatus } from "@/lib/question";
import type {
  Memo,
  MemoWithContext,
  Message,
  Question,
  Session,
  Speaker,
} from "@/lib/types";

/**
 * 接続は遅延（初回アクセス時）。
 * テストが env を差し替えてから初回呼び出しできるようにするため（HARNESS.md 設計制約 2）。
 * dev の hot reload で接続が増殖しないよう globalThis に載せる。
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/**
 * 遅延生成した接続を返す。DATABASE_URL が無ければ、ここで文脈付きに落とす。
 */
function db(): PrismaClient {
  if (!globalForPrisma.prisma) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error(
        "DATABASE_URL が未設定。ローカルは docker compose up -d のうえ .env.local に二本引く（HARNESS.md「ローカル Postgres」）",
      );
    }

    globalForPrisma.prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString }),

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

/** 接続を閉じる。テストと一度きりのスクリプトの後始末用（アプリの経路からは呼ばない）。 */
export async function disconnect(): Promise<void> {
  await globalForPrisma.prisma?.$disconnect();
  globalForPrisma.prisma = undefined;
}

/** 表示に使う問い文。現在の形があればそれ、無ければ原型。 */
export function questionText(q: Question): string {
  return q.current_form ?? q.body;
}

/** 問いの投入。初回セッションまで揃って初めて「投入済み」なので、一トランザクションで作る。 */
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
 * 問いの一覧。新しい順。
 *
 * 並べ替えの第二キーは常に seq（挿入順の通し番号）。
 * created_at だけでは同一マイクロ秒で順序が決まらず、id は乱数なので順序を持たない。
 * 時刻を第一キーに残すのは、移送してきた行の時系列を seq より優先させるため。
 */
export async function listQuestions(): Promise<Question[]> {
  return db().question.findMany({
    orderBy: [{ created_at: "desc" }, { seq: "desc" }],
  });
}

/** 問いを一件引く。無ければ undefined（見つからないことは正常系）。 */
export async function getQuestion(id: string): Promise<Question | undefined> {
  return (await db().question.findUnique({ where: { id } })) ?? undefined;
}

/**
 * 現在の形を更新する（原型 body は触らない）。
 * 空文字・空白のみは「現在の形なし」＝原型に戻す扱い。
 * 問いが無ければ例外（存在しない問いへの言い直しは呼び出し側の誤りで、黙って握らない）。
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

/** 問いの状態を進める。値域は QUESTION_STATUSES（lib 側でも検査する）。 */
export async function setQuestionStatus(
  questionId: string,
  status: QuestionStatus,
): Promise<Question> {
  if (!isQuestionStatus(status)) {
    throw new Error(`unknown question status: ${status}`);
  }

  return db().question.update({ where: { id: questionId }, data: { status } });
}

/** セッションを一件引く。無ければ undefined（見つからないことは正常系）。 */
export async function getSession(id: string): Promise<Session | undefined> {
  return (await db().session.findUnique({ where: { id } })) ?? undefined;
}

/** 最新の再訪。同時刻に並んだ場合は挿入順（seq）で決める。 */
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

/** 再訪。同じ問いに新しいセッションを足す（既存のセッションは畳まない）。 */
export async function createSession(questionId: string): Promise<Session> {
  return db().session.create({ data: { question_id: questionId } });
}

/**
 * セッション内の発話を投稿順で返す。
 * この順序が三者対話の中身そのものなので、時刻が並んだときは seq で決める。
 */
export async function listMessages(sessionId: string): Promise<Message[]> {
  return db().message.findMany({
    where: { session_id: sessionId },
    orderBy: [{ created_at: "asc" }, { seq: "asc" }],
  });
}

/**
 * 発話を追記する。messages は immutable で、更新も削除もしない。
 * メモのアンカーが本文のオフセットを指しているため（ARCHITECTURE.md「データモデル」）。
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
 * DB の check は本文長を知らないため `start >= 0 && end > start` しか守れない。
 * `anchor_end <= 本文長` は lib の責務なので、挿入前に検査して文脈付きで拒否する。
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

/** 対話画面のアンダーライン描画用。セッション内の全メモを投稿順で返す。 */
export async function listMemosForSession(sessionId: string): Promise<Memo[]> {
  return db().memo.findMany({
    where: { message: { session_id: sessionId } },
    orderBy: [{ created_at: "asc" }, { seq: "asc" }],
  });
}

/** メモからのセッション逆引き用。`memos → messages → sessions → questions` を一度に引く。 */
export async function listMemosWithContext(): Promise<MemoWithContext[]> {
  const rows = await db().memo.findMany({
    include: {
      message: { include: { session: { include: { question: true } } } },
    },
    orderBy: [{ created_at: "asc" }, { seq: "asc" }],
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
