/**
 * 本番と Preview の DB へ migration を適用する。
 *
 * main への push で本番へ適用する経路（`.github/workflows/migrate.yml`）とは別の、手元から叩くコマンド。
 * Preview には自動経路が無いので（`docs/adr/0015-preview-neon-branch.md`）、migration を含む PR の画面を見るにはこのスクリプトを通る。
 * 接続先は適用先ごとの環境変数が持ち、`.env.local` の `DIRECT_URL`（ローカル）は子プロセスの env で上書きする。
 *
 * エントリポイントは CLI（`pnpm migrate:prod` / `pnpm migrate:preview`）。
 */

import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

/**
 * 適用先と、その接続先を持つ環境変数の対応。
 *
 * 変数を分けてあるのは、一本の `DIRECT_URL` を書き換えて使い回すと、直前に何を入れたかで適用先が変わるため。
 * 名前の正は `web/README.md` の表。
 */
const DIRECT_URL_VARIABLES = {
  prod: "DIRECT_URL_PROD",
  preview: "DIRECT_URL_PREVIEW",
} as const;

/** 適用先の名前。 */
export type TargetName = keyof typeof DIRECT_URL_VARIABLES;

/** 適用先の一覧。 */
export const TARGET_NAMES: readonly TargetName[] = Object.keys(
  DIRECT_URL_VARIABLES,
) as TargetName[];

/**
 * 適用先の接続先を持つ環境変数。
 *
 * `process.env` をそのまま渡せるよう、宣言した以外のキーも通す（`config.ts` と同じ形）。
 */
type DirectUrlEnv = {
  readonly DIRECT_URL_PROD?: string;
  readonly DIRECT_URL_PREVIEW?: string;
  readonly [key: string]: string | undefined;
};

/** 解決した適用先。 */
export type MigrationTarget = {
  readonly name: TargetName;
  readonly directUrl: string;
};

/**
 * 引数と環境変数から適用先を決める。
 *
 * 名前が値域の外のときと、対応する環境変数が空のときは投げる。
 * 環境変数が無いまま既定値にすると `.env.local` のローカル DB へ適用されるので、黙って既定値にしない。
 */
export function resolveTarget(
  name: string | undefined,
  env: DirectUrlEnv,
): MigrationTarget {
  if (!(name && name in DIRECT_URL_VARIABLES)) {
    throw new Error(
      `流し先は ${TARGET_NAMES.join(" か ")}。受け取ったのは ${name ?? "(指定なし)"}`,
    );
  }

  const target = name as TargetName;
  const variable = DIRECT_URL_VARIABLES[target];
  const directUrl = env[variable];

  if (!directUrl) {
    throw new Error(
      `${variable} が要る。.env.local に置く（変数の正は web/README.md の表）`,
    );
  }

  return { name: target, directUrl };
}

/**
 * 接続先をホストとデータベース名だけで表す。
 *
 * 接続文字列にはパスワードが入るので、そのまま出さない。
 */
export function describeConnection(directUrl: string): string {
  const url = new URL(directUrl);

  return `${url.host}${url.pathname}`;
}

/**
 * CLI の本体。
 *
 * 適用先を先に表示してから適用する。
 * 本番と Preview の取り違えに、適用の前に気付けるようにするため。
 */
function main(): void {
  const target = resolveTarget(process.argv[2], process.env);

  console.log(`${target.name} へ流す: ${describeConnection(target.directUrl)}`);

  const prismaCli = createRequire(import.meta.url).resolve(
    "prisma/build/index.js",
  );

  execFileSync(process.execPath, [prismaCli, "migrate", "deploy"], {
    stdio: "inherit",
    env: { ...process.env, DIRECT_URL: target.directUrl },
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
