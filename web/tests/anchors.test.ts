// anchors.ts のテスト。境界（本文の先頭・末尾）・区間の重複・サロゲートペアの
// 三つを各関数で必ず踏む。

import { describe, expect, it } from "vitest";
import { clampToCodePoint, excerpt, segmentBody } from "@/lib/anchors";

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

describe("clampToCodePoint", () => {
  const body = "a😀b"; // a=0, high=1, low=2, b=3, length=4

  it("ペアの前後（有効な境界）はそのまま", () => {
    expect(clampToCodePoint(body, 0)).toBe(0);
    expect(clampToCodePoint(body, 1)).toBe(1);
    expect(clampToCodePoint(body, 3)).toBe(3);
    expect(clampToCodePoint(body, 4)).toBe(4);
  });

  it("ペアの途中を指す場合はペア手前へ丸める", () => {
    expect(clampToCodePoint(body, 2)).toBe(1);
  });
});

describe("excerpt", () => {
  it("margin が本文外へはみ出す場合は本文端で止まる", () => {
    expect(excerpt("hello", 1, 3, 10)).toBe("hello");
  });

  it("マルチバイト境界にかかる margin はコードポイント単位に丸められる", () => {
    // "ab😀cd" — a=0,b=1,high=2,low=3,c=4,d=5,length=6
    // start(4) - margin(1) = 3 はペアの途中 → 2 まで丸めて絵文字ごと含める
    expect(excerpt("ab😀cd", 4, 5, 1)).toBe("😀cd");
  });
});
