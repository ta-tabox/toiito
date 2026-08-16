import { lintSource } from "@scripts/lint-comments.mts";
import { describe, expect, it } from "vitest";

function rulesOf(source: string, fileName = "sample.ts"): string[] {
  return lintSource(fileName, source).map((violation) => violation.rule);
}

describe("モジュール冒頭コメント", () => {
  it("/** */ の冒頭コメントと空行があれば通る", () => {
    const source = `/**
 * 問いのドメイン。値域と、そこから派生する判定を持つ。
 */

export const a = 1;
`;

    expect(rulesOf(source)).toEqual([]);
  });

  it("冒頭コメントが無ければ useModuleHeader", () => {
    expect(rulesOf('import fs from "node:fs";\n')).toEqual([
      "comments/useModuleHeader",
    ]);
  });

  it("// で書かれていれば useJsDocModuleHeader", () => {
    const source = `// 問いのドメイン。

export const a = 1;
`;

    expect(rulesOf(source)).toEqual(["comments/useJsDocModuleHeader"]);
  });

  it("import に接した冒頭コメントは、空行が無ければ useBlankLineAfterModuleHeader", () => {
    const source = `/**
 * 問いのドメイン。
 */
import fs from "node:fs";
`;

    expect(rulesOf(source)).toEqual(["comments/useBlankLineAfterModuleHeader"]);
  });

  it("宣言に接した JSDoc は冒頭コメントに数えない（useModuleHeader）", () => {
    const source = `/**
 * 問いを投入する。
 */
export function createQuestion() {}
`;

    // 空行を置けと促すと、この JSDoc を関数から剥がすことになる。
    // 冒頭コメントが「無い」のが実態で、直すべきはそちら。
    expect(rulesOf(source)).toEqual(["comments/useModuleHeader"]);
  });

  it("冒頭コメントと宣言の JSDoc が続くときは、冒頭コメントの側を見る", () => {
    const source = `/**
 * 問いのドメイン。
 */
/**
 * 問いを投入する。
 */
export function createQuestion() {}
`;

    expect(rulesOf(source)).toEqual(["comments/useBlankLineAfterModuleHeader"]);
  });

  it('"use server" の後に置いた冒頭コメントも冒頭として認める', () => {
    const source = `"use server";

/**
 * 問い投入の Server Action。
 */

export async function act() {}
`;

    expect(rulesOf(source)).toEqual([]);
  });

  it("冒頭コメントの行番号を報告する", () => {
    const source = `// 問いのドメイン。

export const a = 1;
`;

    expect(lintSource("sample.ts", source)[0].line).toBe(1);
  });
});

describe("JSDoc の型注釈", () => {
  const header = "/**\n * 冒頭。\n */\n\n";

  it("@param の型注釈を検出する", () => {
    const source = `${header}/**
 * @param {string} name 表示名
 */
export function f(name: string) {
  return name;
}
`;

    expect(rulesOf(source)).toEqual(["comments/noJsDocTypeAnnotation"]);
  });

  it("@returns の型注釈も検出する", () => {
    const source = `${header}/**
 * @returns {number} 件数
 */
export function f() {
  return 1;
}
`;

    expect(rulesOf(source)).toEqual(["comments/noJsDocTypeAnnotation"]);
  });

  it("型を伴わない @param は通す（型が語れない制約はここに書く）", () => {
    const source = `${header}/**
 * @param offset UTF-16 code unit 単位。コードポイントではない
 */
export function f(offset: number) {
  return offset;
}
`;

    expect(rulesOf(source)).toEqual([]);
  });

  it("// コメント内の記述は JSDoc として扱わない", () => {
    const source = `${header}// @param {string} name
export function f(name: string) {
  return name;
}
`;

    expect(rulesOf(source)).toEqual([]);
  });
});

describe("字面でなく構文で見ていること", () => {
  it("文字列リテラル中のコメント開始記号に騙されない", () => {
    const source = `const url = "https://example.com";

export const a = url;
`;

    // 冒頭コメント欠如の一件だけが出る。url の // をコメントと読むと
    // useJsDocModuleHeader も一緒に出て、指摘が二重になる。
    expect(rulesOf(source)).toEqual(["comments/useModuleHeader"]);
  });

  it("tsx の JSX テキスト中の記号にも騙されない", () => {
    const source = `/**
 * 一覧画面。
 */

export default function Page() {
  return <p>https://example.com</p>;
}
`;

    expect(rulesOf(source, "page.tsx")).toEqual([]);
  });
});
