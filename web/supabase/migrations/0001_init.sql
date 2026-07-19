-- toiito 初期スキーマ（ARCHITECTURE.md のデータモデルが正）

-- body は原型（不変・投入された生の問い）。current_form は対話で言い直された焦点。
-- 状態は 6 値（2026-07-19 改定。closed が「結晶した」と「棄却」を潰していた + 
-- 「閉じないことが正しい問い」= perennial の居場所が無かった）
create table questions (
  id           uuid primary key default gen_random_uuid(),
  body         text not null,
  current_form text,
  status       text not null default 'composting'
               check (status in ('composting', 'fermented', 'promoted',
                                 'open', 'perennial', 'discarded')),
  created_at   timestamptz not null default now()
);

create table sessions (
  id          uuid primary key default gen_random_uuid(),
  question_id uuid not null references questions(id),
  started_at  timestamptz not null default now()
);

create table messages (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references sessions(id),
  speaker     text not null check (speaker in ('human', 'ai_a', 'ai_b')),
  body        text not null,
  created_at  timestamptz not null default now()
);
-- messages は immutable（追記のみ）。memo のアンカーが腐らないための不変条件

create table memos (
  id           uuid primary key default gen_random_uuid(),
  message_id   uuid not null references messages(id),
  anchor_start int  not null,
  anchor_end   int  not null,
  keyword      text not null,
  note         text,
  created_at   timestamptz not null default now(),
  check (anchor_start >= 0 and anchor_end > anchor_start)
);

-- 将来のリンキング用。MVP では未使用（ARCHITECTURE.md「持ち越した開いた問い」参照）
create table memo_links (
  id           uuid primary key default gen_random_uuid(),
  from_memo_id uuid not null references memos(id),
  to_memo_id   uuid not null references memos(id),
  kind         text not null,
  created_at   timestamptz not null default now()
);

create index idx_sessions_question on sessions(question_id);
create index idx_messages_session  on messages(session_id);
create index idx_memos_message     on memos(message_id);
create index idx_memos_keyword     on memos(keyword);
