/**
 * ユーザーが居る DB で、シードの二人の利用量の見本を現在時刻を基準に入れ直す CLI を置く。
 *
 * 入れ直す手順は `seed/index.ts` の `reseedUsage` が持つ。
 */

import { fileURLToPath } from "node:url";
import { registerSrcAlias } from "../node-alias.ts";
import { databaseName, reseedUsage } from "./index.ts";

/**
 * CLI の本体。
 *
 * 投入先を先に告げ、見本を入れ直し、行数を報告して接続を閉じる。
 */
async function main(): Promise<void> {
  registerSrcAlias();

  console.log(`接続先: ${databaseName()}`);

  const count = await reseedUsage();

  console.log(`利用量の見本を入れ直した: ${count} 行`);

  const { disconnect } = await import("@/lib/db");
  await disconnect();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
