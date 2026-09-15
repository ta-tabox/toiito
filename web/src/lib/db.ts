/**
 * 永続化層（Prisma + Postgres）。
 * データモデルの意味の正は docs/ARCHITECTURE.md、スキーマの正は prisma/schema.prisma。
 *
 * `db.ts` の外へ Prisma を出さない。
 * `@prisma/client` と生成型（`@/generated/prisma`）に触れてよいのは `db.ts` だけで、UI と Server Actions が受け取るのは `types.ts` のドメイン型に限る。
 * DB 非依存の計算を `db.ts` へ積まない（`anchors.ts` のような純関数層へ置く）。
 *
 * **アクセス権のないリソースを拒否するのは `db.ts` で、DB の制約（RLS）ではない**（理由は `docs/adr/0030-ownership-granularity.md`）。
 * 所有者を受け取る repo 関数は、読みも書きも所有者の条件を必ず where に置く（取得してから user_id を比べる形は、比べ忘れても `tsc` が通ってしまう）。
 * 所有者の列を持つのは `questions` だけで、下位のテーブルは親を辿って判定する。
 */

import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { type Prisma, PrismaClient } from "@/generated/prisma/client";
import { DATABASE_URL } from "@/lib/config";
import { MESSAGE_BODY_MAX_LENGTH } from "@/lib/message";
import { isQuestionStatus, type QuestionStatus } from "@/lib/question";
import type {
  AdminUserRow,
  Anchor,
  Material,
  MaterialDraft,
  Memo,
  MemoWithContext,
  Message,
  OwnerId,
  Question,
  Session,
  SessionWithKeywords,
  User,
  Utterance,
} from "@/lib/types";

/**
 * 接続は遅延（初回アクセス時）。
 * モジュールを読み込んだだけで接続が張られると、DB へ触らない経路まで Postgres を要求する。
 * dev の hot reload で接続が増殖しないよう globalThis に載せる。
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/**
 * 遅延生成した接続を返す。
 * Prisma に渡してから失敗すると原因が設定であることが読めないので、`DATABASE_URL` が無ければ `db` が throw する。
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

      // 表示にも意味の判断にも使わない列は、取得した行から削除する。
      // seq は並べ替えのため、user_id は絞り込みのためだけに在り、どちらもこの層の内側で閉じる。
      // omit で戻り値がドメイン型とちょうど一致し、BigInt が UI 側へ渡ることも起きない。
      omit: {
        question: { seq: true, user_id: true },
        dialogueSession: { seq: true },
        message: { seq: true },
        memo: { seq: true },
        material: { seq: true },
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
 * `current_form` があればその値、無ければ `body`。
 */
export function questionText(q: Question): string {
  return q.current_form ?? q.body;
}

/**
 * ドメイン型の `User` へ写すときに `user` 表から SELECT する列。
 */
const USER_COLUMNS = {
  id: true,
  email: true,
  name: true,
  is_admin: true,
} as const satisfies Prisma.UserSelect;

/**
 * `user` 表を SELECT した直後の行を、ドメイン型の `User` へ写す。
 *
 * `OwnerId` へ変換してよいのは `fromUserRow` だけで、`fromUserRow` を経由したことが「その文字列は `user.id` である」の唯一の根拠になる。
 * URL やフォームから来た文字列は `fromUserRow` を経由しないので、`OwnerId` にならない。
 */
function fromUserRow(row: {
  id: string;
  email: string;
  name: string;
  is_admin: boolean;
}): User {
  return { ...row, id: row.id as OwnerId };
}

/**
 * Better Auth のアダプタへ渡す、アプリと同じ Prisma のクライアントを返す。
 *
 * 呼んでよいのは `lib/auth/index.ts` だけである。
 * Better Auth が四表を読み書きするのにクライアントそのものを要求するので、Prisma を `db.ts` の外へ出さないという禁止則（`docs/ARCHITECTURE.md`「技術スタック」）の例外として開けてある。
 */
