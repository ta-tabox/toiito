/**
 * 永続化層。
 * Prisma + Postgres。
 * データモデルの意味の正は docs/ARCHITECTURE.md、スキーマの正は prisma/schema.prisma。
 *
 * この層の外へ Prisma を出さない。
 * `@prisma/client` と生成型（`@/generated/prisma`）に触れてよいのはこのファイルだけ。
 * UI と Server Actions が受け取るのは types.ts のドメイン型に限る。
 * schema.prisma の値域を動かすと戻り値がドメイン型へ代入できなくなり、`tsc` が失敗する。
 *
 * repo 関数はすべて async。
 * DB 非依存の計算を `db.ts` へ積まない（`anchors.ts` のような純関数層へ置く）。
 *
 * **アクセス権のないリソースを拒否するのは、この層である**（`docs/adr/0030-ownership-granularity.md`）。
 * `proxy.ts` は cookie の有無しか見ず、UI も画面ごとの絞り込みを持たない。
 * だから所有者を受け取る repo 関数は、読みも書きも所有者の条件を必ず where に置く。
 * 所有者の列を持つのは `questions` だけで、下位のテーブルは親を辿って判定する。
 *
 * **検査しているのはこの層で、DB の制約ではない**（RLS は使っていない）。
 * 取ってから user_id を比べる形は比べ忘れても型が通るので、条件は取得の後でなく where に置く。
 * where に置けば「存在しない」と「アクセス権がない」が同じ応答になり、404 と 403 の違いから在ることが漏れる隙も消える。
 * `id` は `/q/<id>` の URL に出て権限を持たない相手の手にも渡るので、知っていること自体は権限にならない。
 */

