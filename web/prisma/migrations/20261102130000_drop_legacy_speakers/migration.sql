-- 発話の種別を `human`・`ai` の 2 値にし、`speaker` と `persona_config_id` の対応を check 制約で守る。
--
-- **文の並びは prisma migrate diff の出力そのままではない**。
-- 出力に無い文は「DataMigration」「AddCheckConstraint」の見出しを付けた文で、残りは出力のままである。
-- 出力の BEGIN と COMMIT はファイルの先頭と末尾へ移し、寄せ直しと check 制約まで一つのトランザクションにした。
-- 途中で失敗すると、どの文も適用されずに残る。
--
-- 旧コードが動かなくなる段である（docs/DEPLOY.md「migration」の三段階の 3 段目）。
-- 一往復が `ai` と版の id を書くコードが本番へ出た後に適用する。
--
-- 版を指さない `ai_a`・`ai_b` の発話は、既定の二体の版 1 へ寄せ直す。
-- 具体の `persona.id` は 00000000-0000-4000-8000-000000000001、抽象は 00000000-0000-4000-8000-000000000002 である。
-- 版 1 が無い DB に版を指さない AI の発話があると、check 制約の追加が失敗し、migration は何も適用せずに止まる。

BEGIN;

-- DataMigration
UPDATE "messages" AS m
   SET "persona_config_id" = c."id"
  FROM "persona_config" AS c
 WHERE m."persona_config_id" IS NULL
   AND m."speaker" = 'ai_a'
   AND c."persona_id" = '00000000-0000-4000-8000-000000000001'
   AND c."version" = 1;

-- DataMigration
UPDATE "messages" AS m
   SET "persona_config_id" = c."id"
  FROM "persona_config" AS c
 WHERE m."persona_config_id" IS NULL
   AND m."speaker" = 'ai_b'
   AND c."persona_id" = '00000000-0000-4000-8000-000000000002'
   AND c."version" = 1;

-- DataMigration
UPDATE "messages" SET "speaker" = 'ai' WHERE "speaker" IN ('ai_a', 'ai_b');

-- AlterEnum
CREATE TYPE "speaker_new" AS ENUM ('human', 'ai');
ALTER TABLE "messages" ALTER COLUMN "speaker" TYPE "speaker_new" USING ("speaker"::text::"speaker_new");
ALTER TYPE "speaker" RENAME TO "speaker_old";
ALTER TYPE "speaker_new" RENAME TO "speaker";
DROP TYPE "public"."speaker_old";

-- AddCheckConstraint
ALTER TABLE "messages"
  ADD CONSTRAINT "messages_speaker_persona_config_check"
  CHECK (("speaker" = 'human') = ("persona_config_id" IS NULL));

COMMIT;
