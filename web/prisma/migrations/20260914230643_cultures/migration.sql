-- CreateEnum
CREATE TYPE "culture_kind" AS ENUM ('internal', 'external', 'isomorph');

-- CreateEnum
CREATE TYPE "culture_creator" AS ENUM ('auto', 'human');

-- CreateTable
CREATE TABLE "cultures" (
    "id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "kind" "culture_kind" NOT NULL,
    "topic" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "source_url" TEXT,
    "created_by" "culture_creator" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "seq" BIGSERIAL NOT NULL,

    CONSTRAINT "cultures_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cultures_seq_key" ON "cultures"("seq");

-- CreateIndex
CREATE INDEX "cultures_question_id_idx" ON "cultures"("question_id");

-- AddForeignKey
ALTER TABLE "cultures" ADD CONSTRAINT "cultures_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
