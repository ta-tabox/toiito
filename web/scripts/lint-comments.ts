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
 * パーサは `typescript` を引く（器固有の逸脱。雛形は `@typescript/typescript6`）。
 * この器は typescript を 6 系で固定しており旧 JS コンパイラ API がそこにあるので、別名の devDependency を足さずに済む。
 * 7 系は Go 移植で既定 export から `createSourceFile` が外れるので、上げる日には雛形の綴りへ戻す。
 *
 * Biome も vcs.useIgnoreFile で同じ正を見るので、対象から外すものは .gitignore が正。
 * 独自の除外リストを持つと、生成物の扱いが Biome と食い違う。
 *
 * 入口は lintSource。
 * CLI は node scripts/lint-comments.ts [path...]。
 *
 * 正典は fermentary/tools/coding-standards/scripts/lint-comments.ts で、各器のこれはコピー。
 * 器固有の逸脱を足すときは、このコメントの直下に理由を書く（規約は playbooks/coding-standards.md「進化の規約」）。
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

/**
 * 違反 1 件。
 * 行番号と規則 ID に加えて、直し方まで含んだ説明を持つ。
 */
export type Violation = {
  line: number;
  rule: string;
  message: string;
};

/** 元のテキスト上でのコメントの範囲と、その中身。 */
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

/**
 * 器ごとに変える唯一の箇所。
 * ソースの置き場所は器の構成で変わるが、規則そのものは変わらない。
 *
 * tests を併置する器にはこのディレクトリが無いので、既定の対象に限り存在しないディレクトリを飛ばす。
 */
const DEFAULT_TARGETS = ["src", "scripts", "tests"];

/**
 * 検査の対象にする拡張子。
 * ここに無い拡張子は、ディレクトリを名指しで渡されても集めない。
 */
const SOURCE_EXTENSIONS = [".ts", ".tsx", ".mts"];

/**
 * テストファイルの綴り。
 * `foo.test.ts` や `foo.spec.tsx` のように、拡張子の手前へ test / spec を挟む形を指す。
 *
 * 判定をディレクトリでなくファイル名に置いている。
 * 免除の理由は「対応する実装のファイル名が主題を既に名指している」ことなので、その名が src/ に居ても tests/ に居ても情報量は変わらない。
 * ディレクトリで判定すると、テストを併置する器で同じ規約が別の意味になる。
 */
const TEST_FILE = /\.(?:test|spec)\.[cm]?[jt]sx?$/;

/**
 * TS の型と重複する JSDoc の型注釈。
 * `@param` や `@returns` の直後に波括弧で型を書いた形を指す。
 */
const JSDOC_TYPE_ANNOTATION = /@(param|returns?)\s*\{/g;

/**
 * 文がそこで閉じている印。
 * 日本語の句点と、英文・コード片の終止符。
 */
const SENTENCE_END = /[。.]$/;

/**
 * 散文でないことを行頭で宣言する印。
 * 箇条書きと表の行が持つ。
 *
 * 散文の続きではないので、手前の行から文が流れ込んでいない。
 * 機械が図を見抜いているのではなく、書き手が宣言している。
 */
const LIST_MARKER = /^(?:[-*・→|]|\d+[.)])/;

/**
 * コードフェンスの行頭。
 * 開いた行から次に現れた同じ行までは散文でないので、規則を当てない。
 */
const CODE_FENCE = /^`{3}/;

/**
 * 括弧の始まり。
 * 閉じるまで文は終わっていないので、内側の句点は文の切れ目に数えない。
 */
const BRACKET_OPEN = "（(「【";

/** 括弧の終わり。 */
const BRACKET_CLOSE = "）)」】";

/**
 * 句点の後ろに残っても二文目にしない飾りだけの並び。
 * 強調やコード片の閉じ記号と、開きを伴わない閉じ括弧を指す。
 *
 * 閉じ括弧は BRACKET_OPEN との対で数えているが、その対は 1 行の内側でしか閉じない。
 * 括弧が行を跨いだ後ろ半分は開きを持たないので、深さでは免除できない。
 */
const TRAILING_DECORATION = /^[*_`）)」】\s]*$/;

