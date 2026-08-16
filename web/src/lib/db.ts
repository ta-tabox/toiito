// 永続化層。現状の実装は node:sqlite（Node 22+）の生 SQL。
// データモデルとスキーマの正は ARCHITECTURE.md。
//
// この層は Prisma + Postgres へ入れ替わり、repo 関数はすべて async になる（issue #11）。
// 同期前提のロジックをここへ積み増さない。DB 非依存の計算は anchors.ts のような層へ置く。

import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  type Memo,
  type MemoWithContext,
  type Message,
  QUESTION_STATUSES,
  type Question,
  type QuestionStatus,
  type Session,
  type Speaker,
} from "./types";

// パス解決は遅延（初回アクセス時）。テストが env を差し替えてから
// 初回呼び出しできるようにするため（HARNESS.md 設計制約 2）
function dbPath(): string {
  return (
    process.env.TOIITO_DB_PATH ?? path.join(process.cwd(), "data", "toiito.db")
  );
}

const STATUS_CHECK = QUESTION_STATUSES.map((s) => `'${s}'`).join(", ");

const SCHEMA = `
create table if not exists questions (
  id           text primary key,
  body         text not null,
  current_form text,
  status       text not null default 'composting'
               check (status in (${STATUS_CHECK})),
  created_at   text not null default (datetime('now'))
);

create table if not exists sessions (
  id          text primary key,
  question_id text not null references questions(id),
  started_at  text not null default (datetime('now'))
);

create table if not exists messages (
  id         text primary key,
  session_id text not null references sessions(id),
  speaker    text not null check (speaker in ('human', 'ai_a', 'ai_b')),
  body       text not null,
  created_at text not null default (datetime('now'))
);

create table if not exists memos (
  id           text primary key,
  message_id   text not null references messages(id),
  anchor_start integer not null,
  anchor_end   integer not null,
  keyword      text not null,
  note         text,
  created_at   text not null default (datetime('now')),
  check (anchor_start >= 0 and anchor_end > anchor_start)
);

create index if not exists idx_sessions_question on sessions(question_id);
create index if not exists idx_messages_session  on messages(session_id);
create index if not exists idx_memos_message     on memos(message_id);
create index if not exists idx_memos_keyword     on memos(keyword);
`;

// `create table if not exists` は既存テーブルを触らないので、列や check の追加が
// 既存 DB へ届かない。SQLite は check を alter できないため、該当テーブルだけ
// 作り直してデータを移送する（手元の DB には実データが入っているので落とさない）。
function migrate(d: DatabaseSync): void {
  const cols = d.prepare("pragma table_info(questions)").all() as {
    name: string;
  }[];
  if (cols.length === 0 || cols.some((c) => c.name === "current_form")) return;

  d.exec("pragma foreign_keys = off;");
  d.exec(`
    create table questions_new (
      id           text primary key,
      body         text not null,
      current_form text,
      status       text not null default 'composting'
                   check (status in (${STATUS_CHECK})),
      created_at   text not null default (datetime('now'))
    );
    insert into questions_new (id, body, current_form, status, created_at)
      select id, body, null,
             case when status = 'closed' then 'promoted' else status end,
             created_at
        from questions;
    drop table questions;
    alter table questions_new rename to questions;
  `);
  d.exec("pragma foreign_keys = on;");
}

let _db: DatabaseSync | null = null;

function db(): DatabaseSync {
  if (!_db) {
    const p = dbPath();
    fs.mkdirSync(path.dirname(p), { recursive: true });

    _db = new DatabaseSync(p);
    _db.exec("pragma journal_mode = wal; pragma foreign_keys = on;");
    migrate(_db);
    _db.exec(SCHEMA);
  }
  return _db;
}

/** 表示に使う問い文。現在の形があればそれ、無ければ原型。 */
export function questionText(q: Question): string {
  return q.current_form ?? q.body;
}

export function createQuestion(body: string): {
  question: Question;
  session: Session;
} {
  const qid = randomUUID();
  const sid = randomUUID();

  db().prepare("insert into questions (id, body) values (?, ?)").run(qid, body);
  db()
    .prepare("insert into sessions (id, question_id) values (?, ?)")
    .run(sid, qid);
  return { question: getQuestion(qid)!, session: getSession(sid)! };
}

export function listQuestions(): Question[] {
  return db()
    .prepare("select * from questions order by created_at desc")
    .all() as Question[];
}

