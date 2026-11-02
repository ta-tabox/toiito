/**
 * 一つの migration を、その直前の migration までを積んだデータベースへ適用して検査するための関数を置く。
 *
 * データベースは `TEST_DATABASE_URL` と別に作り、名前は `TEST_DATABASE_URL` の名前の `_test` の前に `_migration` を挟む。
 * `TEST_DATABASE_URL` は全 migration を積んだ状態をテストの間ずっと保つので、途中の状態を作るのには使えない。
 *
 * migration は `prisma migrate deploy` でなく、`migration.sql` を `prisma db execute` で適用する。
 * `migrate deploy` は途中で止められず、指定した migration の手前まで積む手段が無い。
 * 直前までの `migration.sql` は連結して一度で適用する（CLI の起動は一回に約 1 秒かかる）。
 */

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { dropDatabase, recreateDatabase, runPrisma } from "./prisma-cli";
import { TEST_DATABASE_URL } from "./test-database-url";

const migrationsRoot = path.resolve(
  import.meta.dirname,
  "../../prisma/migrations",
);

/**
 * 直前までの migration を積んだデータベースと、残りの一つを適用する操作。
 * `createDatabaseBefore` が作り、テストが `applyTarget` の前後に `client` の生の SQL で行を入れて読み直す。
 *
 * `client` は最新のスキーマから生成したクライアントなので、モデルの API は途中の状態の表と合わない。
 * 行の読み書きは `$executeRawUnsafe` と `$queryRawUnsafe` だけで行う。
 */
export type MigrationDatabase = {
  readonly client: PrismaClient;
  readonly applyTarget: () => void;
  readonly drop: () => Promise<void>;
};

/** 途中の状態を作るデータベースの接続先。 */
function migrationDatabaseUrl(): string {
  const url = new URL(TEST_DATABASE_URL);
  const name = path.basename(url.pathname).replace(/_test$/, "_migration_test");
  url.pathname = `/${name}`;

  return url.toString();
}

/**
 * 接続先（`url`）へ、migration のディレクトリ名（`names`）の `migration.sql` を並びの順に適用する。
 *
 * Postgres は一度に送った複数の文を一つのトランザクションで実行し、enum に足した値を同じトランザクションの中では使えないので、migration の間に `COMMIT` を挟んで別のトランザクションにする。
 */
function applyMigrations(url: string, names: string[]): void {
  const sql = names
    .map((name) =>
      readFileSync(path.join(migrationsRoot, name, "migration.sql"), "utf-8"),
    )
    .join("\nCOMMIT;\n");

  runPrisma(["db", "execute", "--stdin"], url, sql);
}

/**
 * migration のディレクトリ名（`target`）より前の migration をすべて積んだデータベースを作り直して返す。
 * `target` のディレクトリが無ければ throw する。
 *
 * ディレクトリ名は先頭の時刻で並ぶので、名前の昇順を適用の順序として使う。
 */
export function createDatabaseBefore(target: string): MigrationDatabase {
  const names = readdirSync(migrationsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  const index = names.indexOf(target);
  if (index === -1) {
    throw new Error(`migration が見つからない: ${target}`);
  }

  const url = migrationDatabaseUrl();
  recreateDatabase(url);

  applyMigrations(url, names.slice(0, index));

  const client = new PrismaClient({
    adapter: new PrismaPg({ connectionString: url }),
  });

  return {
    client,
    applyTarget: () => applyMigrations(url, [target]),
    drop: async () => {
      await client.$disconnect();
      dropDatabase(url);
    },
  };
}
