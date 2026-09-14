import { collectKnownNames, lintSource } from "@scripts/lint-comments.ts";
import { describe, expect, it } from "vitest";

/** `source` を検査し、違反した規則の ID だけを並べて返す。 */
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
    // 冒頭コメントが「無い」のが実態で、直すべきは冒頭コメントの不在。
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

/** 問いを投入する。 */
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
    const source = `${header}/** 名前を返す。 */
export function f(name: string) {
  // @param {string} name
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

/** 一覧を描画する。 */
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
    const source = `${header}/** 1 を返す。 */
export function f() {
  // テストの主題は、対応する実装のファイル名が
  // 既に名指している。
  return 1;
}
`;

    expect(rulesOf(source)).toEqual(["comments/useSentenceEndLineBreak"]);
  });

  it("行末コメントは上下の行と繋げない", () => {
    const source = `${header}export const LOG_LEVELS = [
  "warn", // 続行はするが、記録は残す
  "error", // その場で処理を止める
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
    const source = `${header}/** 文字列を絞り込む。DB へ渡す前に検証する。 */
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
    const source = `${header}/** 1 を返す。 */
export function f() {
  // 隣り合う切断点の間が 1 セグメント。端点そのものなので途中で切れない。
  return 1;
}
`;

    expect(rulesOf(source)).toEqual(["comments/useOneSentencePerLine"]);
  });

  it("英文の終止符では割らせない", () => {
    const source = `${header}/**
 * エントリポイントは lintSource。CLI は node scripts/lint-comments.mts [path...]。
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

describe("禁止語", () => {
  const header = "/**\n * 冒頭。\n */\n\n";

  it("コメント本文の禁止語を error で報告する", () => {
    const source = `${header}/**
 * 未設定なら落とす。
 */
export function f() {}
`;

    expect(lintSource("sample.ts", source)).toEqual([
      {
        line: 6,
        rule: "comments/noBannedWord",
        message:
          "「落とす」は使わない。代わりに throw する / 削除する / 拒否する",
        severity: "error",
      },
    ]);
  });

  it("コード片の中では報告しない", () => {
    const source = `${header}/**
 * \`落とす\` という語をコード片として書く。
 */
export function f() {}
`;

    expect(rulesOf(source)).toEqual([]);
  });

  it("除外語に挙げた複合語では報告しない", () => {
    const source = `${header}/**
 * 入口は lintSource。
 * 直後の空行が JSDoc を分ける目印。
 */
export function f() {}
`;

    expect(rulesOf(source)).toEqual([]);
  });

  it("除外語を取り除いた残りに語があれば報告する", () => {
    const source = `${header}/**
 * 入口は lintSource で、読み込み口は別にある。
 */
export function f() {}
`;

    expect(rulesOf(source)).toEqual(["comments/noBannedWord"]);
  });

  it("コメントの外の文字列リテラルでは報告しない", () => {
    const source = `${header}export const a = "落とす";
`;

    expect(rulesOf(source)).toEqual([]);
  });
});

describe("関数の JSDoc", () => {
  const header = "/**\n * 冒頭。\n */\n\n";

  it("JSDoc の付いた関数は通る", () => {
    const source = `${header}/** 1 を返す。 */
export function f() {
  return 1;
}
`;

    expect(rulesOf(source)).toEqual([]);
  });

  it("JSDoc の無い関数宣言は useJsDocOnFunction", () => {
    const source = `${header}export function f() {
  return 1;
}
`;

    expect(rulesOf(source)).toEqual(["comments/useJsDocOnFunction"]);
  });

  it("関数を初期化子に持つ変数と、関数を包む呼び出しも見る", () => {
    const source = `${header}const f = () => 1;

export const g = cache(async () => 2);
`;

    expect(rulesOf(source)).toEqual([
      "comments/useJsDocOnFunction",
      "comments/useJsDocOnFunction",
    ]);
  });

  it("クラスのメソッドも見る", () => {
    const source = `${header}/** 送信元。 */
class Sender {
  send() {
    return 1;
  }
}
`;

    expect(rulesOf(source)).toEqual(["comments/useJsDocOnFunction"]);
  });

  it("JSDoc と宣言の間にリンタへの指示が挟まっても、JSDoc があると見なす", () => {
    const source = `${header}/** 1 を返す。 */
// biome-ignore lint/style/useNamingConvention: 外部の名前に合わせる
export function limit_value() {
  return 1;
}
`;

    expect(rulesOf(source)).toEqual([]);
  });

  it("関数の中で作る関数は見ない", () => {
    const source = `${header}/** 1 を返す。 */
export function f() {
  const inner = () => 1;

  return inner();
}
`;

    expect(rulesOf(source)).toEqual([]);
  });
});

