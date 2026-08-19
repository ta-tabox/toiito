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
 * 遅延生成した接続を返す。
 * Prisma に渡してから落とすと原因が env であることが読めないので、接続先が無ければここで落とす。
 */
function db(): PrismaClient {
  if (!globalForPrisma.prisma) {
    const connectionString = process.env.DATABASE_URL;

    if (!connectionString) {
      throw new Error(
        "環境変数 DATABASE_URL が設定されていないため、データベースへ接続できません。設定すべき変数の一覧は web/README.md の「環境変数」を参照してください。",
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
