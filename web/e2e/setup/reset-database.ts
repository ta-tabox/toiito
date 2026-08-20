/**
 * E2E 用データベースを走るたびに作り直す。
 *
 * 落として作り直すところまでがここの責務で、ブラウザ操作の側は spec が持つ。
 * ケースごとに空にする vitest 側（tests/setup/truncate.ts）と違い、E2E はアプリを跨いで状態を積む一本道なので、区切るのは走り単位。
 *
 * 呼ぶのは playwright.config.ts の webServer が `next dev` を起こす前。
 * Playwright は webServer をプラグインとして globalSetup より先に立ち上げるので、globalSetup へ置くと dev サーバーが先に接続を張った後で足元の DB を落とすことになる。
 *
 * 素の node が走らせる CLI で、入口はこのファイルの実行そのもの。
 * `@` エイリアスはバンドラと vitest のもので node には無いため、import は相対で綴る。
 */

import { execFileSync } from "node:child_process";
import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client.ts";
import { assertIsE2eDatabase, E2E_DATABASE_URL } from "./e2e-database-url.ts";

const webRoot = path.resolve(import.meta.dirname, "../..");

const databaseName = path.basename(new URL(E2E_DATABASE_URL).pathname);

/**
 * 作り直しを指示するための接続先。
 * データベースは自分自身へ繋いだまま落とせないので、同じサーバーの `postgres` を経由する。
 */
function adminUrl(): string {
  const url = new URL(E2E_DATABASE_URL);
  url.pathname = "/postgres";

  return url.toString();
}

/**
 * E2E 用データベースを落として作り直す。
 *
 * force を付けるのは、前の走りが落ちた接続を残していても止まらないようにするため。
 * 残った接続一本で作り直しが失敗すると、次の走りは前回の行を見ることになる。
 */
async function recreateDatabase(): Promise<void> {
  const admin = new PrismaClient({
    adapter: new PrismaPg({ connectionString: adminUrl() }),
  });

  try {
    await admin.$executeRawUnsafe(
      `drop database if exists "${databaseName}" with (force)`,
    );
    await admin.$executeRawUnsafe(`create database "${databaseName}"`);
  } catch (cause) {
    throw new Error(
      `E2E 用 Postgres の準備に失敗した。docker compose up -d で立ててから再実行する（HARNESS.md「ローカル Postgres」）\n${String(cause)}`,
    );
  } finally {
    await admin.$disconnect();
  }
}

/**
 * 空のデータベースへスキーマを積み、開発用シードを入れる。
 *
 * どちらも E2E の接続先を明示して子プロセスへ渡す。
 * `.env.local` を読ませないのは、そこに書いてある開発用の接続先を掴ませないため。
 */
function migrateAndSeed(): void {
  const env = {
    ...process.env,
    DATABASE_URL: E2E_DATABASE_URL,
    DIRECT_URL: E2E_DATABASE_URL,
  };

  execFileSync("pnpm", ["exec", "prisma", "migrate", "deploy"], {
    cwd: webRoot,
    stdio: "inherit",
    env,
  });

  execFileSync(process.execPath, ["scripts/seed/index.ts"], {
    cwd: webRoot,
    stdio: "inherit",
    env,
  });
}

assertIsE2eDatabase(E2E_DATABASE_URL);

console.log(`E2E 用データベースを作り直す: ${databaseName}`);

await recreateDatabase();
migrateAndSeed();
