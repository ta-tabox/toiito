-- メモのアンカー区間の不変条件。Prisma スキーマは check 制約を表現できないので、
-- ここが DB 側の表明の置き場になる（HARNESS.md 設計制約 3: 不変条件はスキーマとテストの両方で表明する）。
-- 本文長との比較（anchor_end <= 本文長）は本文を知る db.ts の責務で、DB では表明できない。
alter table "memos"
  add constraint "memos_anchor_range_check"
  check ("anchor_start" >= 0 and "anchor_end" > "anchor_start");
