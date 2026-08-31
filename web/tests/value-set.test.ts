/**
 * 値域の関門の検査。
 * 値域そのものを持つ側（プロバイダ等）から切り出した、絞り込みの手順だけを見る。
 */

import { describe, expect, it } from "vitest";
import { valueSet } from "@/lib/value-set";

const SIZES = valueSet(["small", "large"]);

describe("includes", () => {
  it("値域の中だけを通す", () => {
    expect(SIZES.includes("small")).toBe(true);
    expect(SIZES.includes("medium")).toBe(false);
    expect(SIZES.includes("")).toBe(false);
  });
});

describe("from", () => {
  it("値域の中はそのまま返す", () => {
    expect(SIZES.from("large")).toBe("large");
  });

  it("未設定と綴り違いはどちらも undefined へ倒す", () => {
    expect(SIZES.from(undefined)).toBeUndefined();
    expect(SIZES.from("Large")).toBeUndefined();
    expect(SIZES.from("")).toBeUndefined();
  });
});
