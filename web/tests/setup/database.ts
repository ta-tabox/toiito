/**
 * テスト用データベースへ migration を積む。
 *
 * ユニットテストは本物の Postgres へ繋ぐ。
 * enum・外部キー・check 制約は本物に当てないと表明した意味を持たないので、インメモリで代替しない。
 * 代わりに隔離はケースごとにデータベースを空にすることで作る（`truncate.ts`）。
 *
 * `prisma migrate reset` は使わない。
 * Prisma 7 はこれを破壊的操作として検知し、AI エージェントからの実行に人間の同意を毎回要求する。
 * テストは無人でも回る必要があるので、非破壊の migrate deploy と truncate に分ける。
 */

import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { TEST_DATABASE_URL } from "./test-database-url";

const webRoot = path.resolve(import.meta.dirname, "../..");

/**
 * vitest の globalSetup。
 * テスト一走ごとに一度だけ走る。
 *
 * 積むだけで既存の行は落とさない（空にするのは `truncate.ts` の役目）。
 */
export default function setup(): void {
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
