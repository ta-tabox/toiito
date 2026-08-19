/**
 * コメント規約のうち、Biome が構造的に検出できない分だけを見る検査器（L1）。
 *
 * Biome のリンタはコメントを走査対象に持たない。
 * built-in ルールにも GritQL プラグインにも、コメント本体へ届く経路が無い。
 * ここが引き受けるのはその穴だけで、コメント以外の作法は biome.json 側に置く。
 * 同じ規約を二箇所に書かない。
 *
 * 判定は TypeScript の API へ渡す。
 * 行単位の正規表現では文字列リテラル中の記号と本物のコメントを区別できず、規約の検査器自身が嘘をつく。
 *
 * Biome も vcs.useIgnoreFile で同じ正を見るので、対象から外すものは .gitignore が正。
 * 独自の除外リストを持つと、生成物（src/generated）の扱いが Biome と食い違う。
 *
 * 入口は lintSource。
 * CLI は node scripts/lint-comments.mts [path...]。
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

export type Violation = {
  line: number;
  rule: string;
  message: string;
};

type CommentRange = {
  start: number;
  end: number;
  text: string;
};

/** コメントから綴りの装飾を剥がした 1 行と、それが元のファイルで居た行番号。 */
type CommentLine = {
  line: number;
  text: string;
};

// 既定の対象から tests を外している。
// テストの主題は対応する実装のファイル名が既に名指しており、冒頭コメントを要求すると規約が禁じている「ファイル名の言い換え」を量産することになる。
const DEFAULT_TARGETS = ["src", "scripts"];

const SOURCE_EXTENSIONS = [".ts", ".tsx", ".mts"];

// TS の型と重複する JSDoc の型注釈。
// @param {string} name の {string} を指す。
const JSDOC_TYPE_ANNOTATION = /@(param|returns?)\s*\{/g;

/**
 * 文がそこで閉じている印。
 * 日本語の句点と、英文・コード片の終止符。
 */
const SENTENCE_END = /[。.]$/;

/**
 * 箇条書きの行頭。
 * 散文の続きではないので、手前の行から文が流れ込んでいない。
 */
const LIST_MARKER = /^(?:[-*・→]|\d+[.)])/;

/**
 * 括弧の始まり。
 * 閉じるまで文は終わっていないので、内側の句点は文の切れ目に数えない。
 */
const BRACKET_OPEN = "（(「【";

/** 括弧の終わり。 */
const BRACKET_CLOSE = "）)」】";

export function lintSource(fileName: string, text: string): Violation[] {
  const source = ts.createSourceFile(
    fileName,
    text,
    ts.ScriptTarget.Latest,
    true,
  );
  const comments = collectLeadingComments(source, text);

  return [
    ...checkModuleHeader(source, text, comments),
    ...checkJsDocTypeAnnotations(source, comments),
    ...checkSentenceEndLineBreaks(source, comments),
    ...checkOneSentencePerLine(source, comments),
  ];
}

/**
 * 冒頭コメントを、それが飾る本体の直前まで遡って探す。
 *
 * "use server" のようなディレクティブは本体に数えない。
 * ディレクティブの前後どちらに冒頭コメントを置いても構文上は正しく、位置まで縛る理由が無い。
 */
function checkModuleHeader(
  source: ts.SourceFile,
  text: string,
  comments: CommentRange[],
): Violation[] {
  const body = firstNonDirectiveStatement(source);
  const bodyStart =
    body?.getStart(source) ?? source.endOfFileToken.getStart(source);
  const leading = comments.filter((comment) => comment.end <= bodyStart);
  const header = leading[0];
  const missing = {
    line: lineOf(source, bodyStart),
    rule: "comments/useModuleHeader",
    message:
      "モジュール冒頭コメントが無い。責務と、引き受けない境界を書く（ファイル名の言い換えにしない）",
  };

  if (header === undefined) {
    return [missing];
  }

  // 空行を挟まず宣言に接したコメントは、その宣言の JSDoc であってモジュールへの注釈ではない。
  // TS もエディタもそう読む。
  // ここを冒頭コメントとして数えると、「空行を置け」と促した結果、宣言から JSDoc を剥がすことになる。
  if (
    header === leading[leading.length - 1] &&
    !isFollowedByBlankLine(text, header.end) &&
    body !== undefined &&
    takesDocComment(body)
  ) {
    return [missing];
  }

  if (!header.text.startsWith("/**")) {
    return [
      {
        line: lineOf(source, header.start),
        rule: "comments/useJsDocModuleHeader",
        message: "モジュール冒頭コメントは /** */ で書く",
      },
    ];
  }

  // 直後の空行が、モジュールへの注釈と直下の宣言への JSDoc を分ける唯一の目印。
  // 空行を挟まないと TS もエディタも、これを次の宣言のドキュメントとして扱う。
  if (!isFollowedByBlankLine(text, header.end)) {
    return [
      {
        line: lineOf(source, header.end),
        rule: "comments/useBlankLineAfterModuleHeader",
        message:
          "モジュール冒頭コメントの後に空行を置く。空行が無いと直下の宣言への JSDoc として読まれる",
      },
    ];
  }

  return [];
}

