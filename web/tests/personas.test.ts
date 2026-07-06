import { describe, expect, it } from "vitest";
import { loadPersona, PERSONA_LABEL } from "@/lib/personas";

// ペルソナ文書の構造的な健全性のみ検証する。
// 文体・対話の質は L5（人間の官能）の領分（HARNESS.md）。
describe("ペルソナ定義", () => {
  (["ai_a", "ai_b"] as const).forEach((id) => {
    it(`${id}: 定義が読め、禁止事項（アプリのアイデンティティ）を含む`, () => {
      const text = loadPersona(id);
      expect(text.startsWith(`# ${id}`)).toBe(true);
      expect(text).toContain("禁止事項");
      expect(text).toContain("答え");
    });
  });

  it("二体のラベルは互いに異なる", () => {
    expect(PERSONA_LABEL.ai_a).not.toBe(PERSONA_LABEL.ai_b);
  });
});
