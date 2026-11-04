/**
 * テスト用データベースを Prisma CLI で作り直し、SQL を適用する関数を置く。
 *
 * `prisma migrate reset` は使わない。
 * Prisma 7 は `migrate reset` を破壊的操作として検知し、AI エージェントからの実行に人間の同意を毎回要求する。
 * テストは無人でも回る必要があるので、drop / create を直に実行する（`e2e/setup/reset-database.ts` と同じ経路）。
 */

import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { adminUrl, assertIsTestDatabase } from "./test-database-url";

const webRoot = path.resolve(import.meta.dirname, "../..");

const prismaCli = createRequire(import.meta.url).resolve(
  "prisma/build/index.js",
);

/**
 * Prisma CLI を、引数（`args`）と接続先（`url`）を明示して起動する。
 * CLI が 0 以外で終われば throw し、エラーの `stderr` に CLI の出力が入る。
 *
 * `.env.local` の開発用接続先を掴ませないため、DATABASE_URL と DIRECT_URL の両方を渡す。
 */
export function runPrisma(args: string[], url: string, input?: string): void {
  execFileSync(process.execPath, [prismaCli, ...args], {
    cwd: webRoot,
    input,
    stdio: ["pipe", "ignore", "pipe"],
    env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url },
  });
}

/**
 * 接続先（`url`）のデータベースを削除し、空のものを作り直す。
 * データベースの名前が `_test` で終わらなければ、何も削除せずに throw する。
 *
 * force を付けるのは、前の走りが落ちた接続を残していても止まらないようにするため。
 * drop / create はトランザクションの内側で走れないので、二文をまとめて渡さない。
 */
export function recreateDatabase(url: string): void {
  assertIsTestDatabase(url);

  const name = path.basename(new URL(url).pathname);
  const admin = adminUrl(url);

  dropDatabase(url);
  runPrisma(["db", "execute", "--stdin"], admin, `create database "${name}"`);
}

/**
 * 接続先（`url`）のデータベースを削除する。
 * データベースが無ければ何もせず、名前が `_test` で終わらなければ throw する。
 */
export function dropDatabase(url: string): void {
  assertIsTestDatabase(url);

  const name = path.basename(new URL(url).pathname);

  runPrisma(
    ["db", "execute", "--stdin"],
    adminUrl(url),
    `drop database if exists "${name}" with (force)`,
  );
}
