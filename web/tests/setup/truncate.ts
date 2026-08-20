/**
 * テスト用データベースをケースごとに空にする。
 *
 * ここが隔離の境界で、migration を積むのは globalSetup（`database.ts`）が持つ。
 *
 * vitest の setupFiles として読み込む。
 * 登録した beforeEach はテストファイルごとに効く。
 *
 * 空にするだけなので、同じ DB を同時に踏む相手がいれば効かない。
 * ファイルを直列に走らせること（`vitest.config.ts` の fileParallelism）が前提。
 */

import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeEach } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";
import { assertIsTestDatabase, TEST_DATABASE_URL } from "./test-database-url";

assertIsTestDatabase(TEST_DATABASE_URL);

/**
 * 空にするための接続。
 * アプリ側（`@/lib/db`）とは別に張る。
 *
 * テストファイルごとに一本で、ケースごとには張り直さない。
 */
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: TEST_DATABASE_URL }),
});

/**
 * 対象はテーブル名の直書きでなく実物から引く。
 * モデルを足したとき、消し忘れたテーブルだけが前回の行を持ち越す事故を防ぐため。
 *
 * seq は autoincrement なので restart identity まで含める。
 * 巻き戻さないと、ケースごとに同じ状態から始まらない。
 */
async function truncateAllTables(): Promise<void> {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    select tablename from pg_tables
     where schemaname = 'public' and tablename <> '_prisma_migrations'
  `;

  if (tables.length === 0) {
    return;
  }

  const list = tables.map((t) => `"${t.tablename}"`).join(", ");
  await prisma.$executeRawUnsafe(
    `truncate table ${list} restart identity cascade`,
  );
}

beforeEach(truncateAllTables);

afterAll(async () => {
  await prisma.$disconnect();
});
