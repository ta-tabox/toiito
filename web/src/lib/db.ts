// ローカル永続化層（node:sqlite / Node 22+）
// スキーマの正は ARCHITECTURE.md。Postgres 移行（別タスク）の際は
// この repo 関数群のシグネチャを保ったまま実装を差し替える。

import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import path from "node:path";
import fs from "node:fs";

// パス解決は遅延（初回アクセス時）。テストが env を差し替えてから
// 初回呼び出しできるようにするため（HARNESS.md 設計制約 2）
function dbPath(): string {
  return (
    process.env.TOIITO_DB_PATH ?? path.join(process.cwd(), "data", "toiito.db")
  );
}

const SCHEMA = `
create table if not exists questions (
  id         text primary key,
  body       text not null,
  status     text not null default 'composting'
             check (status in ('composting', 'fermented', 'closed')),
  created_at text not null default (datetime('now'))
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

let _db: DatabaseSync | null = null;

function db(): DatabaseSync {
  if (!_db) {
    const p = dbPath();
    fs.mkdirSync(path.dirname(p), { recursive: true });
    _db = new DatabaseSync(p);
    _db.exec("pragma journal_mode = wal; pragma foreign_keys = on;");
    _db.exec(SCHEMA);
  }
  return _db;
}

export type Question = {
  id: string;
  body: string;
  status: "composting" | "fermented" | "closed";
  created_at: string;
};

export type Session = { id: string; question_id: string; started_at: string };

export type Speaker = "human" | "ai_a" | "ai_b";

export type Message = {
  id: string;
  session_id: string;
  speaker: Speaker;
  body: string;
  created_at: string;
};

export function createQuestion(body: string): { question: Question; session: Session } {
  const qid = randomUUID();
  const sid = randomUUID();
  db().prepare("insert into questions (id, body) values (?, ?)").run(qid, body);
  db().prepare("insert into sessions (id, question_id) values (?, ?)").run(sid, qid);
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

export function getSession(id: string): Session | undefined {
  return db().prepare("select * from sessions where id = ?").get(id) as
    | Session
    | undefined;
}

export function latestSession(questionId: string): Session | undefined {
  return db()
    .prepare(
      "select * from sessions where question_id = ? order by started_at desc, rowid desc limit 1"
    )
    .get(questionId) as Session | undefined;
}

export function createSession(questionId: string): Session {
  const sid = randomUUID();
  db().prepare("insert into sessions (id, question_id) values (?, ?)").run(sid, questionId);
  return getSession(sid)!;
}

export function listMessages(sessionId: string): Message[] {
  return db()
    .prepare("select * from messages where session_id = ? order by created_at, rowid")
    .all(sessionId) as Message[];
}

export function addMessage(sessionId: string, speaker: Speaker, body: string): Message {
  const id = randomUUID();
  db()
    .prepare("insert into messages (id, session_id, speaker, body) values (?, ?, ?, ?)")
    .run(id, sessionId, speaker, body);
  return db().prepare("select * from messages where id = ?").get(id) as Message;
}
