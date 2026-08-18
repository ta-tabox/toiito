/**
 * コメント規約のうち、Biome が構造的に検出できない分だけを見る検査器（L1）。
 *
 * Biome のリンタはコメントを走査対象に持たない——built-in ルールにも GritQL プラグインにも、コメント本体へ届く経路が無い。ここが引き受けるのはその穴だけで、コメント以外の作法は biome.json 側に置く。同じ規約を二箇所に書かない。
 *
 * 判定は TypeScript の API へ渡す。行単位の正規表現では文字列リテラル中の記号と本物のコメントを区別できず、規約の検査器自身が嘘をつく。
 *
 * 対象から外すものは .gitignore が正——Biome も vcs.useIgnoreFile で同じ正を見る。
 * 独自の除外リストを持つと、生成物（src/generated）の扱いが Biome と食い違う。
 *
 * 入口は lintSource。CLI は node scripts/lint-comments.mts [path...]。
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

// 既定の対象から tests を外している。テストの主題は対応する実装のファイル名が既に名指しており、冒頭コメントを要求すると規約が禁じている「ファイル名の言い換え」を量産することになる。
const DEFAULT_TARGETS = ["src", "scripts"];

const SOURCE_EXTENSIONS = [".ts", ".tsx", ".mts"];

// TS の型と重複する JSDoc の型注釈。@param {string} name の {string} を指す。
const JSDOC_TYPE_ANNOTATION = /@(param|returns?)\s*\{/g;

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
  ];
}

/**
 * 冒頭コメントを、それが飾る本体の直前まで遡って探す。
 *
 * "use server" のようなディレクティブは本体に数えない。ディレクティブの前後どちらに冒頭コメントを置いても構文上は正しく、位置まで縛る理由が無い。
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

  // 空行を挟まず宣言に接したコメントは、その宣言の JSDoc であってモジュールへの注釈ではない——TS もエディタもそう読む。ここを冒頭コメントとして数えると、「空行を置け」と促した結果、宣言から JSDoc を剥がすことになる。
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
 * import / export 宣言は説明を持たないので、直前のコメントは行き場が無く
 * モジュールへの注釈にしかなりえない。関数・型・定数はその逆。
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
 * git が引けない環境では素通しする。検査器が黙って全件を見送るより、
 * 生成物込みで騒ぐ方が気付ける。
 */
function excludeIgnored(files: string[]): string[] {
  if (files.length === 0) {
    return [];
  }

  const found = spawnSync("git", ["check-ignore", "--stdin"], {
    input: files.join("\n"),
    encoding: "utf8",
  });

  // 0 = 除外対象あり、1 = 無し。それ以外は git 側の失敗。
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
