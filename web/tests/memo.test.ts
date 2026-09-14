/**
 * メモのキーワードの検証を、通る入力と throw する入力の対で検査する。
 */

import { describe, expect, it } from "vitest";
import { parseMemoKeyword } from "@/lib/memo";

describe("parseMemoKeyword", () => {
  it("前後の空白と改行を除いた文字列を返す", () => {
    expect(parseMemoKeyword("  問いの形\n")).toBe("問いの形");
  });

  it("語の内側の空白は除かない", () => {
    expect(parseMemoKeyword("問い の 形")).toBe("問い の 形");
  });

  it("全角の空白・改行・タブだけの文字列は throw する", () => {
    expect(() => parseMemoKeyword("　\n\t ")).toThrow(/空か空白だけ/);
  });

  it("空文字は throw する", () => {
    expect(() => parseMemoKeyword("")).toThrow(/空か空白だけ/);
  });
});
