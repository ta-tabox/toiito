/**
 * 開発用データベースがスキーマと食い違っていないか見る。
 *
 * 別のブランチで積んだ migration は、そのブランチを離れても剥がれない。
 * テスト用は走るたびに作り直して防ぐ（`tests/setup/database.ts`）が、開発用は手で入れた対話が載りうるので作り直せない。
 * 落とさず警告だけに留めるのはそのためで、作り直すかどうかの判断は人間が持つ。
 *
 * `prisma migrate status` は使わない。
 * ローカルに無い migration が DB へ積まれていても「up to date」を返すので、この食い違いを検出できない。
 *
 * 入口は CLI（`pnpm dev` の前段）。
 */

import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";

const webRoot = path.resolve(import.meta.dirname, "..");

/** `migrate diff --exit-code` が食い違いを見つけたときの終了コード。 */
const DIFF_FOUND = 2;

/**
 * スキーマとデータベースの食い違いを見る。
 *
 * 接続先は prisma.config.ts が `.env.local` の DIRECT_URL から読む。
 * 繋がらないときは終了コードが 1 になるが、そちらは `next dev` 自身が同じ相手で落ちるので、ここでは黙って通す。
 */
function findsDrift(): boolean {
  const prismaCli = createRequire(import.meta.url).resolve(
    "prisma/build/index.js",
  );

  const result = spawnSync(
    process.execPath,
    [
      prismaCli,
      "migrate",
      "diff",
      "--from-schema=prisma/schema.prisma",
      "--to-config-datasource",
      "--exit-code",
    ],
    { cwd: webRoot, stdio: "ignore" },
  );

  return result.status === DIFF_FOUND;
}

if (findsDrift()) {
  console.warn(
    [
      "開発用データベースがスキーマと食い違っている。",
      "別のブランチの migration が積まれたまま残っている可能性がある。",
      "pnpm exec prisma migrate deploy で追いつくか、中身を捨ててよければ docker compose down -v で作り直す。",
    ].join("\n"),
  );
}
