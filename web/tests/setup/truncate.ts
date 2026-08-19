/**
 * テスト用データベースをケースごとに空にする。
 *
 * 一走に一度しか空にしないと、各ケースは他のケースが入れた行が在る DB を相手にする。
 * 表明が「自分の行だけを拾う」書き方に寄り、テストを書くたびに隔離の不在を迂回する細工が要る。
 * ここが隔離の境界で、migration を積むのは globalSetup（`database.ts`）が持つ。
 *
 * vitest の setupFiles として読み込む。
 * 登録した beforeEach はテストファイルごとに効く。
 *
 * 空にするだけなので、同じ DB を同時に踏む相手がいれば効かない。
 * ファイルを直列に走らせること（`vitest.config.ts` の fileParallelism）が前提。
 */

import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeEach } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";
import { TEST_DATABASE_URL } from "./test-database-url";

/**
 * truncate は接続先を問答無用で空にする。
 * 開発用 DB を指したまま走らせたら手元の対話が消えるので、名前で足を止める。
 */
function assertIsTestDatabase(url: string): void {
  const name = path.basename(new URL(url).pathname);

  if (!name.endsWith("_test")) {
    throw new Error(
      `テスト用 DB の名前が _test で終わっていない: ${name}。作り直しは中止する`,
    );
  }
}

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
