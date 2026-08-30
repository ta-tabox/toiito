import { describe, expect, it } from "vitest";
import { isEffort } from "@/lib/effort";

describe("effort の値域", () => {
  it("API の値域だけを通す", () => {
    expect(isEffort("medium")).toBe(true);
    expect(isEffort("xhigh")).toBe(true);
    expect(isEffort("middle")).toBe(false);
    expect(isEffort("")).toBe(false);
  });
});