describe("宣言の直前の行コメント", () => {
  const header = "/**\n * 冒頭。\n */\n\n";

  it("宣言に接した // は noLineCommentBeforeDeclaration", () => {
    const source = `${header}// 上限の値。
export const LIMIT = 1;
`;

    expect(rulesOf(source)).toEqual([
      "comments/noLineCommentBeforeDeclaration",
    ]);
  });

  it("空行を挟んだ // は宣言の説明ではないので通る", () => {
    const source = `${header}// ここから定数。

/** 上限の値。 */
export const LIMIT = 1;
`;

    expect(rulesOf(source)).toEqual([]);
  });

  it("リンタへの指示は説明ではないので通る", () => {
    const source = `${header}/** 上限の値。 */
// biome-ignore lint/style/useNamingConvention: 外部の名前に合わせる
export const limit_value = 1;
`;

    expect(rulesOf(source)).toEqual([]);
  });

  it("関数本体の中の // は見ない", () => {
    const source = `${header}/** 1 を返す。 */
export function f() {
  // 準備。
  const value = 1;

  return value;
}
`;

    expect(rulesOf(source)).toEqual([]);
  });
});

describe("理由の文数", () => {
  const header = "/**\n * 冒頭。\n */\n\n";

  it("空行の下が 2 文までなら通る", () => {
    const source = `${header}/**
 * 1 を返す。
 *
 * 呼び手が値を検証しないので、ここで検証する。
 * 検証は一度で足りる。
 */
export function f() {
  return 1;
}
`;

    expect(rulesOf(source)).toEqual([]);
  });

  it("3 文あれば maxReasonSentences", () => {
    const source = `${header}/**
 * 1 を返す。
 *
 * 一文目。
 * 二文目。
 * 三文目。
 */
export function f() {
  return 1;
}
`;

    expect(rulesOf(source)).toEqual(["comments/maxReasonSentences"]);
  });

  it("呼び手が踏んだ誤りを添えた例外の宣言があれば、3 文あっても通る", () => {
    const source = `${header}/**
 * 1 を返す。
 *
 * 一文目。
 * 二文目。
 * 三文目。
 */
// lint-comments-allow comments/maxReasonSentences: 呼び手が戻り値を検証せずに渡した
export function f() {
  return 1;
}
`;

    expect(rulesOf(source)).toEqual([]);
  });

  it("誤りを書かない例外の宣言では、上限から外さない", () => {
    const source = `${header}/**
 * 1 を返す。
 *
 * 一文目。
 * 二文目。
 * 三文目。
 */
// lint-comments-allow comments/maxReasonSentences:
export function f() {
  return 1;
}
`;

    expect(rulesOf(source)).toEqual(["comments/maxReasonSentences"]);
  });

  it("空行より上の要約は数えない", () => {
    const source = `${header}/**
 * 1 を返す。
 * 引数は取らない。
 * 副作用も無い。
 */
export function f() {
  return 1;
}
`;

    expect(rulesOf(source)).toEqual([]);
  });

  it("箇条の行は数えない", () => {
    const source = `${header}/**
 * 1 を返す。
 *
 * 見るのは次の三つ。
 * - 先頭
 * - 末尾
 * - 中央
 */
export function f() {
  return 1;
}
`;

    expect(rulesOf(source)).toEqual([]);
  });

  it("定数の JSDoc は数えない", () => {
    const source = `${header}/**
 * 上限の値。
 *
 * 一文目。
 * 二文目。
 * 三文目。
 */
export const LIMIT = 1;
`;

    expect(rulesOf(source)).toEqual([]);
  });

  it("3 文目の行番号を報告する", () => {
    const source = `${header}/**
 * 1 を返す。
 *
 * 一文目。
 * 二文目。
 * 三文目。
 */
export function f() {
  return 1;
}
`;

    expect(lintSource("sample.ts", source)[0].line).toBe(10);
  });
});