function checkJsDocTypeAnnotations(
  source: ts.SourceFile,
  comments: CommentRange[],
): Violation[] {
  const violations: Violation[] = [];

  for (const comment of comments) {
    if (!comment.text.startsWith("/**")) {
      continue;
    }

    for (const match of comment.text.matchAll(JSDOC_TYPE_ANNOTATION)) {
      violations.push({
        line: lineOf(source, comment.start + match.index),
        rule: "comments/noJsDocTypeAnnotation",
        message: `@${match[1]} の型注釈は TS の型と重複する。型が語れない制約だけ書く`,
      });
    }
  }

  return violations;
}

/**
 * 改行が文の途中に入っていないかを見る。
 *
 * 句点で閉じていない行の次に本文が続いていたら、そこは文の切れ目ではなく桁で折った跡。
 * 日本語としては意味の切れ目だが、桁で折った跡と機械には見分けが付かないので、読点で折った場合も捕まえる。
 */
function checkSentenceEndLineBreaks(
  source: ts.SourceFile,
  comments: CommentRange[],
): Violation[] {
  const violations: Violation[] = [];

  for (const block of toCommentBlocks(source, comments)) {
    for (const [index, current] of block.slice(0, -1).entries()) {
      const next = block[index + 1];

      if (current.text === "" || next.text === "") {
        continue;
      }

      if (SENTENCE_END.test(current.text) || LIST_MARKER.test(next.text)) {
        continue;
      }

      violations.push({
        line: current.line,
        rule: "comments/useSentenceEndLineBreak",
        message:
          "文の途中で改行している。次の行と繋ぐか、二文に割る。桁で折ると一語足しただけで段落全体の diff になり、日本語は語間に空白が無いので改行が無かった境界を新しく挿入する",
      });
    }
  }

  return violations;
}

/**
 * 1 行に 2 文以上置いていないかを見る。
 *
 * 一文一行なら、一文直したときの diff が 1 行で済み、レビューで「この文」を指せる。
 * 桁で折らない理由がそれなので、文の途中で折らないだけでは足りない。
 */
function checkOneSentencePerLine(
  source: ts.SourceFile,
  comments: CommentRange[],
): Violation[] {
  const violations: Violation[] = [];

  for (const block of toCommentBlocks(source, comments)) {
    for (const line of block) {
      if (!hasSentenceBreakInside(line.text)) {
        continue;
      }

      violations.push({
        line: line.line,
        rule: "comments/useOneSentencePerLine",
        message:
          "1 行に 2 文以上ある。句点で割る。一文一行なら、一文直したときの diff が 1 行で済み、レビューで「この文」を指せる",
      });
    }
  }

  return violations;
}

/**
 * 行末より手前に文の切れ目があるか。
 * 括弧の内側の句点は数えない。
 */
function hasSentenceBreakInside(text: string): boolean {
  let depth = 0;

  for (let index = 0; index < text.length; index++) {
    const char = text[index];

    if (BRACKET_OPEN.includes(char)) {
      depth++;
      continue;
    }

    if (BRACKET_CLOSE.includes(char)) {
      depth = Math.max(0, depth - 1);
      continue;
    }

    if (char === "。" && depth === 0 && index < text.length - 1) {
      return true;
    }
  }

  return false;
}

/**
 * コメントを、一つの文が跨りうる範囲＝塊へまとめる。
 *
 * ブロックコメント 1 つが 1 塊で、連続する行コメントの並びも 1 塊。
 * getLeadingCommentRanges は直前に改行が無いコメントを leading と見なさないので、行末コメントは収集の時点で落ちている。
 * 拾うように変えると、値ごとに注釈を添えた配列がまるごと違反になる。
 */