/**
 * 検査器の入口。
 * ソース 1 ファイル分を受け取り、規則ごとの検査を束ねて違反の一覧を返す。
 */
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

  // テストは冒頭コメントの「要求」だけを免れる。
  // テストの主題は対応する実装のファイル名が既に名指しており、要求すると規約が禁じている「ファイル名の言い換え」を量産することになる。
  // 免れるのは要求であって書式ではないので、書いた場合の /** */ と直後の空行は下でそのまま見る。
  // 残る三規則（JSDoc の型注釈・改行の位置・一文一行）もテストに当たる（CODING.md「テストコードも本体と同じ可読性規約に従う」）。
  const missing = TEST_FILE.test(source.fileName)
    ? []
    : [
        {
          line: lineOf(source, bodyStart),
          rule: "comments/useModuleHeader",
          message:
            "モジュール冒頭コメントが無い。責務と、引き受けない境界を書く（ファイル名の言い換えにしない）",
        },
      ];

  if (header === undefined) {
    return missing;
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
    return missing;
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

/**
 * JSDoc の中に TS の型と重複する型注釈が無いかを見る。
 *
 * 対象を JSDoc に絞っている。
 * 行コメントの中の同じ綴りは型注釈として読まれないので、重複が起きない。
 */
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
 * 括弧の内側の句点と、飾りしか後ろに続かない句点は数えない。
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

    if (
      char === "。" &&
      depth === 0 &&
      !TRAILING_DECORATION.test(text.slice(index + 1))
    ) {
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
      blocks.push(maskFencedRegions(run));
      run = [];
    }
  };

  for (const comment of comments) {
    const first = lineOf(source, comment.start);

    if (!comment.text.startsWith("//")) {
      flushRun();
      runEnd = 0;
      blocks.push(
        maskFencedRegions(
          comment.text.split("\n").map((line, offset) => ({
            line: first + offset,
            text: stripDecoration(line),
          })),
        ),
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

/**
 * コードフェンスに挟まれた区間を、フェンスの行ごと空行に見せる。
 *
 * 空行は塊の切れ目なので、区間の内側だけでなく前後の隣接判定も同時に落ちる。
 * コードは散文ではないから行末の記号に意味が無く、フェンスの行そのものも散文ではない。
 * 閉じないまま塊が終わる場合は、開いた行から末尾までを区間として扱う。
 */
function maskFencedRegions(lines: CommentLine[]): CommentLine[] {
  let inside = false;

  return lines.map((entry) => {
    if (CODE_FENCE.test(entry.text)) {
      inside = !inside;

      return { line: entry.line, text: "" };
    }

    return inside ? { line: entry.line, text: "" } : entry;
  });
}

/** コメントの綴り（`//`・`/*`・行頭の `*`・閉じ）を落として本文だけにする。 */
function stripDecoration(line: string): string {
  return line
    .replace(/^\s*(?:\/\*\*?|\/\/)/, "")
    .replace(/^\s*\*(?!\/)/, "")
    .replace(/\*\/\s*$/, "")
    .trim();
}

/**
 * ソース中の leading コメントを重複なく集め、出現順に並べて返す。
 *
 * 同じコメントが親と子の両方で leading として返るので、開始位置で重複を落とす。
 */
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

/**
 * ディレクティブを除いた最初の文を返す。
 * 冒頭コメントが飾っている本体はこれになる。
 */
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

/**
 * その文がディレクティブか。
 * 構文の上ではただの文字列式なので、式文かつ文字列リテラルであることで見分ける。
 */
function isDirective(statement: ts.Statement): boolean {
  return (
    ts.isExpressionStatement(statement) &&
    ts.isStringLiteral(statement.expression)
  );
}

/**
 * 指定した位置の直後に空行が続くか。
 * 行末までの空白を跨いで改行が 2 つ並ぶ形を空行と数える。
 */
function isFollowedByBlankLine(text: string, end: number): boolean {
  return /^[^\S\n]*\n[^\S\n]*\n/.test(text.slice(end));
}

/**
 * 文字位置を 1 始まりの行番号へ直す。
 * パーサが返す行番号は 0 始まりだが、エディタと `file:line` の綴りは 1 始まり。
 */
function lineOf(source: ts.SourceFile, position: number): number {
  return source.getLineAndCharacterOfPosition(position).line + 1;
}

/**
 * 対象の配下から検査するソースを再帰で集める。
 * ファイルを直に渡されたときは、拡張子が合う場合だけそれ 1 件を返す。
 */
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

/**
 * 既定の対象は器の構成に対する見込みなので、無いディレクトリは黙って飛ばす。
 * 引数で名指しされた場所が無いのは打ち間違いなので、そちらは collectSourceFiles に落とさせる。
 */
function resolveTargets(argv: string[]): string[] {
  return argv.length > 0
    ? argv
    : DEFAULT_TARGETS.filter((target) => fs.existsSync(target));
}

/**
 * CLI の本体。
 * 違反を 1 件ずつ標準エラーへ書き、総数を終了コードへ畳む。
 */
function main(argv: string[]): number {
  const targets = resolveTargets(argv);
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