describe("名指した識別子の実在", () => {
  const header = "/**\n * 冒頭。\n */\n\n";

  it("同じファイルに現れる識別子は通る", () => {
    const source = `${header}/** \`limitOf\` の結果を返す。 */
export function f() {
  return limitOf(1);
}
`;

    expect(rulesOf(source)).toEqual([]);
  });

  it("どこにも現れない識別子は useExistingIdentifier", () => {
    const source = `${header}/** \`oldName\` の結果を返す。 */
export function f() {
  return newName(1);
}
`;

    expect(rulesOf(source)).toEqual(["comments/useExistingIdentifier"]);
  });

  it("他のファイルに現れる識別子は、集めた名前を渡せば通る", () => {
    const other = {
      fileName: "src/lib/other.ts",
      text: "export function helperOf() {}\n",
    };
    const source = `${header}/** \`helperOf\` を呼ぶ。 */
export function f() {
  return 1;
}
`;
    const known = collectKnownNames([
      other,
      { fileName: "sample.ts", text: source },
    ]);

    expect(lintSource("sample.ts", source, known).map((v) => v.rule)).toEqual(
      [],
    );
  });

  it("文字列リテラルに現れる名前も通る", () => {
    const source = `${header}/** \`TOIITO_FAKE_AI\` を読む。 */
export function f() {
  return process.env["TOIITO_FAKE_AI"];
}
`;

    expect(rulesOf(source)).toEqual([]);
  });

  it("小文字だけの語と、識別子でない字面は見ない", () => {
    const source = `${header}/** \`git\` と \`pnpm check\` と \`a.b()\` を書く。 */
export function f() {
  return 1;
}
`;

    expect(rulesOf(source)).toEqual([]);
  });

  it("実在しないファイル名は useExistingIdentifier", () => {
    const source = `${header}/** 正は \`auth.ts\` が持つ。 */
export function f() {
  return 1;
}
`;

    expect(rulesOf(source)).toEqual(["comments/useExistingIdentifier"]);
  });

  it("検査対象のファイルの末尾に一致するパスは通る", () => {
    const other = { fileName: "src/lib/auth/index.ts", text: "" };
    const source = `${header}/** 正は \`lib/auth/index.ts\` が持つ。 */
export function f() {
  return 1;
}
`;
    const known = collectKnownNames([
      other,
      { fileName: "sample.ts", text: source },
    ]);

    expect(lintSource("sample.ts", source, known).map((v) => v.rule)).toEqual(
      [],
    );
  });

  it("検査の対象に集めない拡張子のファイル名は見ない", () => {
    const source = `${header}/** 設定は \`postcss.config.mjs\` と \`globals.css\` が持つ。 */
export function f() {
  return 1;
}
`;

    expect(rulesOf(source)).toEqual([]);
  });

  it("例として挙げた名前は実在しなくてよい", () => {
    const source = `${header}/** \`foo.test.ts\` のような名前を指す。 */
export function f() {
  return 1;
}
`;

    expect(rulesOf(source)).toEqual([]);
  });
});

describe("継ぎ足しの ——", () => {
  const header = "/**\n * 冒頭。\n */\n\n";

  it("文の末尾へ —— で継ぎ足していれば noDanglingEmDash", () => {
    const source = `${header}/**
 * 1 を返す——引数は取らない。
 */
export function f() {
  return 1;
}
`;

    expect(rulesOf(source)).toEqual(["comments/noDanglingEmDash"]);
  });

  it("対で挟む挿入は通る", () => {
    const source = `${header}/**
 * 戻せない操作——force push・履歴の書き換え——は人間に訊く。
 */
export function f() {
  return 1;
}
`;

    expect(rulesOf(source)).toEqual([]);
  });

  it("括弧の内側の —— は通る", () => {
    const source = `${header}/**
 * 二体は逐次に呼ぶ（並列にしない——ai_b は ai_a への応答である）。
 */
export function f() {
  return 1;
}
`;

    expect(rulesOf(source)).toEqual([]);
  });

  it("コード片の中の —— は見ない", () => {
    const source = `${header}/**
 * 区切りは \`——\` で書く。
 */
export function f() {
  return 1;
}
`;

    expect(rulesOf(source)).toEqual([]);
  });
});
