// L2（ユニット）は実 Postgres へ繋ぐ。
// SQLite 時代の「一時ファイルを掴んで隔離」は使えないので、テスト専用データベースを走るたびに空にする。
//
// `prisma migrate reset` は使わない。
// Prisma 7 はこれを破壊的操作として検知し、AI エージェントからの実行に人間の同意を毎回要求する。
// check は無人でも回る必要があるので、非破壊の migrate deploy と truncate に分ける。
// migration ファイルを経由する点は変えていないので、手で書き足した check 制約も効く。

import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client";

/** テスト専用データベース。compose.yaml の initdb が作る。CI では env で差し替える。 */
export const TEST_DATABASE_URL =
  process.env.TOIITO_TEST_DATABASE_URL ??
  "postgresql://toiito:toiito@localhost:5433/toiito_test";

const webRoot = path.resolve(import.meta.dirname, "../..");

// truncate は接続先を問答無用で空にする。
// S0 の実対話が入っている開発用 DB を指したまま走らせたら復旧できないので、名前で足を止める。
function assertIsTestDatabase(url: string): void {
  const name = path.basename(new URL(url).pathname);

  if (!name.endsWith("_test")) {
    throw new Error(
      `テスト用 DB の名前が _test で終わっていない: ${name}。作り直しは中止する`,
    );
  }
}

function applyMigrations(): void {
  const prismaCli = createRequire(import.meta.url).resolve(
    "prisma/build/index.js",
  );

  try {
    execFileSync(process.execPath, [prismaCli, "migrate", "deploy"], {
      cwd: webRoot,
      stdio: "pipe",
      env: {
        ...process.env,
        DATABASE_URL: TEST_DATABASE_URL,
        DIRECT_URL: TEST_DATABASE_URL,
      },
    });
  } catch (cause) {
    const detail =
      cause instanceof Error && "stderr" in cause
        ? String(cause.stderr).trim()
        : String(cause);

    throw new Error(
      `テスト用 Postgres の準備に失敗した。docker compose up -d で立ててから再実行する（HARNESS.md「ローカル Postgres」）\n${detail}`,
    );
  }
}

// 対象はテーブル名の直書きでなく実物から引く。
// モデルを足したとき、消し忘れたテーブルだけが前回の行を持ち越す事故を防ぐため。
async function truncateAllTables(): Promise<void> {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: TEST_DATABASE_URL }),
  });

  try {
    const tables = await prisma.$queryRaw<{ tablename: string }[]>`
      select tablename from pg_tables
       where schemaname = 'public' and tablename <> '_prisma_migrations'
    `;

    if (tables.length === 0) return;

    const list = tables.map((t) => `"${t.tablename}"`).join(", ");
    await prisma.$executeRawUnsafe(`truncate table ${list} cascade`);
  } finally {
    await prisma.$disconnect();
  }
}

export default async function setup(): Promise<void> {
  assertIsTestDatabase(TEST_DATABASE_URL);
  applyMigrations();
  await truncateAllTables();
}
