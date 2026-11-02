/**
 * 既定のペルソナの版を、コードの設定から合成した全文に揃える CLI。
 *
 * 書き込みは `db.ts` の `addDefaultPersonaConfigs` だけが行い、この CLI は接続先の表示・呼び出し・結果の報告だけを持つ。
 * 接続先は `DATABASE_URL` で、migration を適用した後の DB に対して実行する。
 *
 * エントリポイントは CLI（`pnpm personas:sync`）。
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { registerSrcAlias } from "./node-alias.ts";

/**
 * CLI の本体。
 *
 * 接続先のデータベース名を先に表示するのは、開発用と本番の取り違えに書き込みの前に気付けるようにするため。
 */
async function main(): Promise<void> {
  registerSrcAlias();

  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL が要る。手元では pnpm personas:sync で実行する（変数の正は web/README.md の表）",
    );
  }

  console.log(`接続先: ${path.basename(new URL(url).pathname)}`);

  const db = await import("@/lib/db");

  try {
    const added = await db.addDefaultPersonaConfigs();

    if (added.length === 0) {
      console.log("既定のペルソナの版はコードと同じなので、何も足さない");
    }

    for (const config of added) {
      console.log(`版を足した: ${config.name} の版 ${config.version}`);
    }
  } catch (cause) {
    throw db.withSetupGuidance(cause);
  } finally {
    await db.disconnect();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
