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

/** 導く値を決めるときに見るもの。 */
type Context = {
  readonly env: Env;
  readonly root: string;
};

/** 環境変数一つを導く規則。 */
type Rule = {
  /** どのチェックアウトでも導くか、worktree でだけ導くか。 */
  readonly scope: "checkout" | "worktree";

  /**
   * `env` にその変数が無いときに、さらに満たす必要のある条件。
   * 無ければ常に導く。
   */
  readonly when?: (env: Env) => boolean;

  /** 導く値。 */
  readonly value: (context: Context) => string;
};

/**
 * Google を経ないサインインが開くかどうか。
 * `env` が `TOIITO_FAKE_LOGIN=1` を持つか、Google のクライアントも `TOIITO_FAKE_LOGIN` も持たないときに真。
 */
function opensFakeLogin(env: Env): boolean {
  if (env.TOIITO_FAKE_LOGIN !== undefined) {
    return env.TOIITO_FAKE_LOGIN === "1";
  }

  return !env.GOOGLE_CLIENT_ID;
}

/**
 * このモジュールが導く環境変数の一覧。
 * どの変数も `env` に既にあれば導かず、その値を残す。
 *
 * 値の意味は `web/README.md`「環境変数」の表が持つ。
 * worktree の規則はリモートの起動フック（`.claude/hooks/session-start.sh`）が `.env.local` へ書く値と同じにする。
 * 秘密をチェックアウトのパスから決めるのは、手元の worktree でしか使わない値なので、再起動でサインインが切れない方を採ったためである。
 */
export const CHECKOUT_ENVIRONMENT_RULES = {
  DATABASE_URL: {
    scope: "checkout",
    value: ({ root }) => localDatabaseUrl(developmentDatabaseName(root)),
  },
  DIRECT_URL: {
    scope: "checkout",
    value: ({ root }) => localDatabaseUrl(developmentDatabaseName(root)),
  },
  TOIITO_FAKE_LOGIN: {
    scope: "worktree",
    when: (env) => !env.GOOGLE_CLIENT_ID,
    value: () => "1",
  },
  TOIITO_ALLOWED_EMAILS: {
    scope: "worktree",
    when: opensFakeLogin,
    value: () => SEED_USERS.map((user) => user.email).join(","),
  },
  BETTER_AUTH_SECRET: {
    scope: "worktree",
    value: ({ root }) =>
      crypto.createHash("sha256").update(root).digest("base64"),
  },
  TOIITO_FAKE_AI: {
    scope: "worktree",
    when: (env) => !env.ANTHROPIC_API_KEY,
    value: () => "1",
  },
} as const satisfies Record<string, Rule>;

/** `CHECKOUT_ENVIRONMENT_RULES` が持つ変数の名前。 */
export type CheckoutVariable = keyof typeof CHECKOUT_ENVIRONMENT_RULES;

/** どのチェックアウトでも値を持つ変数の名前。 */
type DatabaseVariable = "DATABASE_URL" | "DIRECT_URL";

/**
 * 導いた環境変数。
 * `readCheckoutEnvironment` が作り、`setCheckoutEnvironment` が `process.env` へ設定する。
 */
export type CheckoutEnvironment = Partial<
  Record<Exclude<CheckoutVariable, DatabaseVariable>, string>
> &
  Record<DatabaseVariable, string>;

/**
 * `env` に無い環境変数を `CHECKOUT_ENVIRONMENT_RULES` に従って導き、接続先の二本は `env` にあればその値で返す。
 * worktree でだけ導く規則は `root` が worktree（`.git` がファイル）のときに限って当てる。
 *
 * 本番・CI・リモートでは `.git` がファイルにならないので、本番で秘密や開発用の変数が黙って埋まる経路は無い。
 */
export function readCheckoutEnvironment(
  env: Env,
  root: string,
): CheckoutEnvironment {
  const context: Context = { env, root };
  const worktree = isWorktree(root);
  const derived: Partial<Record<CheckoutVariable, string>> = {};

  for (const name of Object.keys(CHECKOUT_ENVIRONMENT_RULES)) {
    const variable = name as CheckoutVariable;
    const rule: Rule = CHECKOUT_ENVIRONMENT_RULES[variable];

    if (env[variable] !== undefined) {
      continue;
    }

    if (rule.scope === "worktree" && !worktree) {
      continue;
    }

    if (rule.when !== undefined && !rule.when(env)) {
      continue;
    }

    derived[variable] = rule.value(context);
  }

  return {
    ...derived,
    DATABASE_URL:
      env.DATABASE_URL ??
      CHECKOUT_ENVIRONMENT_RULES.DATABASE_URL.value(context),
    DIRECT_URL:
      env.DIRECT_URL ?? CHECKOUT_ENVIRONMENT_RULES.DIRECT_URL.value(context),
  };
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
