/**
 * テスト用データベースを走るたびに作り直す。
 *
 * enum・外部キー・check 制約は本物に当てないと表明した意味を持たないので、ユニットテストも本物の Postgres へ繋ぐ。
 * 走り間の隔離を `database.ts` が持ち、ケース間の隔離は `truncate.ts` が持つ。
 * 積むだけの形にすると別のブランチで積んだ migration が剥がれずに残り、古い側のコードが新しい enum や列に当たって落ちる。
 */

import path from "node:path";
import { recreateDatabase, runPrisma } from "./prisma-cli";
import { TEST_DATABASE_URL } from "./test-database-url";

const databaseName = path.basename(new URL(TEST_DATABASE_URL).pathname);

/**
 * vitest の globalSetup。
 * テスト一走ごとに一度だけ走る。
 */
export default function setup(): void {
  try {
    recreateDatabase(TEST_DATABASE_URL);
    runPrisma(["migrate", "deploy"], TEST_DATABASE_URL);
  } catch (cause) {
    const detail =
      cause instanceof Error && "stderr" in cause
        ? String(cause.stderr).trim()
        : String(cause);

    throw new Error(
      [
        `テスト用 Postgres（${databaseName}）の準備に失敗した。`,
        "立っていなければ docker compose up -d、同じ DB を別の走りが同時に作り直しているなら TOIITO_TEST_DATABASE_URL で分ける（docs/HARNESS.md「ローカル Postgres」）",
        detail,
      ].join("\n"),
    );
  }
}