import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { DATABASE_URL } from "@/lib/config";
import { MESSAGE_BODY_MAX_LENGTH } from "@/lib/message";
import { isQuestionStatus, type QuestionStatus } from "@/lib/question";
import type {
  Memo,
  MemoWithContext,
  Message,
  OwnerId,
  Question,
  Session,
  SessionWithKeywords,
  Speaker,
  User,
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
 * `user` 表から読んだ行を、ドメイン型の `User` へ写す。
 *
 * 呼ぶのは `user` 表を SELECT した直後の 2 箇所（`getUserByEmail` と `createUser`）だけである。
 * `OwnerId` へ変換してよいのは `fromUserRow` だけで、`fromUserRow` を経由したことが「その文字列は `user.id` である」の唯一の根拠になる。
 * URL やフォームから来た文字列は `fromUserRow` を経由しないので、`OwnerId` にならない。
 */
function fromUserRow(row: { id: string; email: string; name: string }): User {
  return { ...row, id: row.id as OwnerId };
}

/**
 * `user` 表から email で 1 件取得する。
 *
 * 行が無ければ throw せず undefined を返す。
 * 呼び出し側（`current-user.ts`）が「行がまだ無い」と「取得できた」を分けて扱うため。
 */
export async function getUserByEmail(email: string): Promise<User | undefined> {
  const row = await db().user.findUnique({
    where: { email },
    select: { id: true, email: true, name: true },
  });

  return row ? fromUserRow(row) : undefined;
}

/**
 * ユーザーを作る。
 *
 * 本番の経路では Better Auth が四表を書くので、`createUser` を呼ぶのは開発用シードだけである。
 * id は Better Auth の生成に合わせず UUID を振る。
 * `user.id` は文字列でありさえすればよく、この二人が IdP を持たない以上、id の作り方を真似ても得るものが無い。
 */
export async function createUser(email: string, name: string): Promise<User> {
  const row = await db().user.create({
    data: { id: randomUUID(), email, name },
    select: { id: true, email: true, name: true },
  });

  return fromUserRow(row);
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
 *
 * `id` に一致する行が無ければ undefined を返す。
 * owner 以外が所有する問いも同じ undefined になる。
 * 二つを違う応答にすると、URL の id を差し替えるだけで在ることが読める。
 *
 * findUnique でなく findFirst なのは Prisma の制約による。
 * findUnique の where は一意な列しか受け取らないので、`user_id` の条件を足せない。
 * id は主キーなので返るのは 0 件か 1 件で、「先頭」という意味は持たない。
 */
export async function getQuestion(
  owner: OwnerId,
  id: string,
): Promise<Question | undefined> {
  return (
    (await db().question.findFirst({ where: { id, user_id: owner } })) ??
    undefined
  );
}

/**
 * その問いが所有者のものであることを確かめ、違えば投げる。
 * アクセス権のない問いと存在しない問いを、同じ失敗にする。
 *
 * 呼ぶのは、その問いにセッションを足す前（createSession）と、問いの列を更新する前（updateCurrentForm・updateQuestionStatus）である。
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
 * 問いの現在の形を書き換える。
 * 原型（body）は触らない。
 *
 * 空文字・空白のみは「現在の形なし」として扱い、表示を原型へ戻す。
 * 存在しない問いへの言い直しは呼び出し側の誤りなので、問いが無ければ throw する。
 * 見つからないことを正常終了として扱わない。
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
    throw new Error(`unknown question status: ${status}`);
  }

  await requireOwnedQuestion(owner, questionId);

  return db().question.update({ where: { id: questionId }, data: { status } });
}

/**
 * id でセッションを 1 件取得する。
 *
 * `sessions` は所有者の列を持たないので、親の問いの `user_id` を辿って判定する（`docs/adr/0030-ownership-granularity.md` 決定 2）。
 * `id` に一致する行が無ければ undefined を返し、owner 以外が所有するセッションも同じ undefined になる（同じ応答にする理由と findFirst の理由は `getQuestion` と同じ）。
 */
export async function getSession(
  owner: OwnerId,
  id: string,
): Promise<Session | undefined> {
  return (
    (await db().dialogueSession.findFirst({
      where: { id, question: { user_id: owner } },
    })) ?? undefined
  );
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
  return (
    (await db().dialogueSession.findFirst({
      where: { question_id: questionId, question: { user_id: owner } },
      orderBy: [{ started_at: "desc" }, { seq: "desc" }],
    })) ?? undefined
  );
}

/**
 * 同じ問いに新しいセッションを足す（再訪）。
 *
 * 既存のセッションは閉じず、そのまま残す。
 * 何度戻ったかが読み返せることが目的。
 *
 * この問いの `pending_messages` の行も、同じトランザクションで削除する。
 * 再送の UI は最新のセッションにしか出ないので、残したまま新しいセッションを作ると再送できない行になる。
 */
export async function createSession(
  owner: OwnerId,
  questionId: string,
): Promise<Session> {
  await requireOwnedQuestion(owner, questionId);

  return db().$transaction(async (tx) => {
    await tx.pendingMessage.deleteMany({
      where: { session: { question_id: questionId } },
    });

    return tx.dialogueSession.create({ data: { question_id: questionId } });
  });
}

/**
 * 問いのセッションを、そのセッションで付いたメモのキーワードごと古い順に返す。
 *
 * 日付だけの一覧ではどのセッションだったか思い出せないので、人間がメモを付けた語を手掛かりとして添える。
 * 同じ語に何度もメモを付けることがあるため、キーワードは重複を削除して返す。
 * 並びは古い順で、latestSession（新しい順の先頭）とは逆になる。
 * 読み返しは投入からの順に辿るので、セッションの切り替え UI に出す回数（1 回目・2 回目）と並びが一致する方を採る。
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
  speaker: Speaker,
  body: string,
): Promise<Message> {
  await requireOwnedSession(owner, sessionId);

  return db().message.create({
    data: { session_id: sessionId, speaker, body },
  });
}

/**
 * human / ai_a / ai_b の三行を `messages` へ追記し、`pending_messages` の行を削除する。
 *
 * 三行が揃わない turn を残さないため、一トランザクションで行う（`docs/adr/0025-turn-atomicity-and-pending-utterance.md`）。
 * 削除を `body` でも絞り、一致しなければ何もしない `deleteMany` を使うのは、再送を待つあいだに次の発話が送られて `pending_messages` の行が差し替わったとき、その行まで削除しないため。
 */
export async function commitTurn(
  owner: OwnerId,
  sessionId: string,
  bodies: { human: string; ai_a: string; ai_b: string },
): Promise<void> {
  await requireOwnedSession(owner, sessionId);

  await db().$transaction(async (tx) => {
    for (const speaker of ["human", "ai_a", "ai_b"] as const) {
      await tx.message.create({
        data: { session_id: sessionId, speaker, body: bodies[speaker] },
      });
    }

    await tx.pendingMessage.deleteMany({
      where: { session_id: sessionId, body: bodies.human },
    });
  });
}

/**
 * 人間の発話を `pending_messages` へ書き込む。
 * 行が既にあれば上書きする。
 *
 * 長さを `savePendingBody` で検査するのは、`messages` へ入る本文が必ずこの関数を通るため。
 */
export async function savePendingBody(
  owner: OwnerId,
  sessionId: string,
  body: string,
): Promise<void> {
  await requireOwnedSession(owner, sessionId);

  if (body.length > MESSAGE_BODY_MAX_LENGTH) {
    throw new Error(
      `savePendingBody: body length (${body.length}) exceeds limit (${MESSAGE_BODY_MAX_LENGTH}) for session ${sessionId}`,
    );
  }

  await db().pendingMessage.upsert({
    where: { session_id: sessionId },
    create: { session_id: sessionId, body },
    update: { body },
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
 *
 * DB の check は本文長を知らないため `start >= 0 && end > start` しか守れない。
 * `anchor_end <= 本文長` は `addMemo` の責務なので、挿入前に検査して文脈付きで拒否する。
 *
 * 所有者の判定は本文を取得する SELECT の where に含めてある。
 * owner 以外が所有する発話はその SELECT が 0 件になって throw するので、`requireOwnedSession` をもう一度呼ばない。
 */
export async function addMemo(
  owner: OwnerId,
  messageId: string,
  anchorStart: number,
  anchorEnd: number,
  keyword: string,
  note?: string,
): Promise<Memo> {
  const message = await db().message.findFirst({
    where: { id: messageId, session: { question: { user_id: owner } } },
  });

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
 *
 * メモからの逆引き用。
 * `memos → messages → sessions → questions` を一度に SELECT し、N+1 に割らない。
 * 古い順で読む用途が無く、件数を絞るときも先頭から取れば新しい分が残るので、並びは新しい順で確定させる。
 * 表示側で反転すると、絞った後の並べ替えになって古い分が残る。
 *
 * 所有者の条件は、既に辿っている経路の先に where が一つ増えるだけで、join は増えない。
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
 * シード専用の書き込み経路を別に作ると、アプリで起きることがシードしたデータでは起きなくなり、画面で確かめている状態が実際の状態とずれる。
 * 1 つのトランザクションにはまとめない。
 * まとめるには repo 関数を tx 版へ組み直すことになり、アプリと同じ経路を通るという上の性質を失う。
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
    const message = await addMessage(
      owner,
      session.id,
      messageInput.speaker,
      messageInput.body,
    );
    messages.push(message);

    for (const memoInput of messageInput.memos ?? []) {
      memos.push(
        await addMemo(
          owner,
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
 * Prisma のエラーコードを読めるのは `db.ts` だけなので、判定も `db.ts` が持つ（`db.ts` の外へ Prisma を出さない）。
 * 準備不足に当たらない失敗はそのまま返す。
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
