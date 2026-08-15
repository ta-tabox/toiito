// ローカル永続化層（node:sqlite / Node 22+）
// スキーマの正は ARCHITECTURE.md。Postgres 移行（別タスク）の際は
// この repo 関数群のシグネチャを保ったまま実装を差し替える。

import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

// パス解決は遅延（初回アクセス時）。テストが env を差し替えてから
// 初回呼び出しできるようにするため（HARNESS.md 設計制約 2）
function dbPath(): string {
  return (
    process.env.TOIITO_DB_PATH ?? path.join(process.cwd(), "data", "toiito.db")
  );
}

// 問いの状態。3値（composting/fermented/closed）では足りないことが
// 2026-07-19 の実地の蒸留で判明した——closed が「答えが結晶した」と「棄却」を
// 潰しており、かつ「閉じないことが正しい問い」の居場所が無かった。
// 意味の正は ARCHITECTURE.md「問いの状態機械」。
export const QUESTION_STATUSES = [
  "composting", // 投入済み。まだ材料が付いていない
  "fermented", // 材料（培地）が付き、蒸留に入れる
  "promoted", // 答えが結晶した（別の器へ書き出した）
  "open", // 持ち続ける問い。答えが出ないことは欠陥ではない
  "perennial", // 閉じないことが正しい問い。閉じ候補として催促しない
  "discarded", // 棄却
] as const;

export type QuestionStatus = (typeof QUESTION_STATUSES)[number];

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

// `create table if not exists` は既存テーブルを一切触らないため、列や check の
// 追加は既存 DB へ届かない（スキーマ乖離）。SQLite は check を alter できないので
// 該当テーブルだけ作り直す。dev DB は gitignore 済みだが、人間の手元には
// S0 実機確認のデータが入っているので落とさずに移送する。
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

// body は**原型**。投入された生の問いであり、以後書き換えない
// （転記誤りの訂正だけが例外＝復元であって改稿ではない）。
// 問いは対話の中で形を変えるので、言い直し・分割後の焦点は current_form に持つ。
// 原型を失うと「元は何を訊きたかったのか」が検証不能になり、
// 誤った前提のまま材料が積み上がる（fermentary 2026-07-19 の実損）。
export type Question = {
  id: string;
  body: string;
  current_form: string | null;
  status: QuestionStatus;
  created_at: string;
};

/** 表示に使う問い文。現在の形があればそれ、無ければ原型。 */
export function questionText(q: Question): string {
  return q.current_form ?? q.body;
}

export type Session = { id: string; question_id: string; started_at: string };

export type Speaker = "human" | "ai_a" | "ai_b";

export type Message = {
  id: string;
  session_id: string;
  speaker: Speaker;
  body: string;
  created_at: string;
};

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

export type Memo = {
  id: string;
  message_id: string;
  anchor_start: number;
  anchor_end: number;
  keyword: string;
  note: string | null;
  created_at: string;
};

/**
 * DB の check 制約は `anchor_start >= 0 and anchor_end > anchor_start` しか守らない
 * （対象メッセージの本文長を知らないため）。`anchor_end` が本文長を超えないことは lib 側の責務
 * ——超過は「メッセージが変わった後の古いメモ」等の不整合を示すので、挿入前に検査して文脈付きで拒否する。
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

export type MemoWithContext = Memo & {
  session_id: string;
  question_id: string;
  question_body: string;
  speaker: Speaker;
  message_body: string;
};

/**
 * メモからのセッション逆引き用。`memos → messages → sessions → questions` の join 一本。
 * Postgres 移行後もそのまま成立するよう、SQLite 方言（rowid 等）を使わない素の SQL に限定する。
 */
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
