/**
 * 既定のペルソナの行を、repo 関数を通さずに削除・作成・読み直す関数を置く。
 *
 * 同期のテストは、同期より前の状態（既定のペルソナが無い DB・移行の版 1 だけがある DB）を作る必要があり、その状態を作る repo 関数は無い。
 */

import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";
import { SYSTEM_USER_EMAIL } from "@/lib/db";
import { TEST_DATABASE_URL } from "./test-database-url";

/** 行を読み書きするための接続で、読み込んだテストファイルごとに一本張る。 */
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: TEST_DATABASE_URL }),
});

afterAll(async () => {
  await prisma.$disconnect();
});

/** すべてのペルソナの版とペルソナ、システムのユーザーを削除する。 */
export async function deletePersonas(): Promise<void> {
  await prisma.personaConfig.deleteMany();
  await prisma.persona.deleteMany();
  await prisma.user.deleteMany({ where: { email: SYSTEM_USER_EMAIL } });
}

/**
 * 移行の migration が作るのと同じ形で、システムのユーザー・既定の二体（`personaIds`）・全文が `systemPrompt` の版 1 を作る。
 * 先に `deletePersonas` で既存の行を削除しておく。
 */
export async function createMigratedPersonas(
  personaIds: string[],
  systemPrompt: string,
): Promise<void> {
  const user = await prisma.user.create({
    data: { id: "system", email: SYSTEM_USER_EMAIL, name: "システム" },
  });

  for (const id of personaIds) {
    await prisma.persona.create({ data: { id, user_id: user.id } });
    await prisma.personaConfig.create({
      data: {
        persona_id: id,
        version: 1,
        name: "移行の呼び名",
        abstraction: "level_3",
        dissent: "level_3",
        convergence: "level_3",
        description: "",
        system_prompt: systemPrompt,
      },
    });
  }
}

/** すべての版を、ペルソナの id と版番号の順に返す。 */
export async function listPersonaConfigRows(): Promise<
  { persona_id: string; version: number; system_prompt: string }[]
> {
  return prisma.personaConfig.findMany({
    select: { persona_id: true, version: true, system_prompt: true },
    orderBy: [{ persona_id: "asc" }, { version: "asc" }],
  });
}

/** システムのユーザーの行数を返す。 */
export async function countSystemUsers(): Promise<number> {
  return prisma.user.count({ where: { email: SYSTEM_USER_EMAIL } });
}
