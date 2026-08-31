/**
 * 繋ぎ先のデータベースが、スキーマと食い違っていないか見て警告する。
 *
 * 繋ぎ先を決めるのはここではない。
 * `prisma.config.ts` が `.env.local` の `DIRECT_URL` から読むので、どの DB を守るかは呼ぶ側の配線が決める。
 *
 * 見つけても落とさない。
 * 別のブランチで積んだ migration はそのブランチを離れても剥がれないが、作り直してよいかは中身の持ち主にしか判断できない。
 * 走るたびに作り直せる相手（`tests/setup/database.ts` のテスト用 DB）は、そもそもここを通らない。
 *
 * `prisma migrate status` は使わない。
 * ローカルに無い migration が DB へ積まれていても「up to date」を返すので、この食い違いを検出できない。
 *
 * 入口は CLI。
 * いまの配線は `pnpm dev` の前段一つで、そこでの繋ぎ先は開発用 DB になる。
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
 * 繋がらないときは終了コードが 1 になるが、そちらは黙って通す。
 * 相手が立っていないことは、この後に続くコマンドが同じ相手で落ちて言う。
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
      "繋ぎ先のデータベースがスキーマと食い違っている。",
      "別のブランチの migration が積まれたまま残っている可能性がある。",
      "pnpm exec prisma migrate deploy で追いつくか、中身を捨ててよければ docker compose down -v で作り直す。",
    ].join("\n"),
  );
}
