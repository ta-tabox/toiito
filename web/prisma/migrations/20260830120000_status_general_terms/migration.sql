-- 問いの状態を、比喩を持たない一般語へ組み直す（docs/adr/0017-status-value-set.md）。
--
-- 手で書いてある。
-- Prisma の migrate dev は enum の改名を drop / recreate として出すので、任せると questions.status のデータが落ちる。
-- 改名は既存行の綴りをそのまま置き換えるため、データの入れ替えは要らない。

-- AlterEnum: 比喩由来の値と、意味を語らない値を一般語へ改名する
ALTER TYPE "question_status" RENAME VALUE 'composting' TO 'new';
ALTER TYPE "question_status" RENAME VALUE 'fermented' TO 'stocked';
ALTER TYPE "question_status" RENAME VALUE 'promoted' TO 'exported';
ALTER TYPE "question_status" RENAME VALUE 'open' TO 'holding';
ALTER TYPE "question_status" RENAME VALUE 'perennial' TO 'permanent';

-- AlterEnum: 「答えが出て閉じたが、書き出してはいない」の置き場を足す
-- 位置は schema.prisma の宣言順に合わせる。
-- 同じトランザクションの中でこの値を使うことはできないので、以下でも参照しない。
ALTER TYPE "question_status" ADD VALUE 'resolved' AFTER 'stocked';

-- AlterTable: 既定値を新しい綴りへ付け替える
ALTER TABLE "questions" ALTER COLUMN "status" SET DEFAULT 'new';
