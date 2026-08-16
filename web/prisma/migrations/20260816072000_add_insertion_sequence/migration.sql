-- 挿入順の通し番号。SQLite の rowid が担っていた役割の置き換え。
-- created_at は同一マイクロ秒で並びうるし id は乱数の UUIDv4 なので、
-- この二つだけでは順序が全順序にならない（発話の並びが実装依存になる）。
--
-- 既存行の番号は BIGSERIAL の既定（ヒープ走査順）に任せず、時刻順で振り直す。
-- 移送済みの S0 の対話が物理配置の都合で並び替わるのを防ぐため。
-- 新規の DB では対象行がゼロなので、update も setval も何もしない。

alter table "questions" add column "seq" BIGSERIAL not null;
alter table "sessions"  add column "seq" BIGSERIAL not null;
alter table "messages"  add column "seq" BIGSERIAL not null;
alter table "memos"     add column "seq" BIGSERIAL not null;

with ordered as (
  select "id", row_number() over (order by "created_at", "id") as rn from "questions"
)
update "questions" t set "seq" = o.rn from ordered o where t."id" = o."id";

with ordered as (
  select "id", row_number() over (order by "started_at", "id") as rn from "sessions"
)
update "sessions" t set "seq" = o.rn from ordered o where t."id" = o."id";

with ordered as (
  select "id", row_number() over (order by "created_at", "id") as rn from "messages"
)
update "messages" t set "seq" = o.rn from ordered o where t."id" = o."id";

with ordered as (
  select "id", row_number() over (order by "created_at", "id") as rn from "memos"
)
update "memos" t set "seq" = o.rn from ordered o where t."id" = o."id";

-- 振り直した分だけシーケンスを先へ送る（次の挿入が既存の番号と衝突しないように）
select setval(pg_get_serial_sequence('"questions"', 'seq'), coalesce(max("seq"), 0) + 1, false) from "questions";
select setval(pg_get_serial_sequence('"sessions"',  'seq'), coalesce(max("seq"), 0) + 1, false) from "sessions";
select setval(pg_get_serial_sequence('"messages"',  'seq'), coalesce(max("seq"), 0) + 1, false) from "messages";
select setval(pg_get_serial_sequence('"memos"',     'seq'), coalesce(max("seq"), 0) + 1, false) from "memos";

create unique index "questions_seq_key" on "questions"("seq");
create unique index "sessions_seq_key"  on "sessions"("seq");
create unique index "messages_seq_key"  on "messages"("seq");
create unique index "memos_seq_key"     on "memos"("seq");
