-- CreateEnum
CREATE TYPE "ai_call_kind" AS ENUM ('persona', 'material');

-- CreateEnum
CREATE TYPE "api_key_source" AS ENUM ('system', 'user');

-- CreateTable
CREATE TABLE "usage_logs" (
    "id" UUID NOT NULL,
    "user_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "kind" "ai_call_kind" NOT NULL,
    "input_tokens" INTEGER,
    "output_tokens" INTEGER,
    "web_search_count" INTEGER NOT NULL DEFAULT 0,
    "key_source" "api_key_source" NOT NULL DEFAULT 'system',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usage_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "usage_logs_user_id_idx" ON "usage_logs"("user_id");

-- AddForeignKey
ALTER TABLE "usage_logs" ADD CONSTRAINT "usage_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

