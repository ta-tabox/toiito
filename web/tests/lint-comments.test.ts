import { lintSource } from "@scripts/lint-comments.ts";
import { describe, expect, it } from "vitest";

function rulesOf(source: string, fileName = "sample.ts"): string[] {
  return lintSource(fileName, source).map((violation) => violation.rule);
}

describe("モジュール冒頭コメント", () => {
  it("/** */ の冒頭コメントと空行があれば通る", () => {
    const source = `/**
 * 問いのドメイン。
 * 値域と、そこから派生する判定を持つ。
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

describe("テストファイルの免除", () => {
  it("冒頭コメントが無くても通る", () => {
    const source = 'import { it } from "vitest";\n';

    expect(rulesOf(source, "src/app/page.test.tsx")).toEqual([]);
  });

  it("spec という名前も同じに扱う", () => {
    const source = 'import { it } from "vitest";\n';

    expect(rulesOf(source, "src/lib/range.spec.ts")).toEqual([]);
  });

  it("免れるのは要求だけで、書いたなら /** */ を要求する", () => {
    const source = `// 区間の重なりの検査。

import { it } from "vitest";
`;

    expect(rulesOf(source, "src/lib/range.test.ts")).toEqual([
      "comments/useJsDocModuleHeader",
    ]);
  });

  it("書式の規則はテストにも当たる", () => {
    const source = `// 境界は含む。ここは 2 文目。

import { it } from "vitest";
`;

    expect(rulesOf(source, "src/lib/range.test.ts")).toContain(
      "comments/useOneSentencePerLine",
    );
  });

  it("test.ts という名前そのものは免除しない", () => {
    const source = 'import { it } from "vitest";\n';

    expect(rulesOf(source, "src/test.ts")).toEqual([
      "comments/useModuleHeader",
    ]);
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
 * @param offset UTF-16 code unit 単位（コードポイントではない）
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

    // 冒頭コメント欠如の一件だけが出る。
    // url の // をコメントと読むと useJsDocModuleHeader も一緒に出て、指摘が二重になる。
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

describe("改行の位置", () => {
  const header = "/**\n * 冒頭。\n */\n\n";

  it("句点で閉じた行が続くのは通る", () => {
    const source = `${header}/**
 * 本文を切り分けた一区間。
 * UI はこれを 1 単位として下線を描く。
 */
export function f() {}
`;

    expect(rulesOf(source)).toEqual([]);
  });

  it("文の途中で改行していれば useSentenceEndLineBreak", () => {
    const source = `${header}/**
 * セグメント内オフセットを絶対オフセットへ戻すたびに
 * 手前のセグメントを全部足し直すことになる。
 */
export function f() {}
`;

    expect(rulesOf(source)).toEqual(["comments/useSentenceEndLineBreak"]);
  });

  it("読点で折った行も捕まえる", () => {
    const source = `${header}/**
 * 複数のメモが同じ範囲に重なりうるので、
 * UI は重なりの有無で描き分ける。
 */
export function f() {}
`;

    // 読点は日本語の意味の切れ目ではあるが、桁で折った跡と見分けが付かない。
    // 折りたくなった時点で、それは折る合図ではなく文を割る合図。
    expect(rulesOf(source)).toEqual(["comments/useSentenceEndLineBreak"]);
  });

  it("英文の終止符も文の終わりと見なす", () => {
    const source = `${header}/**
 * Offsets are UTF-16 code units.
 * Code points are not the unit here.
 */
export function f() {}
`;

    expect(rulesOf(source)).toEqual([]);
  });

  it("空行を挟んだ段落の切れ目では見ない", () => {
    const source = `${header}/**
 * 問いのドメイン
 *
 * 値域と、そこから派生する判定を持つ。
 */
export function f() {}
`;

    expect(rulesOf(source)).toEqual([]);
  });

  it("次行が箇条・矢印で始まるなら文の続きではない", () => {
    const source = `${header}/**
 * 例: 本文 "abcdef" にメモ m1(0-4) と m2(2-6) が付く場合
 *   → "ab"[m1] / "cd"[m1,m2] / "ef"[m2]
 */
export function f() {}
`;

    expect(rulesOf(source)).toEqual([]);
  });

  it("表の行は散文でないと宣言できる", () => {
    const source = `${header}/**
 * 対応表を持つ。
 * | 記号 | 意味 |
 * | --- | --- |
 * | a | 先頭 |
 *
 * 表の後ろの散文。
 */
export function f() {}
`;

    expect(rulesOf(source)).toEqual([]);
  });

  it("コードフェンスの内側は見ない", () => {
    const source = `${header}/**
 * 呼び出しの形。
 * \`\`\`ts
 * lintSource("a.ts", text);
 * \`\`\`
 *
 * フェンスの後ろの散文。
 */
export function f() {}
`;

    // 区間はフェンスの行ごと空行に見せる。
    // コードは散文でないので行末の記号に意味が無く、フェンスの行そのものも散文ではない。
    expect(rulesOf(source)).toEqual([]);
  });

  it("閉じないフェンスは塊の末尾までを区間と見なす", () => {
    const source = `${header}/**
 * 呼び出しの形。
 * \`\`\`ts
 * lintSource("a.ts", text);
 */
export function f() {}
`;

    expect(rulesOf(source)).toEqual([]);
  });

  it("フェンスの外へ戻れば見る", () => {
    const source = `${header}/**
 * 呼び出しの形。
 * \`\`\`ts
 * lintSource("a.ts", text);
 * \`\`\`
 * ここは散文で、句点を欠いたまま
 * 次の行へ続いている。
 */
export function f() {}
`;

    expect(rulesOf(source)).toEqual(["comments/useSentenceEndLineBreak"]);
  });

  it("連続する行コメントも一つの塊として見る", () => {
    const source = `${header}// テストの主題は、対応する実装のファイル名が
// 既に名指している。
export const a = 1;
`;

    expect(rulesOf(source)).toEqual(["comments/useSentenceEndLineBreak"]);
  });

  it("行末コメントは上下の行と繋げない", () => {
    const source = `${header}export const QUESTION_STATUSES = [
  "new", // 仕込んだが、まだ材料が付いていない
  "stocked", // 材料が付き、蒸留に入れる
] as const;
`;

    // 各行が手前のコードに付く独立した注釈で、三行で一つの文を成してはいない。
    expect(rulesOf(source)).toEqual([]);
  });

  it("折れた行の行番号を報告する", () => {
    const source = `/**
 * 冒頭。
 *
 * ここで文が終わらずに
 * 次の行へ続いている。
 */

export const a = 1;
`;

    expect(lintSource("sample.ts", source)[0].line).toBe(4);
  });
});

describe("一文一行", () => {
  const header = "/**\n * 冒頭。\n */\n\n";

  it("1 行 1 文なら通る", () => {
    const source = `${header}/**
 * 問いのドメイン。
 * 値域と、そこから派生する判定を持つ。
 */
export function f() {}
`;

    expect(rulesOf(source)).toEqual([]);
  });

  it("1 行に 2 文あれば useOneSentencePerLine", () => {
    const source = `${header}/**
 * 問いのドメイン。値域と、そこから派生する判定を持つ。
 */
export function f() {}
`;

    expect(rulesOf(source)).toEqual(["comments/useOneSentencePerLine"]);
  });

  it("括弧の内側の句点では割らせない", () => {
    const source = `${header}/**
 * body は原型（投入された生の問い。訂正以外では書き換えない）を持つ。
 */
export function f() {}
`;

    // 括弧が閉じるまで文は終わっていない。
    // ここで割ると括弧が行を跨ぐ。
    expect(rulesOf(source)).toEqual([]);
  });

  it("句点の後ろの閉じ強調では割らせない", () => {
    const source = `${header}/**
 * **赤のままコミットしない。**
 */
export function f() {}
`;

    // 強調の内側に句点を置いた形は 1 文である。
    // ここで割ると強調が行を跨ぐか、句点を強調の外へ動かすことになる。
    expect(rulesOf(source)).toEqual([]);
  });

  it("飾りの後ろに本文が続けば割らせる", () => {
    const source = `${header}/**
 * **赤のままコミットしない。** 直してから積む。
 */
export function f() {}
`;

    expect(rulesOf(source)).toEqual(["comments/useOneSentencePerLine"]);
  });

  it("行を跨いだ括弧の後ろ半分は 1 文と数える", () => {
    const source = `${header}/**
 * body は原型を持つ（投入された生の問い。
 * 訂正以外では書き換えない。）
 */
export function f() {}
`;

    // 開きは前の行にあるので、2 行目の閉じ括弧は深さで免除できない。
    expect(rulesOf(source)).toEqual([]);
  });

  it("1 行完結の JSDoc も見る", () => {
    const source = `${header}/** 文字列を絞り込む。DB へ渡す前の関門。 */
export function f() {}
`;

    expect(rulesOf(source)).toEqual(["comments/useOneSentencePerLine"]);
  });

  it("1 文だけの 1 行 JSDoc は通る", () => {
    const source = `${header}/** 文字列を QuestionStatus へ絞り込む。 */
export function f() {}
`;

    expect(rulesOf(source)).toEqual([]);
  });

  it("行コメントも見る", () => {
    const source = `${header}export function f() {
  // 隣り合う切断点の間が 1 セグメント。端点そのものなので途中で切れない。
  return 1;
}
`;

    expect(rulesOf(source)).toEqual(["comments/useOneSentencePerLine"]);
  });

  it("英文の終止符では割らせない", () => {
    const source = `${header}/**
 * 入口は lintSource。CLI は node scripts/lint-comments.mts [path...]。
 */
export function f() {}
`;

    // 句点で 1 回割れば済む。
    // ファイル名や拡張子のドットを文の終わりに数えると、パスを書いた行がすべて違反になる。
    expect(rulesOf(source)).toEqual(["comments/useOneSentencePerLine"]);
  });

  it("2 文目のある行の行番号を報告する", () => {
    const source = `/**
 * 冒頭。
 *
 * ここで 1 文目。ここが 2 文目。
 */

export const a = 1;
`;

    expect(lintSource("sample.ts", source)[0].line).toBe(4);
  });
});
