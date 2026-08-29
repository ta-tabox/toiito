/**
 * E2E 用データベースを走るたびに作り直す。
 *
 * 落として作り直すところまでがここの責務で、ブラウザ操作の側は spec が持つ。
 * ケースごとに空にする vitest 側（tests/setup/truncate.ts）と違い、E2E はアプリを跨いで状態を積む一本道なので、区切るのは走り単位。
 *
 * 呼ぶのは playwright.config.ts の webServer が `next dev` を起こす前。
 * Playwright は webServer をプラグインとして globalSetup より先に立ち上げるので、globalSetup へ置くと dev サーバーが先に接続を張った後で足元の DB を落とすことになる。
 *
 * 素の node が走らせる CLI で、接続先は webServer から渡る DATABASE_URL。
 * リポジトリ内のモジュールを import しない形に閉じてある。
 * tsconfig の paths が効くのは型検査と、それを読む実行側（Playwright・vitest・Next）までで、素の node の解決には無い。
 * ここが import を持つと、エイリアスの写しを node 側へもう一つ持つことになる。
 */

import { execFileSync } from "node:child_process";
import path from "node:path";

const webRoot = path.resolve(import.meta.dirname, "../..");

/**
 * 作り直す対象を環境変数から受け取る。
 *
 * 接続先を決める口は playwright.config.ts 一箇所で、ここは受け取る側。
 * 二つ持つと、設定とスクリプトが別々の DB を指したまま走る。
 */
function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;

  if (!url) {
    throw new Error(
      "DATABASE_URL が渡っていない。このスクリプトは playwright.config.ts の webServer から起こす",
    );
  }

  return url;
}

const databaseUrl = requireDatabaseUrl();

const databaseName = path.basename(new URL(databaseUrl).pathname);

// E2E の準備は接続先をデータベースごと落として作り直す。
// 開発用やテスト用を指したまま走らせたら中身が消えるので、名前で足を止める。
if (!databaseName.endsWith("_e2e")) {
  throw new Error(
    `E2E 用 DB の名前が _e2e で終わっていない: ${databaseName}。作り直しは中止する`,
  );
}

/**
 * 作り直しを指示するための接続先。
 *
 * データベースは自分自身へ繋いだまま落とせないので、同じサーバーの `postgres` を経由する。
 */
function adminUrl(): string {
  const url = new URL(databaseUrl);
  url.pathname = "/postgres";

  return url.toString();
}

/**
 * SQL を一文流す。
 *
 * 接続先は Prisma CLI が prisma.config.ts 越しに DIRECT_URL から読む。
 * drop / create database はトランザクションの内側で走れないので、複数文をまとめて渡さない。
 */
function execute(sql: string, url: string): void {
  execFileSync("pnpm", ["exec", "prisma", "db", "execute", "--stdin"], {
    cwd: webRoot,
    input: sql,
    stdio: ["pipe", "ignore", "inherit"],
    env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url },
  });
}

/**
 * E2E 用データベースを落として作り直す。
 *
 * force を付けるのは、前の走りが落ちた接続を残していても止まらないようにするため。
 * 残った接続一本で作り直しが失敗すると、次の走りは前回の行を見ることになる。
 */
function recreateDatabase(): void {
  const admin = adminUrl();

  try {
    execute(`drop database if exists "${databaseName}" with (force)`, admin);
    execute(`create database "${databaseName}"`, admin);
  } catch (cause) {
    throw new Error(
      `E2E 用 Postgres の準備に失敗した。docker compose up -d で立ててから再実行する（HARNESS.md「ローカル Postgres」）\n${String(cause)}`,
    );
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
    DATABASE_URL: databaseUrl,
    DIRECT_URL: databaseUrl,
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

console.log(`E2E 用データベースを作り直す: ${databaseName}`);

recreateDatabase();
migrateAndSeed();
