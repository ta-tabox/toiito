/**
 * 材料を寄せる呼び出しのシステムプロンプトを、`src/prompts/material.md` から読む関数を置く。
 * プロンプトを組み込む呼び出しの指定は持たず、`lib/material-from-ai.ts` が持つ。
 */

import fs from "node:fs";
import path from "node:path";

/**
 * 材料を寄せる呼び出しのシステムプロンプトを `src/prompts/material.md` から読む。
 * ファイルが無ければ throw する。
 */
export function loadMaterialPrompt(): string {
  const p = path.join(process.cwd(), "src", "prompts", "material.md");
  return fs.readFileSync(p, "utf-8");
}