function toCommentBlocks(
  source: ts.SourceFile,
  comments: CommentRange[],
): CommentLine[][] {
  const blocks: CommentLine[][] = [];
  let run: CommentLine[] = [];
  let runEnd = 0;

  const flushRun = (): void => {
    if (run.length > 0) {
      blocks.push(run);
      run = [];
    }
  };

  for (const comment of comments) {
    const first = lineOf(source, comment.start);

    if (!comment.text.startsWith("//")) {
      flushRun();
      runEnd = 0;
      blocks.push(
        comment.text.split("\n").map((line, offset) => ({
          line: first + offset,
          text: stripDecoration(line),
        })),
      );
      continue;
    }

    if (first !== runEnd + 1) {
      flushRun();
    }

    run.push({ line: first, text: stripDecoration(comment.text) });
    runEnd = first;
  }

  flushRun();

  return blocks;
}

/** コメントの綴り（`//`・`/*`・行頭の `*`・閉じ）を落として本文だけにする。 */
function stripDecoration(line: string): string {
  return line
    .replace(/^\s*(?:\/\*\*?|\/\/)/, "")
    .replace(/^\s*\*(?!\/)/, "")
    .replace(/\*\/\s*$/, "")
    .trim();
}

function collectLeadingComments(
  source: ts.SourceFile,
  text: string,
): CommentRange[] {
  const comments: CommentRange[] = [];
  const seen = new Set<number>();

  const visit = (node: ts.Node): void => {
    const ranges = ts.getLeadingCommentRanges(text, node.getFullStart()) ?? [];

    for (const range of ranges) {
      if (seen.has(range.pos)) {
        continue;
      }

      seen.add(range.pos);
      comments.push({
        start: range.pos,
        end: range.end,
        text: text.slice(range.pos, range.end),
      });
    }

    node.forEachChild(visit);
  };
  visit(source);

  return comments.sort((a, b) => a.start - b.start);
}

function firstNonDirectiveStatement(
  source: ts.SourceFile,
): ts.Statement | undefined {
  return source.statements.find((statement) => !isDirective(statement));
}

/**
 * その文が doc コメントを持ちうるか。
 *
 * import / export 宣言は説明を持たないので、直前のコメントは行き場が無くモジュールへの注釈にしかなりえない。
 * 関数・型・定数はその逆。
 */
function takesDocComment(statement: ts.Statement): boolean {
  return (
    !ts.isImportDeclaration(statement) && !ts.isExportDeclaration(statement)
  );
}

function isDirective(statement: ts.Statement): boolean {
  return (
    ts.isExpressionStatement(statement) &&
    ts.isStringLiteral(statement.expression)
  );
}

function isFollowedByBlankLine(text: string, end: number): boolean {
  return /^[^\S\n]*\n[^\S\n]*\n/.test(text.slice(end));
}

function lineOf(source: ts.SourceFile, position: number): number {
  return source.getLineAndCharacterOfPosition(position).line + 1;
}

export function collectSourceFiles(target: string): string[] {
  const stats = fs.statSync(target);

  if (stats.isFile()) {
    return SOURCE_EXTENSIONS.some((ext) => target.endsWith(ext))
      ? [target]
      : [];
  }

  return fs
    .readdirSync(target, { withFileTypes: true })
    .flatMap((entry) => collectSourceFiles(path.join(target, entry.name)))
    .sort();
}

/**
 * .gitignore で除外されているファイルを落とす。
 *
 * git が引けない環境では素通しする。
 * 検査器が黙って全件を見送るより、生成物込みで騒ぐ方が気付ける。
 */
function excludeIgnored(files: string[]): string[] {
  if (files.length === 0) {
    return [];
  }

  const found = spawnSync("git", ["check-ignore", "--stdin"], {
    input: files.join("\n"),
    encoding: "utf8",
  });

  // 0 = 除外対象あり、1 = 無し。
  // それ以外は git 側の失敗。
  if (found.status !== 0 && found.status !== 1) {
    return files;
  }

  const ignored = new Set(found.stdout.split("\n").filter(Boolean));

  return files.filter((file) => !ignored.has(file));
}

function main(argv: string[]): number {
  const targets = argv.length > 0 ? argv : DEFAULT_TARGETS;
  const files = excludeIgnored(targets.flatMap(collectSourceFiles));
  let total = 0;

  for (const file of files) {
    const violations = lintSource(file, fs.readFileSync(file, "utf8"));

    for (const violation of violations) {
      console.error(
        `${file}:${violation.line} ${violation.rule}\n  ${violation.message}`,
      );
    }

    total += violations.length;
  }

  console.error(
    total === 0
      ? `Checked ${files.length} files. No comment violations.`
      : `Checked ${files.length} files. Found ${total} comment violations.`,
  );

  return total === 0 ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
