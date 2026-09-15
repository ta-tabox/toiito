/**
 * 画面の URL の書式の検査。
 */

import { describe, expect, it } from "vitest";
import { messageElementIdOf, questionPathOf, ROUTES } from "@/lib/routes";

describe("questionPathOf", () => {
  it("問いの id だけなら、最新のセッションを描く対話画面の URL を返す", () => {
    expect(questionPathOf("q1")).toBe("/q/q1");
  });

  it("セッションを渡すと、そのセッションを描く URL を返す", () => {
    expect(questionPathOf("q1", { sessionId: "s1" })).toBe("/q/q1?s=s1");
  });

  it("セッションと発話を渡すと、発話の要素の id をフラグメントに持つ URL を返す", () => {
    const path = questionPathOf("q1", { sessionId: "s1", messageId: "m1" });

    expect(path).toBe(`/q/q1?s=s1#${messageElementIdOf("m1")}`);
  });

  it("組み立てた URL のパスは、ルートの型の [id] を問いの id に置き換えたものと一致する", () => {
    expect(questionPathOf("q1")).toBe(ROUTES.question.replace("[id]", "q1"));
  });
});