export function authDatabaseClient(): PrismaClient {
  return db();
}

/**
 * `user` 表から email で 1 件取得する。
 *
 * 行が無ければ throw せず undefined を返す。
 * 呼び出し側（開発用シード）が「行がまだ無い」と「取得できた」を分けて扱うため。
 */
export async function getUserByEmail(email: string): Promise<User | undefined> {
  const row = await db().user.findUnique({
    where: { email },
    select: USER_COLUMNS,
  });

  return row ? fromUserRow(row) : undefined;
}

/**
 * `user` 表から id で 1 件取得する。
 * 行が無ければ throw せず undefined を返す。
 *
 * 呼ぶのは、Better Auth のセッションが名指しするユーザーを解決する 2 箇所である（`current-user.ts` と `lib/auth/index.ts` の許可リストの照合）。
 * セッションに写った値でなく `user` 表を毎回 SELECT するのは、行を書き換えれば次のリクエストから効くようにするため。
 */
export async function getUserById(id: string): Promise<User | undefined> {
  const row = await db().user.findUnique({
    where: { id },
    select: USER_COLUMNS,
  });

  return row ? fromUserRow(row) : undefined;
}

/**
 * ユーザーを作る。
 *
 * 本番の経路では Better Auth が四表を書くので、`createUser` を呼ぶのは開発用シードとテストだけである。
 * `user.id` は文字列でありさえすればよいので、id は Better Auth の生成に合わせず UUID を振る。
 */
export async function createUser(user: {
  email: string;
  name: string;
  is_admin?: boolean;
}): Promise<User> {
  const row = await db().user.create({
    data: { id: randomUUID(), ...user },
    select: USER_COLUMNS,
  });

  return fromUserRow(row);
}

/**
 * 全ユーザーを、ユーザーごとの問いの数とセッションの数と一緒に、登録の古い順で返す。
 * 問いの本文も発話も返さない。
 *
 * 呼び出し側は `requireAdmin` を通してから呼ぶ。
 * `user.sessions` は Better Auth のログインのセッションなので、対話のセッションの数は問いごとの数を足して求める。
 */
export async function listUsersForAdmin(): Promise<AdminUserRow[]> {
  const rows = await db().user.findMany({
    select: {
      id: true,
      email: true,
      name: true,
      questions: { select: { _count: { select: { sessions: true } } } },
    },
    orderBy: [{ createdAt: "asc" }, { email: "asc" }],
  });

  return rows.map(({ questions, ...user }) => ({
    ...user,
    question_count: questions.length,
    session_count: questions.reduce(
      (count, question) => count + question._count.sessions,
      0,
    ),
  }));
}

/**
 * 問いを作成する。
 * 最初のセッションも同時に作る。
 *
 * 一トランザクションにするのは、セッションを持たない問いを残さないため。
 * 対話画面は最新セッションが在ることを前提にしており、片方だけ在る状態は表示できない。
 */
export async function createQuestion(
  owner: OwnerId,
  body: string,
): Promise<{ question: Question; session: Session }> {
  return db().$transaction(async (tx) => {
    const question = await tx.question.create({
      data: { user_id: owner, body },
    });
    const session = await tx.dialogueSession.create({
      data: { question_id: question.id },
    });

    return { question, session };
  });
}

/**
 * 所有者の問いの一覧。
 * 新しい順。
 *
 * 並べ替えは created_at を第一キー、seq を第二キーにする。
 * 時刻が表示の意味を担い、seq は同着を割るためだけに使う（seq を置いた理由は schema.prisma の Message.seq）。
 */
export async function listQuestions(owner: OwnerId): Promise<Question[]> {
  return db().question.findMany({
    where: { user_id: owner },
    orderBy: [{ created_at: "desc" }, { seq: "desc" }],
  });
}

