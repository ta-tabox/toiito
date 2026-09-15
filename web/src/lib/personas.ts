/**
 * 二体のペルソナ定義（src/personas/*.md が正。コードに埋め込まない）
 */

import fs from "node:fs";
import path from "node:path";

export type PersonaId = "ai_a" | "ai_b";

export const PERSONA_LABEL: Record<PersonaId, string> = {
  ai_a: "具体",
  ai_b: "抽象",
};

/**
 * ペルソナのシステムプロンプトを src/personas/*.md から読む。
 * プロンプトは文書として管理する方針なので、内容をコードへ持ち込まない。
 */
export function loadPersona(id: PersonaId): string {
  const p = path.join(process.cwd(), "src", "personas", `${id}.md`);
  return fs.readFileSync(p, "utf-8");
}
