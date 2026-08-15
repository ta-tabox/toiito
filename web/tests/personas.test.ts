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

    it(`${id}: 手筋と材料の供給規律を持つ`, () => {
      const text = loadPersona(id);

      expect(text).toContain("## 手筋");
      expect(text).toContain("## 材料の供給規律");
      // 「答えを与えない」の実装可能な形＝一方向に閉じた材料を出さない。
      // 知識の供給そのものは禁じていない（禁じると発酵の材料が枯れる）
      expect(text).toContain("対立する材料を必ず添える");
      expect(text).toContain("一方向に閉じた材料を出さない");
    });
  });

  it("二体の手筋が重複していない（同じ角度から掘らないための分業）", () => {
    const a = loadPersona("ai_a");
    const b = loadPersona("ai_b");

    expect(a).toContain("出自の具体を聞く");
    expect(a).toContain("判定基準を要求する");
    expect(b).toContain("語の同一性を疑う");
    expect(b).toContain("変数を分解する");
    expect(a).not.toContain("語の同一性を疑う");
    expect(b).not.toContain("出自の具体を聞く");
  });

  it("二体のラベルは互いに異なる", () => {
    expect(PERSONA_LABEL.ai_a).not.toBe(PERSONA_LABEL.ai_b);
  });
});
