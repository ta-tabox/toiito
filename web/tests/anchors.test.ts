/**
 * 境界（本文の先頭・末尾）・区間の重複・サロゲートペアの三つを、各関数で必ず踏む。
 */

import { describe, expect, it } from "vitest";
import {
  clampToGraphemeBoundary,
  type ExcerptParts,
  excerptParts,
  segmentBody,
} from "@/lib/anchors";

describe("segmentBody", () => {
  it("メモなしは本文全体が1セグメント", () => {
    expect(segmentBody("hello", [])).toEqual([
      { text: "hello", start: 0, memoIds: [] },
    ]);
  });

  it("単一のメモで前後に分割される", () => {
    const segments = segmentBody("hello world", [
      { id: "m1", anchor_start: 6, anchor_end: 11 },
    ]);

    expect(segments).toEqual([
      { text: "hello ", start: 0, memoIds: [] },
      { text: "world", start: 6, memoIds: ["m1"] },
    ]);
  });

  it("隣接する2区間はそれぞれ独立したセグメントになる", () => {
    const segments = segmentBody("abcdef", [
      { id: "m1", anchor_start: 0, anchor_end: 3 },
      { id: "m2", anchor_start: 3, anchor_end: 6 },
    ]);

    expect(segments).toEqual([
      { text: "abc", start: 0, memoIds: ["m1"] },
      { text: "def", start: 3, memoIds: ["m2"] },
    ]);
  });

  it("重複区間は交差部分が複数 memoIds を持つセグメントになる", () => {
    const segments = segmentBody("abcdef", [
      { id: "m1", anchor_start: 0, anchor_end: 4 },
      { id: "m2", anchor_start: 2, anchor_end: 6 },
    ]);

    expect(segments).toEqual([
      { text: "ab", start: 0, memoIds: ["m1"] },
      { text: "cd", start: 2, memoIds: ["m1", "m2"] },
      { text: "ef", start: 4, memoIds: ["m2"] },
    ]);
  });

  it("本文の先頭・末尾ちょうどに接する区間も正しく切れる", () => {
    const segments = segmentBody("abcdef", [
      { id: "m1", anchor_start: 0, anchor_end: 2 },
      { id: "m2", anchor_start: 4, anchor_end: 6 },
    ]);

    expect(segments).toEqual([
      { text: "ab", start: 0, memoIds: ["m1"] },
      { text: "cd", start: 2, memoIds: [] },
      { text: "ef", start: 4, memoIds: ["m2"] },
    ]);
  });

  it("絵文字（サロゲートペア）をまたがない区間はペアを分断しない", () => {
    // "a😀b" — a=0, 😀=1..3（surrogate pair）, b=3
    const segments = segmentBody("a😀b", [
      { id: "m1", anchor_start: 1, anchor_end: 3 },
    ]);

    expect(segments).toEqual([
      { text: "a", start: 0, memoIds: [] },
      { text: "😀", start: 1, memoIds: ["m1"] },
      { text: "b", start: 3, memoIds: [] },
    ]);
  });
});

describe("Segment.absoluteOffset", () => {
  const segments = segmentBody("abcdefghi", [
    { id: "m1", anchor_start: 3, anchor_end: 6 },
  ]);
  // segments: "abc" / "def"(m1) / "ghi"

  it("先頭セグメントの先頭", () => {
    expect(segments[0].absoluteOffset(0)).toBe(0);
  });

  it("中間セグメントの途中", () => {
    expect(segments[1].absoluteOffset(1)).toBe(4); // 'e' の位置
  });

  it("末尾セグメントの途中", () => {
    expect(segments[2].absoluteOffset(2)).toBe(8); // 'i' の位置
  });

  it("セグメント境界ちょうど（前セグメント末尾とオフセット一致）", () => {
    expect(segments[0].absoluteOffset(3)).toBe(3);
    expect(segments[1].absoluteOffset(0)).toBe(3);
  });
});

describe("clampToGraphemeBoundary", () => {
  const body = "a😀b"; // a=0, high=1, low=2, b=3, length=4

  it("書記素の境界はそのまま", () => {
    expect(clampToGraphemeBoundary(body, 0)).toBe(0);
    expect(clampToGraphemeBoundary(body, 1)).toBe(1);
    expect(clampToGraphemeBoundary(body, 3)).toBe(3);
    expect(clampToGraphemeBoundary(body, 4)).toBe(4);
  });

  it("サロゲートペアの途中はペア手前へ丸める", () => {
    expect(clampToGraphemeBoundary(body, 2)).toBe(1);
  });

  it("異体字セレクタは分断しない（サロゲートペアを含まないので code point 判定では漏れる）", () => {
    // "a神︀b" — a=0, 神=1, U+FE00=2, b=3
    expect(clampToGraphemeBoundary("a神︀b", 2)).toBe(1);
  });

  it("ZWJ で連結した絵文字は内部で割らない", () => {
    // "a👨‍👩‍👧b" — 家族は 8 code unit ぶんを 1 書記素として占める
    expect(clampToGraphemeBoundary("a👨‍👩‍👧b", 3)).toBe(1);
    expect(clampToGraphemeBoundary("a👨‍👩‍👧b", 9)).toBe(9);
  });

  it("肌色修飾も分断しない", () => {
    // "a👍🏽b" — 👍(2) + 肌色修飾(2)
    expect(clampToGraphemeBoundary("a👍🏽b", 3)).toBe(1);
  });
});

describe("excerptParts", () => {
  const joined = (parts: ExcerptParts) =>
    `${parts.before}${parts.anchor}${parts.after}`;

  it("アンカー本体と、その前後を切り分ける", () => {
    expect(excerptParts("前置き。ここが焦点。後置き。", 4, 9, 3)).toEqual({
      before: "置き。",
      anchor: "ここが焦点",
      after: "。後置",
    });
  });

  it("margin が本文外へはみ出す場合は本文端で止まる", () => {
    expect(joined(excerptParts("hello", 1, 3, 10))).toBe("hello");
  });

  it("マルチバイト境界にかかる margin は書記素単位に丸められる", () => {
    // "ab😀cd" の添字は a=0,b=1,high=2,low=3,c=4,d=5 で length=6。
    // start(4) - margin(1) = 3 はペアの途中なので、2 まで丸めて絵文字ごと含める。
    expect(joined(excerptParts("ab😀cd", 4, 5, 1))).toBe("😀cd");
  });

  it("異体字セレクタ付きの文字も欠けない", () => {
    // "神︀" は U+795E + U+FE00 の 2 code unit で 1 文字
    expect(joined(excerptParts("x神︀y", 3, 4, 1))).toBe("神︀y");
  });
});
