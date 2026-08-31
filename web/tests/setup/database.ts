/**
 * テスト用データベースを走るたびに作り直す。
 *
 * ユニットテストは本物の Postgres へ繋ぐ。
 * enum・外部キー・check 制約は本物に当てないと表明した意味を持たないので、インメモリで代替しない。
 * 走り間の隔離をここが持ち、ケース間の隔離は `truncate.ts` が持つ。
 *
 * 積むだけの形にすると、別のブランチで積んだ migration が剥がれずに残る。
 * 型を変える migration を持つブランチを行き来した後、古い側のコードが新しい enum や列に当たって落ちる。
 *
 * `prisma migrate reset` は使わない。
 * Prisma 7 はこれを破壊的操作として検知し、AI エージェントからの実行に人間の同意を毎回要求する。
 * テストは無人でも回る必要があるので、drop / create を直に流して同意の要求を避ける（`e2e/setup/reset-database.ts` と同じ経路）。
 */

import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { assertIsTestDatabase, TEST_DATABASE_URL } from "./test-database-url";

const webRoot = path.resolve(import.meta.dirname, "../..");

const prismaCli = createRequire(import.meta.url).resolve(
  "prisma/build/index.js",
);

const databaseName = path.basename(new URL(TEST_DATABASE_URL).pathname);

/**
 * 作り直しを指示するための接続先。
 *
 * データベースは自分自身へ繋いだまま落とせないので、同じサーバーの `postgres` を経由する。
 */
function adminUrl(): string {
  const url = new URL(TEST_DATABASE_URL);
  url.pathname = "/postgres";

  return url.toString();
}

/**
 * Prisma CLI を接続先を明示して叩く。
 *
 * `.env.local` の開発用接続先を掴ませないため、DATABASE_URL と DIRECT_URL の両方を渡す。
 */
function runPrisma(args: string[], url: string, input?: string): void {
  execFileSync(process.execPath, [prismaCli, ...args], {
    cwd: webRoot,
    input,
    stdio: ["pipe", "ignore", "pipe"],
    env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url },
  });
}

/**
 * データベースを落として空のものを作り直す。
 *
 * force を付けるのは、前の走りが落ちた接続を残していても止まらないようにするため。
 * drop / create はトランザクションの内側で走れないので、二文をまとめて渡さない。
 */
function recreateDatabase(): void {
  const admin = adminUrl();

  runPrisma(
    ["db", "execute", "--stdin"],
    admin,
    `drop database if exists "${databaseName}" with (force)`,
  );
  runPrisma(
    ["db", "execute", "--stdin"],
    admin,
    `create database "${databaseName}"`,
  );
}

/**
 * vitest の globalSetup。
 * テスト一走ごとに一度だけ走る。
 */
export default function setup(): void {
  assertIsTestDatabase(TEST_DATABASE_URL);

  try {
    recreateDatabase();
    runPrisma(["migrate", "deploy"], TEST_DATABASE_URL);
  } catch (cause) {
    const detail =
      cause instanceof Error && "stderr" in cause
        ? String(cause.stderr).trim()
        : String(cause);

    throw new Error(
      [
        `テスト用 Postgres（${databaseName}）の準備に失敗した。`,
        "立っていなければ docker compose up -d、同じ DB を別の走りが同時に作り直しているなら TOIITO_TEST_DATABASE_URL で分ける（HARNESS.md「ローカル Postgres」）",
        detail,
      ].join("\n"),
    );
  }
}
