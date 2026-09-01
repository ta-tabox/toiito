/**
 * 消えた worktree が残したテスト用データベースを落とす。
 *
 * 落とすのは自動で派生した名前だけで、判定は `tests/setup/test-database-url.ts` の規則を借りる。
 * 手で付けた名前（`toiito_129_e2e` のような）は現存の worktree と突き合わせようがないので、落とさず一覧に出して人間へ渡す。
 *
 * 入口は CLI（`pnpm db:prune`）。
 */

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.ts";
import {
  adminUrl,
  TEST_DATABASE_URL,
  testDatabaseName,
} from "../tests/setup/test-database-url.ts";

/**
 * 自動で派生した名前の形。
 *
 * `toiito_wt_` の印を見るのは、手で `TOIITO_TEST_DATABASE_URL` を指した DB を巻き込まないため。
 * 印が無ければ、いま誰かが使っている `toiito_120_test` のような名前と区別が付かない。
 */
const DERIVED_NAME = /^toiito_wt_.+_test$/;

/**
 * worktree に対応しないまま居続けるデータベース。
 *
 * 開発用と、リポジトリ本体のテスト・E2E がこれに当たる。
 * 毎回一覧へ出しても行動が変わらないので、報告からも外す。
 */
const PERMANENT_NAMES = ["toiito", "toiito_test", "toiito_e2e"];

/** 落とすものと、人間へ渡すもの。 */
export type PruneTargets = {
  orphans: string[];
  unmanaged: string[];
};

/**
 * 落として良いデータベースを選ぶ。
 *
 * 現存の worktree から派生する名前は、その worktree がいま使っているので残す。
 * 派生の形に合わない `toiito_*` は、誰が何のために作ったか判定できないので落とさない。
 */
export function selectPruneTargets(
  existing: readonly string[],
  liveNames: readonly string[],
): PruneTargets {
  const keep = new Set([...liveNames, ...PERMANENT_NAMES]);
  const orphans: string[] = [];
  const unmanaged: string[] = [];

  for (const name of existing) {
    if (!name.startsWith("toiito") || keep.has(name)) {
      continue;
    }

    if (DERIVED_NAME.test(name)) {
      orphans.push(name);
    } else {
      unmanaged.push(name);
    }
  }

  return { orphans, unmanaged };
}

/**
 * 現存する worktree が使うデータベースの名前。
 *
 * `git worktree list --porcelain` は worktree ごとに `worktree <パス>` の行から始まる。
 */
export function liveDatabaseNames(porcelain: string): string[] {
  const prefix = "worktree ";

  return porcelain
    .split("\n")
    .filter((line) => line.startsWith(prefix))
    .map((line) => testDatabaseName(line.slice(prefix.length)));
}

/** 孤児を数え上げて落とす。 */
async function prune(): Promise<void> {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: adminUrl(TEST_DATABASE_URL) }),
  });

  try {
    const rows = await prisma.$queryRaw<{ datname: string }[]>`
      select datname from pg_database order by datname
    `;
    const live = liveDatabaseNames(
      execFileSync("git", ["worktree", "list", "--porcelain"], {
        encoding: "utf8",
      }),
    );
    const { orphans, unmanaged } = selectPruneTargets(
      rows.map((row) => row.datname),
      live,
    );

    for (const name of orphans) {
      await prisma.$executeRawUnsafe(
        `drop database if exists "${name}" with (force)`,
      );
      console.log(`落とした: ${name}`);
    }

    if (orphans.length === 0) {
      console.log("落とすものは無い");
    }

    if (unmanaged.length > 0) {
      console.log(`規則の外（手で判断する）: ${unmanaged.join(", ")}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await prune();
}
