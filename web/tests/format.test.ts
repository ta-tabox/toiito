import { describe, expect, it } from "vitest";
import { formatTimestamp } from "@/lib/format";

describe("formatTimestamp", () => {
  it("UTC の瞬間を JST として表示する", () => {
    expect(formatTimestamp(new Date("2026-07-17T13:08:06Z"))).toBe(
      "2026-07-17 22:08",
    );
  });

  it("日付をまたぐ時差も繰り上がる", () => {
    expect(formatTimestamp(new Date("2026-07-17T15:30:00Z"))).toBe(
      "2026-07-18 00:30",
    );
  });

  it("実行環境のタイムゾーンに左右されない", () => {
    const tz = process.env.TZ;
    process.env.TZ = "America/New_York";

    try {
      expect(formatTimestamp(new Date("2026-07-17T13:08:06Z"))).toBe(
        "2026-07-17 22:08",
      );
    } finally {
      process.env.TZ = tz;
    }
  });
});
