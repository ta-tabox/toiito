-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "question_status" AS ENUM ('composting', 'fermented', 'promoted', 'open', 'perennial', 'discarded');

-- CreateEnum
CREATE TYPE "speaker" AS ENUM ('human', 'ai_a', 'ai_b');

-- CreateTable
CREATE TABLE "questions" (
    "id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "current_form" TEXT,
    "status" "question_status" NOT NULL DEFAULT 'composting',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "seq" BIGSERIAL NOT NULL,

    CONSTRAINT "questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "seq" BIGSERIAL NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "speaker" "speaker" NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "seq" BIGSERIAL NOT NULL,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memos" (
    "id" UUID NOT NULL,
    "message_id" UUID NOT NULL,
    "anchor_start" INTEGER NOT NULL,
    "anchor_end" INTEGER NOT NULL,
    "keyword" TEXT NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "seq" BIGSERIAL NOT NULL,

    CONSTRAINT "memos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memo_links" (
    "id" UUID NOT NULL,
    "from_memo_id" UUID NOT NULL,
    "to_memo_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "memo_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "questions_seq_key" ON "questions"("seq");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_seq_key" ON "sessions"("seq");

-- CreateIndex
CREATE INDEX "sessions_question_id_idx" ON "sessions"("question_id");

-- CreateIndex
CREATE UNIQUE INDEX "messages_seq_key" ON "messages"("seq");

-- CreateIndex
CREATE INDEX "messages_session_id_idx" ON "messages"("session_id");

-- CreateIndex
CREATE UNIQUE INDEX "memos_seq_key" ON "memos"("seq");

-- CreateIndex
CREATE INDEX "memos_message_id_idx" ON "memos"("message_id");

-- CreateIndex
CREATE INDEX "memos_keyword_idx" ON "memos"("keyword");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memos" ADD CONSTRAINT "memos_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memo_links" ADD CONSTRAINT "memo_links_from_memo_id_fkey" FOREIGN KEY ("from_memo_id") REFERENCES "memos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memo_links" ADD CONSTRAINT "memo_links_to_memo_id_fkey" FOREIGN KEY ("to_memo_id") REFERENCES "memos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- メモのアンカー区間の不変条件。
-- Prisma スキーマは check 制約を表現できないので、ここが DB 側の唯一の置き場になる
-- （HARNESS.md 設計制約 3: 不変条件はスキーマとテストの両方で表明する）。
-- 本文長との比較（anchor_end <= 本文長）は本文を知る db.ts の責務で、DB では表明できない。
ALTER TABLE "memos"
  ADD CONSTRAINT "memos_anchor_range_check"
  CHECK ("anchor_start" >= 0 AND "anchor_end" > "anchor_start");
