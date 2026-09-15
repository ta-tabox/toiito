-- CreateEnum
CREATE TYPE "material_kind" AS ENUM ('internal', 'external', 'isomorph');

-- CreateEnum
CREATE TYPE "material_creator" AS ENUM ('auto', 'human');

-- CreateTable
CREATE TABLE "materials" (
    "id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "kind" "material_kind" NOT NULL,
    "topic" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "source_url" TEXT,
    "created_by" "material_creator" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "seq" BIGSERIAL NOT NULL,

    CONSTRAINT "materials_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "materials_seq_key" ON "materials"("seq");

-- CreateIndex
CREATE INDEX "materials_question_id_idx" ON "materials"("question_id");

-- AddForeignKey
ALTER TABLE "materials" ADD CONSTRAINT "materials_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
