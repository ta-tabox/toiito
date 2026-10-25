/**
 * `memos` の行を、`deleted_at` が入った行も含めて読み直す関数を置く。
 *
 * `@/lib/db` のメモを返す読み取りは削除した行を除くので、論理削除の後も行が残ることは、アプリ側と別に張った接続でしか確かめられない。
 */

import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";
import { TEST_DATABASE_URL } from "./test-database-url";

/** 行を読み直すための接続で、読み込んだテストファイルごとに一本張る。 */
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: TEST_DATABASE_URL }),
});

afterAll(async () => {
  await prisma.$disconnect();
});

/**
 * メモ `memoId` の行の削除した時刻（`deleted_at`）を返す。
 * 行が無ければ undefined を返し、行があって削除していなければ null を返す。
 */
export async function getMemoDeletedAt(
  memoId: string,
): Promise<Date | null | undefined> {
  const row = await prisma.memo.findUnique({
    where: { id: memoId },
    select: { deleted_at: true },
  });

  return row?.deleted_at;
}
