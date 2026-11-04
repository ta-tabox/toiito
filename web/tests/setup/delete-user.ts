/**
 * テストの中で `user` 表の行を一件削除する関数を置く。
 *
 * アプリは利用者を削除する repo 関数を持たないので、`ON DELETE CASCADE` の効きを確かめるテストだけがアプリと別の接続で削除する。
 */

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { assertIsTestDatabase, TEST_DATABASE_URL } from "./test-database-url";

/**
 * `id` の利用者を `user` 表から削除し、接続を閉じる。
 * 利用者が問いか利用量の行を持っていると、外部キーの制約で throw する。
 */
export async function deleteUser(id: string): Promise<void> {
  assertIsTestDatabase(TEST_DATABASE_URL);

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: TEST_DATABASE_URL }),
  });

  try {
    await prisma.user.delete({ where: { id } });
  } finally {
    await prisma.$disconnect();
  }
}
