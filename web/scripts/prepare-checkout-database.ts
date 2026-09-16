/**
 * このチェックアウトの開発用データベースを、無ければ作り、worktree なら migration を積む CLI を置く。
 * データの投入は持たず、`seed/index.ts` が持つ。
 *
 * 既にあるデータベースは作り直さない。
 * 本体の開発用 DB には手で入れた対話が載るので、migration を積むかは人間が決める（`check-database-drift.ts` が食い違いを警告する）。
 * worktree の DB はそのブランチの持ち物なので、毎回積んで追いつかせる。
 * `prisma migrate reset` は使わない（Prisma 7 が人間の同意を毎回要求する。`tests/setup/database.ts` と同じ理由）。
 *
 * エントリポイントは CLI（`pnpm db:prepare`。`scripts/setup.sh` が呼ぶ）。
 */

import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.ts";
import { adminUrl } from "../tests/setup/test-database-url.ts";
import { isWorktree } from "./checkout-database.ts";
import { setCheckoutEnvironment } from "./checkout-environment.ts";

const webRoot = path.resolve(import.meta.dirname, "..");
const repositoryRoot = path.resolve(webRoot, "..");

const prismaCli = createRequire(import.meta.url).resolve(
  "prisma/build/index.js",
);

/**
 * `url` のデータベースが無ければ作って true を返し、既にあれば何もせず false を返す。
 * 所有者は `url` のユーザーにする。
 *
 * `create database` はトランザクションの内側で走れないので、存在の確認と作成を一文にまとめない。
 */
async function createDatabaseIfMissing(url: string): Promise<boolean> {
  const target = new URL(url);
  const name = path.basename(target.pathname);
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: adminUrl(url) }),
  });

  try {
    const rows = await prisma.$queryRaw<{ datname: string }[]>`
      select datname from pg_database where datname = ${name}
    `;

    if (rows.length > 0) {
      return false;
    }

    await prisma.$executeRawUnsafe(
      `create database "${name}" owner "${target.username}"`,
    );

    return true;
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * `url` のデータベースへ `prisma migrate deploy` で migration を積む。
 * 積むものが無ければ何もしない。
 */
function runMigrateDeploy(url: string): void {
  execFileSync(process.execPath, [prismaCli, "migrate", "deploy"], {
    cwd: webRoot,
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url },
  });
}

/**
 * CLI の本体。
 * 接続先を告げ、無ければ作り、worktree なら migration を積む。
 */
async function main(): Promise<void> {
  const { DIRECT_URL } = setCheckoutEnvironment();
  const name = path.basename(new URL(DIRECT_URL).pathname);

  try {
    const created = await createDatabaseIfMissing(DIRECT_URL);
    console.log(created ? `作った: ${name}` : `既にある: ${name}`);
  } catch (cause) {
    throw new Error(
      `開発用 Postgres（${name}）を用意できなかった。立っていなければ docker compose up -d（docs/HARNESS.md「ローカル Postgres」）`,
      { cause },
    );
  }

  if (isWorktree(repositoryRoot)) {
    runMigrateDeploy(DIRECT_URL);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
