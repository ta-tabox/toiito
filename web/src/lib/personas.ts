/**
 * 二体のペルソナ定義（src/personas/*.md が正。コードに埋め込まない）
 */

import fs from "node:fs";
import path from "node:path";
import type { Effort } from "@/lib/claude";

export type PersonaId = "ai_a" | "ai_b";

/**
 * ペルソナごとの思考の深さ。
 *
 * 抽象さんは構造を取り出して材料を添える役で thinking が膨らみやすいので、一段落とす。
 * undefined は API の既定（high）で走らせるという指定。
 */
export const PERSONA_EFFORT: Record<PersonaId, Effort | undefined> = {
  ai_a: undefined,
  ai_b: "medium",
};

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
