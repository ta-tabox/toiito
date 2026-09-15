/**
 * 人間が選べる `status` の検査。
 * 通る値と、通らない値（機械だけが書く値・未知の文字列）を対で見る。
 */

import { describe, expect, it } from "vitest";
import { parseSelectableStatus, SELECTABLE_STATUSES } from "@/lib/question";

describe("parseSelectableStatus", () => {
  it.each(["resolved", "exported", "holding", "permanent", "discarded"])(
    "人間が選べる %s はそのまま返す",
    (value) => {
      expect(parseSelectableStatus(value)).toBe(value);
    },
  );

  it.each(["new", "stocked"])("機械だけが書く %s は throw する", (value) => {
    expect(() => parseSelectableStatus(value)).toThrow();
  });

  it.each(["", "closed", "Resolved"])(
    "未知の文字列 %j は throw する",
    (value) => {
      expect(() => parseSelectableStatus(value)).toThrow();
    },
  );
});

describe("SELECTABLE_STATUSES", () => {
  it("人間が選べる値を QUESTION_STATUSES の順に並べる", () => {
    expect(SELECTABLE_STATUSES).toEqual([
      "resolved",
      "exported",
      "holding",
      "permanent",
      "discarded",
    ]);
  });
});