/**
 * id で問いを 1 件取得する。
 * `id` に一致する行が無ければ undefined を返し、owner 以外が所有する問いも同じ undefined を返す。
 *
 * 二つを違う応答にすると、URL の id を差し替えるだけで在ることが読める。
 * findUnique の where は一意な列しか受け取らず `user_id` の条件を足せないので、主キーで取得する場合も findFirst を使う。
 */
export async function getQuestion(
  owner: OwnerId,
  id: string,
): Promise<Question | undefined> {
  const question = await db().question.findFirst({
    where: { id, user_id: owner },
  });

  return question ?? undefined;
}

/**
 * その問いが所有者のものであることを確かめ、違えば投げる。
 * アクセス権のない問いと存在しない問いを、同じ失敗にする。
 *
 * 呼ぶのは、問いの列を更新する前（`setCurrentForm`・`setQuestionStatus`）である。
 * 読み出しは where に条件を置けば済むが、`create` と `update` は所有者の条件を where へ入れられないので先に確かめる。
 */
async function requireOwnedQuestion(
  owner: OwnerId,
  questionId: string,
): Promise<void> {
  const question = await db().question.findFirst({
    where: { id: questionId, user_id: owner },
    select: { id: true },
  });

  if (!question) {
    throw new Error(`問いが見つからない: ${questionId}`);
  }
}

/**
 * そのセッションが所有者のものであることを確かめ、違えば投げる。
 *
 * 呼ぶのは、そのセッションへ発話を足す前（addMessage）である。
 * throw する条件とエラーの文面は `requireOwnedQuestion` と同じ。
 */
async function requireOwnedSession(
  owner: OwnerId,
  sessionId: string,
): Promise<void> {
  const session = await db().dialogueSession.findFirst({
    where: { id: sessionId, question: { user_id: owner } },
    select: { id: true },
  });

  if (!session) {
    throw new Error(`セッションが見つからない: ${sessionId}`);
  }
}

/**
 * トランザクション `tx` の中で、owner が所有する `questionId` の問いの行を、`tx` が終わるまで排他ロックする。
 * 問いが無いか owner 以外が所有する問いなら、`requireOwnedQuestion` と同じ文面で throw する。
 * 問いのセッションの並びか発話を書き換えるトランザクション（`savePendingBody`・`commitTurn`・`createSession`）は、読む前にこれを呼び、同じ問いに対して直列に走る。
 *
 * ロックするのがセッションでなく問いの行なのは、再訪の `createSession` が既存のセッションの行を書き換えず、セッションの行のロックでは再訪と一往復の書き込みが直列にならないため。
 * Postgres の既定の READ COMMITTED は文ごとに読み直すので、ロックの後の読み出しは先に確定した書き込みを見る。
 */
