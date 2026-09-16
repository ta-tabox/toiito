/**
 * 手元のチェックアウトで、無い環境変数の既定を導いて環境へ入れる関数と、その環境で別のコマンドを起動する CLI を置く。
 * データベース名の導出は持たず、`checkout-database.ts` が持つ。
 *
 * worktree には `web/.env.local` を作らない（`CLAUDE.md`「環境変数」）ので、`pnpm dev`・`pnpm seed`・Prisma CLI は接続先をここから受け取る。
 * 接続先はどのチェックアウトでも導き、サインインと AI の既定は worktree でだけ導く。
 * 本番と CI は環境変数を明示で渡すので、ここは何も書き換えない。
 *
 * エントリポイントは `setCheckoutEnvironment`（CLI は `node scripts/checkout-environment.ts <コマンド> [引数...]`）。
 */

import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  developmentDatabaseName,
  isWorktree,
  localDatabaseUrl,
} from "./checkout-database.ts";
import { SEED_USERS } from "./seed/users.ts";

const webRoot = path.resolve(import.meta.dirname, "..");
const repositoryRoot = path.resolve(webRoot, "..");

/**
 * 読む側の env。
 * `process.env` をそのまま渡せる形。
 */
type Env = Readonly<Record<string, string | undefined>>;

/**
 * worktree でだけ導く既定。
 * 値の意味は `web/README.md`「環境変数」の表が持つ。
 */
type DevelopmentDefaults = Partial<
  Record<
    | "TOIITO_FAKE_LOGIN"
    | "TOIITO_ALLOWED_EMAILS"
    | "BETTER_AUTH_SECRET"
    | "TOIITO_FAKE_AI",
    string
  >
>;

/**
 * 導いた環境変数。
 * `readCheckoutEnvironment` が作り、`setCheckoutEnvironment` が `process.env` へ設定する。
 */
export type CheckoutEnvironment = DevelopmentDefaults & {
  /** アプリからの接続先。 */
  DATABASE_URL: string;

  /** Prisma Migrate 用の直結。 */
  DIRECT_URL: string;
};

/**
 * `env` に無いサインインと AI の設定を、リモートの起動フック（`.claude/hooks/session-start.sh`）と同じ規則で埋めた値を返す。
 * `env` にある値は返さない。
 *
 * Google のクライアントが無ければ Google を経ないサインインを開け、許可リストはシードの二人にする。
 * 秘密はチェックアウトのパスから決める（worktree の手元でしか使わないので、再起動でサインインが切れない方を採る）。
 */
function readDevelopmentDefaults(env: Env, root: string): DevelopmentDefaults {
  const defaults: DevelopmentDefaults = {};

  const opensFakeLogin = !env.GOOGLE_CLIENT_ID && !env.TOIITO_FAKE_LOGIN;

  if (opensFakeLogin) {
    defaults.TOIITO_FAKE_LOGIN = "1";
  }

  if (
    (opensFakeLogin || env.TOIITO_FAKE_LOGIN === "1") &&
    !env.TOIITO_ALLOWED_EMAILS
  ) {
    defaults.TOIITO_ALLOWED_EMAILS = SEED_USERS.map((user) => user.email).join(
      ",",
    );
  }

  if (!env.BETTER_AUTH_SECRET) {
    defaults.BETTER_AUTH_SECRET = crypto
      .createHash("sha256")
      .update(root)
      .digest("base64");
  }

  if (!env.ANTHROPIC_API_KEY && !env.TOIITO_FAKE_AI) {
    defaults.TOIITO_FAKE_AI = "1";
  }

  return defaults;
}

/**
 * `env` に無い接続先を `root` のチェックアウトから導いた手元の開発用 DB で埋め、`root` が worktree ならサインインと AI の既定も足して返す。
 * `env` にある接続先はそのまま返す。
 *
 * サインインと AI の既定を worktree に限るのは、`.git` がファイルになるのは手元の worktree だけで、本番・CI・リモートでは決して当たらないためである。
 */
export function readCheckoutEnvironment(
  env: Env,
  root: string,
): CheckoutEnvironment {
  const fallback = localDatabaseUrl(developmentDatabaseName(root));
  const database = {
    DATABASE_URL: env.DATABASE_URL ?? fallback,
    DIRECT_URL: env.DIRECT_URL ?? fallback,
  };

  if (!isWorktree(root)) {
    return database;
  }

  return { ...database, ...readDevelopmentDefaults(env, root) };
}

/**
 * `web/.env.local` があれば読み込み、それでも無い環境変数をこのチェックアウトから導いて `process.env` へ設定し、設定した後の値を返す。
 * 既に入っている環境変数は書き換えない。
 *
 * `process.loadEnvFile` は既にある環境変数を上書きしないので、コマンドの前置きで渡した値が `.env.local` の値より優先する。
 */
export function setCheckoutEnvironment(): CheckoutEnvironment {
  const envFile = path.join(webRoot, ".env.local");

  if (fs.existsSync(envFile)) {
    process.loadEnvFile(envFile);
  }

  const environment = readCheckoutEnvironment(process.env, repositoryRoot);
  Object.assign(process.env, environment);

  return environment;
}

/**
 * CLI の本体。
 * 引数のコマンドを、導いた環境変数を入れた環境で起動し、その終了コードで終わる。
 */
function main(): void {
  const [command, ...args] = process.argv.slice(2);

  if (command === undefined) {
    throw new Error(
      "起動するコマンドが無い。使い方: node scripts/checkout-environment.ts <コマンド> [引数...]",
    );
  }

  setCheckoutEnvironment();

  const result = spawnSync(command, args, { stdio: "inherit" });

  if (result.error) {
    throw result.error;
  }

  process.exit(result.status ?? 1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