export function getQuestion(id: string): Question | undefined {
  return db().prepare("select * from questions where id = ?").get(id) as
    | Question
    | undefined;
}

/**
 * 現在の形を更新する（原型 body は触らない）。
 * 空文字・空白のみは「現在の形なし」＝原型に戻す扱い。
 */
export function setCurrentForm(
  questionId: string,
  form: string | null,
): Question | undefined {
  const v = form?.trim() ? form.trim() : null;
  db()
    .prepare("update questions set current_form = ? where id = ?")
    .run(v, questionId);
  return getQuestion(questionId);
}

/** 問いの状態を進める。値域は QUESTION_STATUSES（lib 側でも検査する）。 */
export function setQuestionStatus(
  questionId: string,
  status: QuestionStatus,
): Question | undefined {
  if (!QUESTION_STATUSES.includes(status)) {
    throw new Error(`unknown question status: ${status}`);
  }

  db()
    .prepare("update questions set status = ? where id = ?")
    .run(status, questionId);
  return getQuestion(questionId);
}

export function getSession(id: string): Session | undefined {
  return db().prepare("select * from sessions where id = ?").get(id) as
    | Session
    | undefined;
}

export function latestSession(questionId: string): Session | undefined {
  return db()
    .prepare(
      "select * from sessions where question_id = ? order by started_at desc, rowid desc limit 1",
    )
    .get(questionId) as Session | undefined;
}

export function createSession(questionId: string): Session {
  const sid = randomUUID();
  db()
    .prepare("insert into sessions (id, question_id) values (?, ?)")
    .run(sid, questionId);
  return getSession(sid)!;
}

export function listMessages(sessionId: string): Message[] {
  return db()
    .prepare(
      "select * from messages where session_id = ? order by created_at, rowid",
    )
    .all(sessionId) as Message[];
}

export function addMessage(
  sessionId: string,
  speaker: Speaker,
  body: string,
): Message {
  const id = randomUUID();
  db()
    .prepare(
      "insert into messages (id, session_id, speaker, body) values (?, ?, ?, ?)",
    )
    .run(id, sessionId, speaker, body);
  return db().prepare("select * from messages where id = ?").get(id) as Message;
}

/**
 * DB の check は本文長を知らないため `start >= 0 && end > start` しか守れない。
 * `anchor_end <= 本文長` は lib の責務なので、挿入前に検査して文脈付きで拒否する。
 */
export function addMemo(
  messageId: string,
  anchorStart: number,
  anchorEnd: number,
  keyword: string,
  note?: string,
): Memo {
  const message = db()
    .prepare("select * from messages where id = ?")
    .get(messageId) as Message | undefined;

  if (!message) {
    throw new Error(`addMemo: message not found: ${messageId}`);
  }

  if (anchorEnd > message.body.length) {
    throw new Error(
      `addMemo: anchor_end (${anchorEnd}) exceeds body length (${message.body.length}) of message ${messageId}`,
    );
  }

  const id = randomUUID();
  db()
    .prepare(
      "insert into memos (id, message_id, anchor_start, anchor_end, keyword, note) values (?, ?, ?, ?, ?, ?)",
    )
    .run(id, messageId, anchorStart, anchorEnd, keyword, note ?? null);

  return db().prepare("select * from memos where id = ?").get(id) as Memo;
}

/** 対話画面のアンダーライン描画用。セッション内の全メモを投稿順で返す。 */
export function listMemosForSession(sessionId: string): Memo[] {
  return db()
    .prepare(
      `select memos.*
         from memos
         join messages on messages.id = memos.message_id
        where messages.session_id = ?
        order by memos.created_at, memos.id`,
    )
    .all(sessionId) as Memo[];
}

/** メモからのセッション逆引き用。`memos → messages → sessions → questions` の join 一本。 */
export function listMemosWithContext(): MemoWithContext[] {
  return db()
    .prepare(
      `select
         memos.id           as id,
         memos.message_id   as message_id,
         memos.anchor_start as anchor_start,
         memos.anchor_end   as anchor_end,
         memos.keyword      as keyword,
         memos.note         as note,
         memos.created_at   as created_at,
         messages.session_id as session_id,
         sessions.question_id as question_id,
         questions.body      as question_body,
         messages.speaker     as speaker,
         messages.body        as message_body
         from memos
         join messages  on messages.id = memos.message_id
         join sessions  on sessions.id = messages.session_id
         join questions on questions.id = sessions.question_id
        order by memos.created_at, memos.id`,
    )
    .all() as MemoWithContext[];
}