async function requireOwnedQuestionForUpdate(
  tx: Prisma.TransactionClient,
  owner: OwnerId,
  questionId: string,
): Promise<void> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM questions
    WHERE id = ${questionId}::uuid AND user_id = ${owner}
    FOR UPDATE
  `;

  if (rows.length === 0) {
    throw new Error(`問いが見つからない: ${questionId}`);
  }
}

/** 書き込む直前に読んだ、セッションの位置と発話の数。 */
type SessionForUpdate = {
  readonly isLatest: boolean;
  readonly messageCount: number;
};

/**
 * トランザクション `tx` の中で、owner が所有する `sessionId` のセッションが問いの最新セッションかと、その発話の数を取得する。
 * セッションが無いか owner 以外が所有するセッションなら undefined を返す。
 *
 * 読む前にセッションが属する問いの行をロックするので、呼び出し側は返った値で書き込むかを決めてよい。
 */
async function getSessionForUpdate(
  tx: Prisma.TransactionClient,
  owner: OwnerId,
  sessionId: string,
): Promise<SessionForUpdate | undefined> {
  const session = await tx.dialogueSession.findFirst({
    where: { id: sessionId, question: { user_id: owner } },
    select: { question_id: true },
  });

  if (!session) {
    return undefined;
  }

  await requireOwnedQuestionForUpdate(tx, owner, session.question_id);

  // 最新の決め方は `latestSession` と同じ（同時刻なら seq）。
  const latest = await tx.dialogueSession.findFirst({
    where: { question_id: session.question_id },
    orderBy: [{ started_at: "desc" }, { seq: "desc" }],
    select: { id: true },
  });
  const messageCount = await tx.message.count({
    where: { session_id: sessionId },
  });

  return { isLatest: latest?.id === sessionId, messageCount };
}

/**
 * 問いの現在の形を書き換える。
 * 原型（body）は触らない。
 *
 * 空文字・空白のみは「現在の形なし」として扱い、表示を原型へ戻す。
 * 存在しない問いへの言い直しは呼び出し側の誤りなので、問いが無ければ throw する。
 */
export async function setCurrentForm(
  owner: OwnerId,
  questionId: string,
  form: string | null,
): Promise<Question> {
  await requireOwnedQuestion(owner, questionId);

  const v = form?.trim() ? form.trim() : null;

  return db().question.update({
    where: { id: questionId },
    data: { current_form: v },
  });
}

/**
 * 問いの状態を書き換える。
 *
 * 値域は QUESTION_STATUSES。
 * DB の enum が拒否する前に `setQuestionStatus` でも検査する。
 */
export async function setQuestionStatus(
  owner: OwnerId,
  questionId: string,
  status: QuestionStatus,
): Promise<Question> {
  if (!isQuestionStatus(status)) {
    throw new Error(
      `問いの状態が QUESTION_STATUSES に無い: ${status}（問い ${questionId}）`,
    );
  }

  await requireOwnedQuestion(owner, questionId);

  return db().question.update({ where: { id: questionId }, data: { status } });
}

/**
 * id でセッションを 1 件取得する。
 *
 * `sessions` は所有者の列を持たないので、親の問いの `user_id` を辿って判定する。
 * `id` に一致する行が無ければ undefined を返し、owner 以外が所有するセッションも同じ undefined になる（同じ応答にする理由と findFirst の理由は `getQuestion` と同じ）。
 */
export async function getSession(
  owner: OwnerId,
  id: string,
): Promise<Session | undefined> {
  const session = await db().dialogueSession.findFirst({
    where: { id, question: { user_id: owner } },
  });

  return session ?? undefined;
}

/**
 * `sessionId` のセッションが属する問いを 1 件取得する。
 * セッションが無いか owner 以外が所有するセッションなら undefined を返す。
 */
export async function getQuestionOfSession(
  owner: OwnerId,
  sessionId: string,
): Promise<Question | undefined> {
  const question = await db().question.findFirst({
    where: { user_id: owner, sessions: { some: { id: sessionId } } },
  });

  return question ?? undefined;
}

/**
 * owner が所有する問いの、最新セッションを 1 件取得する。
 *
 * 対話画面が表示するのは最新セッション一つ。
 * 同時刻に並んだ場合は挿入順（seq）で決める。
 */
export async function latestSession(
  owner: OwnerId,
  questionId: string,
): Promise<Session | undefined> {
  const session = await db().dialogueSession.findFirst({
    where: { question_id: questionId, question: { user_id: owner } },
    orderBy: [{ started_at: "desc" }, { seq: "desc" }],
  });

  return session ?? undefined;
}

/**
 * 同じ問いに新しいセッションを足す（再訪）。
 * 既存のセッションは閉じずに残し、この問いの `pending_messages` の行は同じトランザクションで削除する。
 *
 * 再送の UI は最新のセッションにしか出ないので、`pending_messages` の行を残したまま新しいセッションを作ると再送できない行になる。
 * 問いの行をロックしてから書くのは、AI の応答を待っていた一往復が、新しいセッションの確定と前後して古いセッションへ書き込まないため（`commitTurn`）。
 */
export async function createSession(
  owner: OwnerId,
  questionId: string,
): Promise<Session> {
  return db().$transaction(async (tx) => {
    await requireOwnedQuestionForUpdate(tx, owner, questionId);
    await tx.pendingMessage.deleteMany({
      where: { session: { question_id: questionId } },
    });

    return tx.dialogueSession.create({ data: { question_id: questionId } });
  });
}

/**
 * 問いのセッションを、そのセッションで付いたメモのキーワードごと古い順に返す。
 * キーワードは重複を削除する。
 *
 * 並びが古い順なのは、セッションの切り替え UI が出す回数（1 回目・2 回目）と一致させるため。
 * セッションごとにメモを SELECT すると N+1 になるので、メモは問い単位で一度に取得してから束ね直す。
 */
export async function listSessionsWithKeywords(
  owner: OwnerId,
  questionId: string,
): Promise<SessionWithKeywords[]> {
  const sessions = await db().dialogueSession.findMany({
    where: { question_id: questionId, question: { user_id: owner } },
    orderBy: [{ started_at: "asc" }, { seq: "asc" }],
  });

  const memos = await db().memo.findMany({
    where: {
      message: {
        session: { question_id: questionId, question: { user_id: owner } },
      },
    },
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
export async function listMessages(
  owner: OwnerId,
  sessionId: string,
): Promise<Message[]> {
  return db().message.findMany({
    where: { session_id: sessionId, session: { question: { user_id: owner } } },
    orderBy: [{ created_at: "asc" }, { seq: "asc" }],
  });
}

/**
 * 発話を追記する。
 *
 * messages は immutable で、更新も削除もしない。
 * メモのアンカーが本文のオフセットを指しており、本文が動くと別の位置を指し始めるため（docs/ARCHITECTURE.md「データモデル」）。
 */
export async function addMessage(
  owner: OwnerId,
  sessionId: string,
  utterance: Utterance,
): Promise<Message> {
  await requireOwnedSession(owner, sessionId);

  return db().message.create({
    data: {
      session_id: sessionId,
      speaker: utterance.speaker,
      body: utterance.body,
    },
  });
}

/**
 * human / ai_a / ai_b の三行を `messages` へ追記し、`pending_messages` の行を削除して true を返す。
 * セッションが問いの最新セッションでなくなっていたか、発話の数が `turn.messageCountAtStart` と違えば、何も書かずに false を返す。
 * セッションが無いか owner 以外が所有するセッションなら throw する。
 *
 * 三行が揃わない turn を残さないため、一トランザクションで行う。
 * 発話は追記のみで減らないので、数が一往復を始めたときと同じなら、AI を待つあいだに他の一往復は書き込んでいない。
 */
export async function commitTurn(
  owner: OwnerId,
  sessionId: string,
  turn: {
    readonly bodies: { human: string; ai_a: string; ai_b: string };
    readonly messageCountAtStart: number;
  },
): Promise<boolean> {
  const { bodies, messageCountAtStart } = turn;

  return db().$transaction(async (tx) => {
    const session = await getSessionForUpdate(tx, owner, sessionId);
    if (!session) {
      throw new Error(`セッションが見つからない: ${sessionId}`);
    }

    if (!session.isLatest || session.messageCount !== messageCountAtStart) {
      return false;
    }

    for (const speaker of ["human", "ai_a", "ai_b"] as const) {
      await tx.message.create({
        data: { session_id: sessionId, speaker, body: bodies[speaker] },
      });
    }

    // 再送を待つあいだに次の発話が送られると、`pending_messages` の行はその発話へ差し替わっている。
    // `body` でも絞るのは、差し替わった行まで削除しないため。
    await tx.pendingMessage.deleteMany({
      where: { session_id: sessionId, body: bodies.human },
    });

    return true;
  });
}

/**
 * 人間の発話を `pending_messages` へ書き込む。
 * 行が既にあれば上書きする。
 * セッションが無いか owner 以外が所有するセッションなら throw し、問いの最新セッションでなくても throw する。
 *
 * 長さを `savePendingBody` で検査するのは、`messages` へ入る本文が必ずこの関数を通るため。
 * 過去のセッションを拒否するのは、画面が発話フォームを出さないだけでは、古い画面や直接の送信から書き込めるため。
 */
export async function savePendingBody(
  owner: OwnerId,
  sessionId: string,
  body: string,
): Promise<void> {
  await db().$transaction(async (tx) => {
    const session = await getSessionForUpdate(tx, owner, sessionId);
    if (!session) {
      throw new Error(`セッションが見つからない: ${sessionId}`);
    }

    if (!session.isLatest) {
      throw new Error(
        `最新のセッションでないので発話を書き込めない: ${sessionId}`,
      );
    }

    if (body.length > MESSAGE_BODY_MAX_LENGTH) {
      throw new Error(
        `本文が上限を超えている: ${body.length} 字（上限 ${MESSAGE_BODY_MAX_LENGTH}、セッション ${sessionId}）`,
      );
    }

    await tx.pendingMessage.upsert({
      where: { session_id: sessionId },
      create: { session_id: sessionId, body },
      update: { body },
    });
  });
}

/**
 * `pending_messages` の本文を返す。
 * 行が無ければ undefined を返す（直前の一往復が完了していれば行は無い）。
 */
export async function getPendingBody(
  owner: OwnerId,
  sessionId: string,
): Promise<string | undefined> {
  const pending = await db().pendingMessage.findFirst({
    where: { session_id: sessionId, session: { question: { user_id: owner } } },
  });

  return pending?.body;
}

/**
 * メッセージ本文の一部にメモを付ける。
 * 発話が無いか owner 以外が所有する発話なら throw し、`input.anchor` の終端が本文長を超えても throw する。
 *
 * 範囲の形は `Anchor` が保証するが、本文長は発話を取得するまで分からないので、`anchor.end <= 本文長` は挿入前に `addMemo` が検査する。
 * 所有者の条件は本文を取得する SELECT の where に含めてあるので、`requireOwnedSession` をもう一度呼ばない。
 */
export async function addMemo(
  owner: OwnerId,
  messageId: string,
  input: MemoInput,
): Promise<Memo> {
  const { anchor, keyword, note } = input;

  const message = await db().message.findFirst({
    where: { id: messageId, session: { question: { user_id: owner } } },
  });

  if (!message) {
    throw new Error(`発話が見つからない: ${messageId}`);
  }

  if (anchor.end > message.body.length) {
    throw new Error(
      `anchor_end が本文長を超えている: ${anchor.end}（本文長 ${message.body.length}、発話 ${messageId}）`,
    );
  }

  return db().memo.create({
    data: {
      message_id: messageId,
      anchor_start: anchor.start,
      anchor_end: anchor.end,
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
export async function listMemosForSession(
  owner: OwnerId,
  sessionId: string,
): Promise<Memo[]> {
  return db().memo.findMany({
    where: {
      message: {
        session_id: sessionId,
        session: { question: { user_id: owner } },
      },
    },
    orderBy: [{ created_at: "asc" }, { seq: "asc" }],
  });
}

/**
 * 全メモを、出所の発話・セッション・問いごと新しい順に返す。
 * `memos → messages → sessions → questions` を一度に SELECT し、N+1 に割らない。
 *
 * 件数を絞るときも先頭から取れば新しい分が残るので、並びは `listMemosWithContext` が新しい順で確定させる。
 * 表示側で反転すると、絞った後の並べ替えになって古い分が残る。
 */
export async function listMemosWithContext(
  owner: OwnerId,
): Promise<MemoWithContext[]> {
  const rows = await db().memo.findMany({
    where: { message: { session: { question: { user_id: owner } } } },
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

/**
 * `questionId` の問いに材料 `drafts` を追記し、作った行を `drafts` の順で返す。
 * 問いが無いか owner 以外が所有する問いなら throw し、`drafts` が空なら何も書かずに空配列を返す。
 *
 * 行の作成と `status` の更新を一トランザクションで行うので、材料が入ったのに `new` のまま残る問いはできない。
 * `new` 以外の `status` は人間が選んだ値なので、`addMaterials` は `new` の問いだけを `stocked` へ上げる。
 */
export async function addMaterials(
  owner: OwnerId,
  questionId: string,
  drafts: readonly MaterialDraft[],
): Promise<Material[]> {
  await requireOwnedQuestion(owner, questionId);

  if (drafts.length === 0) {
    return [];
  }

  return db().$transaction(async (tx) => {
    const materials: Material[] = [];

    for (const draft of drafts) {
      const material = await tx.material.create({
        data: {
          question_id: questionId,
          kind: draft.kind,
          topic: draft.topic,
          body: draft.body,
          source_url: draft.source_url ?? null,
          created_by: draft.created_by,
        },
      });
      materials.push(material);
    }

    await tx.question.updateMany({
      where: { id: questionId, status: "new" },
      data: { status: "stocked" },
    });

    return materials;
  });
}

/**
 * `questionId` の問いに付いた材料を、付いた順で返す。
 * 問いが無いか owner 以外が所有する問いなら空配列を返す。
 *
 * 一回の付与で入った行は `created_at` が同じ値になるので、同着は seq で決める。
 */
export async function listMaterials(
  owner: OwnerId,
  questionId: string,
): Promise<Material[]> {
  return db().material.findMany({
    where: { question_id: questionId, question: { user_id: owner } },
    orderBy: [{ created_at: "asc" }, { seq: "asc" }],
  });
}

/** `addMemo` と `createQuestionWithTranscript` が受け取る、一件のメモ。 */
export type MemoInput = { anchor: Anchor; keyword: string; note?: string };

/** 対話とメモをまとめて作るときの、一件の発話と、その発話に付けるメモ。 */
export type MessageInput = Utterance & { memos?: MemoInput[] };

/**
 * 問いを対話ごと作るときの入力。
 *
 * currentForm と status は、既定（原型のまま・new）から動かすときだけ渡す。
 * メモの範囲（`anchor`）は呼び出し側が決める。
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
 * 書き込みの順序と経路はアプリと同じにする（`createQuestion` → `addMessage` → `addMemo`。docs/ARCHITECTURE.md「DB への書き込み経路」）。
 * 1 つのトランザクションにまとめないのは、まとめると repo 関数を tx 版へ組み直すことになり、アプリと同じ経路を通らなくなるため。
 */
export async function createQuestionWithTranscript(
  owner: OwnerId,
  input: QuestionInput,
): Promise<{
  question: Question;
  session: Session;
  messages: Message[];
  memos: Memo[];
}> {
  const created = await createQuestion(owner, input.body);
  const session = created.session;
  let question = created.question;

  if (input.currentForm !== undefined) {
    question = await setCurrentForm(owner, question.id, input.currentForm);
  }

  if (input.status !== undefined) {
    question = await setQuestionStatus(owner, question.id, input.status);
  }

  const messages: Message[] = [];
  const memos: Memo[] = [];

  for (const messageInput of input.messages) {
    const message = await addMessage(owner, session.id, {
      speaker: messageInput.speaker,
      body: messageInput.body,
    });
    messages.push(message);

    for (const memoInput of messageInput.memos ?? []) {
      const memo = await addMemo(owner, message.id, memoInput);
      memos.push(memo);
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
 * 準備不足に当たらない失敗は `cause` をそのまま返す。
 *
 * Prisma のエラーコードを読めるのは `db.ts` だけなので、判定も `db.ts` が持つ（`db.ts` の外へ Prisma を出さない）。
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
    "データベースの準備ができていない。docker compose up -d で立て、web/ で pnpm exec prisma migrate deploy を積んでから再実行する（docs/HARNESS.md「ローカル Postgres」）",
    { cause },
  );
}
