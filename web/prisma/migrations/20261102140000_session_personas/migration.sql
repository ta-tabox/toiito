-- セッションが一往復の 1 番手と 2 番手に使うペルソナを指す列を足し、既存のセッションは既定の二体を指す。
--
-- **文の並びは prisma migrate diff の出力そのままではない**。
-- 出力に無い文は「InsertData」「DataMigration」の見出しを付けた文で、残りは出力のままである。
-- 出力の ADD COLUMN は NOT NULL で、行のある表へは足せないので、NULL を許して足し、既存の行を埋めてから NOT NULL にする形へ割った。
-- 全体を一つのトランザクションにし、途中で失敗すると、どの文も適用されずに残る。
--
-- 既定の二体の `persona.id` は、具体が 00000000-0000-4000-8000-000000000001、抽象が 00000000-0000-4000-8000-000000000002 である。
-- セッションがあるのに既定の二体のペルソナが無い DB では、システムのユーザーと既定の二体のペルソナを作ってから当てる。
-- 作ったペルソナの版は、migration の後で実行する既定の版の同期（pnpm personas:sync）が足す。

BEGIN;

-- InsertData: セッションがあるときだけ、既定のペルソナを持つシステムのユーザーを作る
INSERT INTO "user" ("id", "name", "email", "emailVerified", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, 'システム', 'system@toiito.invalid', false, now(), now()
WHERE EXISTS (SELECT 1 FROM "sessions")
ON CONFLICT ("email") DO NOTHING;

-- InsertData: システムのユーザーがいるときだけ、無い方の既定の二体を作る
INSERT INTO "persona" ("id", "user_id")
SELECT ids."id", u."id"
  FROM "user" u
 CROSS JOIN (VALUES ('00000000-0000-4000-8000-000000000001'::uuid), ('00000000-0000-4000-8000-000000000002'::uuid)) AS ids("id")
 WHERE u."email" = 'system@toiito.invalid'
ON CONFLICT ("id") DO NOTHING;

-- AlterTable
ALTER TABLE "sessions" ADD COLUMN     "first_persona_id" UUID,
ADD COLUMN     "second_persona_id" UUID;

-- DataMigration: 既存のセッションは既定の二体を指す
UPDATE "sessions"
   SET "first_persona_id" = '00000000-0000-4000-8000-000000000001',
       "second_persona_id" = '00000000-0000-4000-8000-000000000002';

-- AlterTable
ALTER TABLE "sessions" ALTER COLUMN "first_persona_id" SET NOT NULL,
ALTER COLUMN "second_persona_id" SET NOT NULL;

-- CreateIndex
CREATE INDEX "sessions_first_persona_id_idx" ON "sessions"("first_persona_id");

-- CreateIndex
CREATE INDEX "sessions_second_persona_id_idx" ON "sessions"("second_persona_id");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_first_persona_id_fkey" FOREIGN KEY ("first_persona_id") REFERENCES "persona"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_second_persona_id_fkey" FOREIGN KEY ("second_persona_id") REFERENCES "persona"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
