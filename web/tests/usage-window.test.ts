import { describe, expect, it } from "vitest";
import { USAGE_WINDOW_DAYS, usageWindowStartOf } from "@/lib/usage-window";

describe("usageWindowStartOf", () => {
  it("現在時刻から集計の日数だけさかのぼった瞬間を、日付の境目に丸めずに返す", () => {
    const now = new Date("2026-09-27T12:34:56.789Z");

    const start = usageWindowStartOf(now);

    expect(now.getTime() - start.getTime()).toBe(
      USAGE_WINDOW_DAYS * 24 * 60 * 60 * 1000,
    );
  });
});
