-- 所有者という概念をデータ層へ入れる（docs/adr/0030-ownership-granularity.md）。
--
-- **文の並びは prisma migrate diff の出力そのままではない**。
-- user_id を NOT NULL で足すには、その前に持ち主の行が存在していなければならないので、四表の作成を先へ回し、列は一度 nullable で足してから締める。
-- 出力に無い文は「唯一の利用者」と「DataMigration」の二つで、残りは出力のままである。
--
-- 既存の問いは消さずに、唯一の利用者へ寄せる（docs/adr/0028-ownership-before-auth.md 決定 6）。
-- ADR 0030（0020 の改訂）の決定 5 は「本番のレコードは作り直す」と決めていたが、その前提は #68（ログイン（Google OAuth）とリソースの所有権）まで本番が止まることだった。
-- 本番が止まらなくなったので、消す理由の方が消えている。
--
-- 受け皿の email は placeholder で、本番では人間が自分のものへ差し替える（DEPLOY.md「唯一の利用者」）。
-- migration ファイルは公開リポジトリに残るので、実在の宛先を書かない。
--
-- **#175（一往復は成立してから書き、成立前の発話は預かる）との順序は、もう問題にならない**。
-- sessions を空にしなくなったので、あちらの pending_messages が持つ ON DELETE RESTRICT の外部キーに当たらない。

-- CreateTable
CREATE TABLE "user" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account" (
    "id" TEXT NOT NULL,
    "issuer" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "verification_pkey" PRIMARY KEY ("id")
);

-- AlterTable: 先に nullable で足し、下で寄せてから締める
ALTER TABLE "questions" ADD COLUMN     "user_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "session_token_key" ON "session"("token");

-- CreateIndex
CREATE INDEX "session_userId_idx" ON "session"("userId");

-- CreateIndex
CREATE INDEX "account_userId_idx" ON "account"("userId");

-- CreateIndex
CREATE INDEX "verification_identifier_idx" ON "verification"("identifier");

-- InsertData: 持ち主のいない問いがあるときだけ、受け皿の利用者を一人作る
-- 問いが一件も無い DB（テスト・E2E・立ち上げ直後）では、この文も次の文も何もしない。
INSERT INTO "user" ("id", "name", "email", "emailVerified", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, '唯一の利用者', 'owner@toiito.invalid', false, now(), now()
WHERE EXISTS (SELECT 1 FROM "questions");

-- DataMigration: 既存の問いを、その受け皿へ寄せる
UPDATE "questions"
   SET "user_id" = (SELECT "id" FROM "user" WHERE "email" = 'owner@toiito.invalid')
 WHERE "user_id" IS NULL;

-- AlterTable: 全行が持ち主を持ったので締める
ALTER TABLE "questions" ALTER COLUMN "user_id" SET NOT NULL;

-- CreateIndex
CREATE INDEX "questions_user_id_idx" ON "questions"("user_id");

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account" ADD CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
