/**
 * コメント規約のうち、Biome が構造的に検出できない分だけを見るリンタ。
 *
 * Biome はコメント本体へ届く経路を持たないので、このリンタが引き受けるのはその穴だけである。
 * コメント以外の作法は biome.json へ置き、対象から外すものは .gitignore を正とする（Biome も vcs.useIgnoreFile で同じ正を見る）。
 * 判定は行単位の正規表現でなく TypeScript の API に任せる（正規表現では文字列リテラル中の記号と本物のコメントを区別できない）。
 * パーサの `@typescript/typescript6` を `typescript` へ戻さない（TypeScript 7 は既定 export から `createSourceFile` を外している）。
 *
 * エントリポイントは lintSource。
 * このファイルは複数のリポジトリで同じ内容を保つ共有物なので、このリポジトリ固有の逸脱を足すときはこのコメントの直下に理由を書く。
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "@typescript/typescript6";

/**
 * 違反 1 件。
 * 行番号と規則 ID に加えて、直し方まで含んだ説明を持つ。
 *
 * severity が warn の違反は出力するが終了コードには数えない。
 * 既存のコードに違反が残っている規則を、掃引の前に入れて再流入だけ止めるための欄。
 */
export type Violation = {
  line: number;
  rule: string;
  message: string;
  severity: "error" | "warn";
};

/** 元のテキスト上でのコメントの範囲と、その中身。 */
type CommentRange = {
  start: number;
  end: number;
  text: string;
};

/** コメントの記号を剥がした 1 行と、それが元のファイルで居た行番号。 */
type CommentLine = {
  line: number;
  text: string;
};

/**
 * 検査するソース 1 件。
 * `collectKnownNames` と `lintSource` が同じ形で受け取る。
 */
export type SourceText = {
  fileName: string;
  text: string;
};

/**
 * コメントがバッククォートで名指しうる、実在する名前の集合。
 *
 * `identifiers` は検査対象の全ファイルに現れる識別子と文字列リテラルの中身、`files` は検査対象のファイルのパス。
 * 一つのファイルだけでは自分が import した相手の名前しか分からないので、全ファイルから先に集める。
 */
export type KnownNames = {
  identifiers: ReadonlySet<string>;
  files: readonly string[];
};

/**
 * リポジトリごとに変える唯一の箇所。
 * ソースの置き場所はリポジトリの構成で変わるが、規則そのものは変わらない。
 *
 * tests を併置するリポジトリにはこのディレクトリが無いので、既定の対象に限り存在しないディレクトリを飛ばす。
 */
const DEFAULT_TARGETS = ["src", "scripts", "tests", "e2e"];

/**
 * 関数の JSDoc で、空行の下に置く理由の文の上限。
 * 3 文目は ADR へ移し、コメントにはリンク一行を残す。
 */
const MAX_REASON_SENTENCES = 2;

/**
 * 宣言の直前に置かれても説明ではない行コメント。
 * リンタとコンパイラへの指示で、JSDoc の代用として書かれたものではない。
 */
const DIRECTIVE_LINE_COMMENT =
  /^\/\/\s*(?:biome-ignore|eslint-|@ts-|prettier-ignore)/;

/**
 * 識別子として実在を確かめる字面。
 * camelCase・PascalCase（小文字と大文字の両方を含む）か、UPPER_SNAKE（下線を含む大文字の並び）に限る。
 * 小文字だけの語（`git`・`lint`）は道具や一般語と区別が付かないので見ない。
 */
const IDENTIFIER_TOKEN = /^[A-Za-z_$][\w$]*$/;

/**
 * 例として挙げた名前の書き出し。
 * `foo.test.ts` のような例示は実在しなくてよい。
 */
const EXAMPLE_NAME = /^(?:foo|bar|baz|sample|example)\b/;

/** 言い切った文の末尾へ補足を継ぎ足す記号。 */
const EM_DASH = "——";

/**
 * コメントに書かない語と、代わりに書く語。
 * 語はリポジトリごとに変わるが、規則そのものは変わらない。
 *
 * 比喩と個人語彙は書き手には一意でも、このリポジトリの md を読んでいない読者には辞書が無い。
 * 語の正は `.claude/rules/writing.md`「語彙と読み手」節の表で、`BANNED_WORDS` はその一覧を機械が読める形へ写したもの。
 * `.claude/rules/coding.md`「コメント」節は一覧を持たず、判定手順（英語への直訳）だけを持つ。
 *
 * `allow` は、その語を含むが禁止の対象ではない複合語。
 * 判定の前に本文から取り除くので、`入口` の `口` は報告しない。
 */
const BANNED_WORDS: ReadonlyArray<{
  word: string;
  instead: string;
  allow?: readonly string[];
}> = [
  { word: "引く", instead: "取得する / 検索する" },
  { word: "落とす", instead: "throw する / 削除する / 拒否する" },
  { word: "倒す", instead: "既定値にする / フォールバックする" },
  { word: "畳む", instead: "まとめる / 変換する / 閉じる" },
  { word: "流す", instead: "適用する / デプロイする / 実行する" },
  { word: "弾く", instead: "拒否する / 除外する" },
  { word: "握る", instead: "保持する / 無視する" },
  { word: "掛ける", instead: "設定する / 適用する" },
  { word: "口", instead: "エントリポイント", allow: ["入口", "出口", "窓口"] },
  { word: "関門", instead: "検証" },
  {
    word: "印",
    instead: "フラグ",
    allow: ["矢印", "目印", "印字", "印刷", "印象"],
  },
  { word: "登録簿", instead: "レジストリ" },
  { word: "受け皿", instead: "置き場 / 行き先 / 既定の行" },
  { word: "素通し", instead: "検証なしで通す" },
  { word: "領分", instead: "担当" },
  { word: "器", instead: "リポジトリ / アプリ" },
  { word: "綴り", instead: "名前" },
];

/**
 * 検査の対象にする拡張子。
 * `SOURCE_EXTENSIONS` に無い拡張子は、ディレクトリを名指しで渡されても集めない。
 */
const SOURCE_EXTENSIONS = [".ts", ".tsx", ".mts"];

/**
 * ファイル名として実在を確かめる字面。
 * 拡張子は `SOURCE_EXTENSIONS` から作り、検査の対象に集めない種類（`.css`・`.md`）は実在を確かめようがないので見ない。
 */
const FILE_TOKEN = new RegExp(
  `^[\\w./-]+(?:${SOURCE_EXTENSIONS.map((ext) => `\\${ext}`).join("|")})$`,
);

/**
 * テストファイルの命名。
 * `foo.test.ts` や `foo.spec.tsx` のように、拡張子の手前へ test / spec を挟む形を指す。
 *
 * 判定はディレクトリでなくファイル名に置く。
 * ディレクトリで判定すると、テストを併置するリポジトリで同じ規約が別の意味になる。
 */
const TEST_FILE = /\.(?:test|spec)\.[cm]?[jt]sx?$/;

/**
 * TS の型と重複する JSDoc の型注釈。
 * `@param` や `@returns` の直後に波括弧で型を書いた形を指す。
 */
const JSDOC_TYPE_ANNOTATION = /@(param|returns?)\s*\{/g;

/**
 * 文がその位置で閉じていることを示す記号。
 * 日本語の句点と、英文・コード片の終止符。
 */
const SENTENCE_END = /[。.]$/;

/**
 * 散文でないことを行頭で宣言する記号。
 * 箇条書きと表の行が持つ。
 *
 * 散文の続きではないので、手前の行から文が流れ込んでいない。
 */
const LIST_MARKER = /^(?:[-*・→|]|\d+[.)])/;

/**
 * コードフェンスの行頭。
 * 開いた行から次に現れた同じ行までは散文でないので、規則を当てない。
 */
const CODE_FENCE = /^`{3}/;

/**
 * 行内のコード片。
 * バッククォートで囲った範囲を指す。
 *
 * 識別子と型はコードであって散文ではないので、禁止語の判定から外す。
 */
const INLINE_CODE = /`[^`]*`/g;

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
 * リンタのエントリポイント。
 * ソース 1 ファイル分を受け取り、規則ごとの検査を束ねて違反の一覧を返す。
 *
 * `known` を省くと、名指した識別子の実在はそのファイル 1 件の中だけで確かめる。
 * CLI は全ファイルから `collectKnownNames` で集めた集合を渡す。
 */
export function lintSource(
  fileName: string,
  text: string,
  known: KnownNames = collectKnownNames([{ fileName, text }]),
): Violation[] {
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
    ...checkBannedWords(source, comments),
    ...checkJsDocOnFunctions(source, text),
    ...checkLineCommentBeforeDeclaration(source, text, comments),
    ...checkReasonSentences(source, text),
    ...checkExistingIdentifiers(source, comments, known),
    ...checkDanglingEmDash(source, comments),
  ];
}

/**
 * 検査対象の全ファイルから、コメントが名指しうる名前を集める。
 *
 * ライブラリの関数はこのリポジトリで宣言されないので、識別子は参照も含めて集める。
 * 環境変数の名前は `env["NAME"]` の形でしか現れないことがあるので、文字列リテラルの中身も含める。
 */
export function collectKnownNames(sources: readonly SourceText[]): KnownNames {
  const identifiers = new Set<string>();

  for (const { fileName, text } of sources) {
    const source = ts.createSourceFile(
      fileName,
      text,
      ts.ScriptTarget.Latest,
      true,
    );

    const visit = (node: ts.Node): void => {
      if (ts.isIdentifier(node) || ts.isPrivateIdentifier(node)) {
        identifiers.add(node.text);
      }

      if (
        ts.isStringLiteral(node) ||
        ts.isNoSubstitutionTemplateLiteral(node)
      ) {
        identifiers.add(node.text);

        // `comments/useModuleHeader` のような規則 ID は、コメントでは末尾の名前だけで呼ばれる。
        const lastSegment = node.text.split("/").pop();

        if (lastSegment !== undefined) {
          identifiers.add(lastSegment);
        }
      }

      node.forEachChild(visit);
    };
    visit(source);
  }

  return { identifiers, files: sources.map(({ fileName }) => fileName) };
}

/**
 * 冒頭コメントを、飾っている本体の直前まで遡って探す。
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
  // 残る三規則（JSDoc の型注釈・改行の位置・一文一行）もテストに当たる（.claude/rules/coding.md「テストコードも本体と同じ可読性規約に従う」）。
  const missing: Violation[] = TEST_FILE.test(source.fileName)
    ? []
    : [
        {
          line: lineOf(source, bodyStart),
          rule: "comments/useModuleHeader",
          message:
            "モジュール冒頭コメントが無い。責務と、引き受けない境界を書く（ファイル名の言い換えにしない）",
          severity: "error",
        },
      ];

  if (header === undefined) {
    return missing;
  }

  // 空行を挟まず宣言に接したコメントは、その宣言の JSDoc であってモジュールへの注釈ではない。
  // TS もエディタもそう読む。
  // 宣言に接したコメントを冒頭コメントとして数えると、「空行を置け」と促した結果、宣言から JSDoc を剥がすことになる。
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
        severity: "error",
      },
    ];
  }

  // 直後の空行が、モジュールへの注釈と直下の宣言への JSDoc を分ける唯一の目印。
  // 空行を挟まないと TS もエディタも、冒頭コメントを次の宣言のドキュメントとして扱う。
  if (!isFollowedByBlankLine(text, header.end)) {
    return [
      {
        line: lineOf(source, header.end),
        rule: "comments/useBlankLineAfterModuleHeader",
        message:
          "モジュール冒頭コメントの後に空行を置く。空行が無いと直下の宣言への JSDoc として読まれる",
        severity: "error",
      },
    ];
  }

  return [];
}

/**
 * JSDoc の中に TS の型と重複する型注釈が無いかを見る。
 *
 * 対象を JSDoc に絞っている。
 * 行コメントの中の同じ書き方は型注釈として読まれないので、重複が起きない。
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
        severity: "error",
      });
    }
  }

  return violations;
}

/**
 * 改行が文の途中に入っていないかを見る。
 *
 * 句点で閉じていない行の次に本文が続いていたら、その改行は文の切れ目ではなく桁で折った跡。
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
        severity: "error",
      });
    }
  }

  return violations;
}

/**
 * 1 行に 2 文以上置いていないかを見る。
 *
 * 一文一行なら、一文直したときの diff が 1 行で済み、レビューで「この文」を指せる。
 * 一文一行が桁で折らない理由そのものなので、文の途中で折らないだけでは足りない。
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
        severity: "error",
      });
    }
  }

  return violations;
}

/**
 * `allow` に列挙した複合語を `text` から取り除く。
 *
 * 語ごと除くとその語の真陽性まで検出しなくなるので、語でなく複合語の側で絞る。
 */
function stripAllowed(text: string, allow: readonly string[]): string {
  return allow.reduce((acc, word) => acc.split(word).join(""), text);
}

/**
 * 規約が禁じた語をコメントが使っていないかを見る。
 *
 * 判定は語の部分一致で、活用は見ない。
 * 語を含むが対象ではない複合語は `allow` へ列挙し、`stripAllowed` が判定の前に取り除く。
 */
function checkBannedWords(
  source: ts.SourceFile,
  comments: CommentRange[],
): Violation[] {
  const violations: Violation[] = [];

  for (const block of toCommentBlocks(source, comments)) {
    for (const line of block) {
      const prose = line.text.replace(INLINE_CODE, "");

      for (const banned of BANNED_WORDS) {
        const scanned = banned.allow
          ? stripAllowed(prose, banned.allow)
          : prose;

        if (!scanned.includes(banned.word)) {
          continue;
        }

        violations.push({
          line: line.line,
          rule: "comments/noBannedWord",
          message: `「${banned.word}」は使わない。代わりに ${banned.instead}`,
          severity: "error",
        });
      }
    }
  }

  return violations;
}

/**
 * JSDoc を要求する宣言を集める。
 * 対象はトップレベルの関数宣言、関数を初期化子に持つトップレベルの変数宣言、クラスのメソッドとアクセサである。
 *
 * 局所の補助関数まで要求するとコンポーネントのイベントハンドラごとに JSDoc が付くので、関数の中で作る関数は対象にしない。
 */
function documentedDeclarations(source: ts.SourceFile): ts.Node[] {
  return source.statements.flatMap((statement): ts.Node[] => {
    if (ts.isFunctionDeclaration(statement) || isFunctionVariable(statement)) {
      return [statement];
    }

    if (ts.isClassDeclaration(statement)) {
      return statement.members.filter(
        (member) =>
          ts.isMethodDeclaration(member) || ts.isGetAccessorDeclaration(member),
      );
    }

    return [];
  });
}

/** 関数を初期化子に持つ変数宣言か。 */
function isFunctionVariable(statement: ts.Statement): boolean {
  return (
    ts.isVariableStatement(statement) &&
    statement.declarationList.declarations.some(
      (declaration) =>
        declaration.initializer !== undefined &&
        isFunctionLike(declaration.initializer),
    )
  );
}

/**
 * 初期化子が関数か。
 *
 * 関数そのものに加えて、関数を第一引数に受ける呼び出し（`cache(async () => …)`・`memo(() => …)`）も関数と見なす。
 * 包んだ関数の説明は、包んでいる呼び出しの宣言にしか付けられない。
 */
function isFunctionLike(expression: ts.Expression): boolean {
  if (ts.isArrowFunction(expression) || ts.isFunctionExpression(expression)) {
    return true;
  }

  if (!ts.isCallExpression(expression)) {
    return false;
  }

  const [first] = expression.arguments;

  return (
    first !== undefined &&
    (ts.isArrowFunction(first) || ts.isFunctionExpression(first))
  );
}

/**
 * ノードの直前に付いたコメントのうち、いちばん近い 1 件を返す。
 * 無ければ undefined。
 *
 * リンタとコンパイラへの指示（`DIRECTIVE_LINE_COMMENT`）は説明ではないので、JSDoc と宣言の間に挟まっていても飛ばす。
 */
function closestLeadingComment(
  text: string,
  node: ts.Node,
): ts.CommentRange | undefined {
  const ranges = ts.getLeadingCommentRanges(text, node.getFullStart()) ?? [];

  return ranges
    .filter(
      (range) => !DIRECTIVE_LINE_COMMENT.test(text.slice(range.pos, range.end)),
    )
    .at(-1);
}

/**
 * 宣言に付いた JSDoc を返す。
 * 無ければ undefined。
 *
 * 直前のコメントが `/**` で始まっていても、空行を挟んでいれば宣言の説明ではなくモジュールへの注釈である。
 */
function jsDocOf(text: string, node: ts.Node): ts.CommentRange | undefined {
  const closest = closestLeadingComment(text, node);

  if (
    closest === undefined ||
    !text.startsWith("/**", closest.pos) ||
    isFollowedByBlankLine(text, closest.end)
  ) {
    return undefined;
  }

  return closest;
}

/**
 * 関数に JSDoc が付いているかを見る。
 *
 * `//` で書いた説明は `noLineCommentBeforeDeclaration` が別に報告する。
 */
function checkJsDocOnFunctions(
  source: ts.SourceFile,
  text: string,
): Violation[] {
  const violations: Violation[] = [];

  for (const node of documentedDeclarations(source)) {
    if (jsDocOf(text, node) !== undefined) {
      continue;
    }

    violations.push({
      line: lineOf(source, node.getStart(source)),
      rule: "comments/useJsDocOnFunction",
      message:
        "関数に JSDoc が無い。1 行目に what を完全な文で書く（export の有無・行数を問わない）",
      severity: "error",
    });
  }

  return violations;
}

/**
 * 宣言の直前に `//` の説明を置いていないかを見る。
 *
 * 対象はトップレベルの関数・変数・クラス・型・enum の宣言と、クラスのメンバである。
 * 空行を挟んだ `//` は宣言に付いた説明ではなく、ファイルの最初のコメントは `useJsDocModuleHeader` が見る冒頭コメントの候補なので、どちらも見ない。
 */
function checkLineCommentBeforeDeclaration(
  source: ts.SourceFile,
  text: string,
  comments: CommentRange[],
): Violation[] {
  const violations: Violation[] = [];
  const headerCandidate = comments[0];

  const nodes: ts.Node[] = [];

  for (const statement of source.statements) {
    if (!isDeclarationStatement(statement)) {
      continue;
    }

    nodes.push(statement);

    if (ts.isClassDeclaration(statement)) {
      nodes.push(...statement.members);
    }
  }

  for (const node of nodes) {
    const closest = closestLeadingComment(text, node);

    if (closest === undefined || !text.startsWith("//", closest.pos)) {
      continue;
    }

    if (
      headerCandidate !== undefined &&
      closest.pos === headerCandidate.start
    ) {
      continue;
    }

    if (isFollowedByBlankLine(text, closest.end)) {
      continue;
    }

    violations.push({
      line: lineOf(source, closest.pos),
      rule: "comments/noLineCommentBeforeDeclaration",
      message:
        "宣言に付く説明は JSDoc（/** */）で書く。// は関数本体の中だけに使う",
      severity: "error",
    });
  }

  return violations;
}

/**
 * その文が説明を持つ宣言か。
 * 関数・変数・クラス・型・interface・enum を指す。
 */
function isDeclarationStatement(statement: ts.Statement): boolean {
  return (
    ts.isFunctionDeclaration(statement) ||
    ts.isVariableStatement(statement) ||
    ts.isClassDeclaration(statement) ||
    ts.isTypeAliasDeclaration(statement) ||
    ts.isInterfaceDeclaration(statement) ||
    ts.isEnumDeclaration(statement)
  );
}

/**
 * 関数の JSDoc で、空行の下に置いた理由の文が `MAX_REASON_SENTENCES` を超えていないかを見る。
 *
 * 数えるのは最初の空行より下の散文の行で、箇条の行とコードフェンスの内側は数えない。
 * 1 行 1 文が別の規則で効いているので、行の数が文の数になる。
 */
function checkReasonSentences(
  source: ts.SourceFile,
  text: string,
): Violation[] {
  const violations: Violation[] = [];

  for (const node of documentedDeclarations(source)) {
    const closest = jsDocOf(text, node);

    if (closest === undefined) {
      continue;
    }

    const first = lineOf(source, closest.pos);
    const lines = maskFencedRegions(
      text
        .slice(closest.pos, closest.end)
        .split("\n")
        .map((line, offset) => ({
          line: first + offset,
          text: stripDecoration(line),
        })),
    );

    // 開きの `/**` と閉じの `*/` だけの行は本文ではないので、空行の探索から外す。
    const body = lines.slice(
      lines.findIndex((entry) => entry.text !== ""),
      lines.findLastIndex((entry) => entry.text !== "") + 1,
    );
    const blankIndex = body.findIndex((entry) => entry.text === "");

    if (blankIndex === -1) {
      continue;
    }

    const reasons = body
      .slice(blankIndex + 1)
      .filter((entry) => entry.text !== "" && !LIST_MARKER.test(entry.text));

    if (reasons.length <= MAX_REASON_SENTENCES) {
      continue;
    }

    violations.push({
      line: reasons[MAX_REASON_SENTENCES].line,
      rule: "comments/maxReasonSentences",
      message: `理由が ${reasons.length} 文ある。理由は 1 関数 ${MAX_REASON_SENTENCES} 文までにし、3 文目からは ADR へ移してリンク一行を残す`,
      severity: "error",
    });
  }

  return violations;
}

/**
 * バッククォートで名指した識別子とファイルが実在するかを見る。
 *
 * 改名した相手をコメントが古い名前のまま指している形を捕まえる。
 * 見るのは識別子の字面（`IDENTIFIER_TOKEN`）とファイル名の字面（`FILE_TOKEN`）だけで、小文字だけの語やパスでない名前は見ない。
 */
function checkExistingIdentifiers(
  source: ts.SourceFile,
  comments: CommentRange[],
  known: KnownNames,
): Violation[] {
  const violations: Violation[] = [];

  for (const block of toCommentBlocks(source, comments)) {
    for (const line of block) {
      for (const match of line.text.matchAll(/`([^`]+)`/g)) {
        const token = match[1];

        if (isKnownName(token, known)) {
          continue;
        }

        violations.push({
          line: line.line,
          rule: "comments/useExistingIdentifier",
          message: `\`${token}\` はコード中に存在しない識別子かファイルである。改名した相手を名指し直す`,
          severity: "warn",
        });
      }
    }
  }

  return violations;
}

/**
 * 名指した字面が実在するか。
 * 実在を確かめる形でない字面（小文字だけの語・式・パスでない文字列）は実在するものとして通す。
 */
function isKnownName(token: string, known: KnownNames): boolean {
  if (IDENTIFIER_TOKEN.test(token)) {
    const isMixedCase = /[a-z]/.test(token) && /[A-Z]/.test(token);
    const isUpperSnake = /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+$/.test(token);

    if (!isMixedCase && !isUpperSnake) {
      return true;
    }

    return known.identifiers.has(token);
  }

  if (FILE_TOKEN.test(token) && !EXAMPLE_NAME.test(token)) {
    return known.files.some((file) => isSamePath(file, token));
  }

  return true;
}

/**
 * 二つのパスが同じファイルを指すか。
 * どちらかがもう一方の末尾（ディレクトリの境界から）に一致すれば同じと見なす。
 */
function isSamePath(file: string, token: string): boolean {
  const normalized = file.split(path.sep).join("/");

  return (
    normalized === token ||
    normalized.endsWith(`/${token}`) ||
    token.endsWith(`/${normalized}`)
  );
}

/**
 * 言い切った文の末尾へ `——` で補足を継ぎ足していないかを見る。
 *
 * 括弧の内側と、対で挟む挿入（1 行に 2 つ）は文が閉じていないので数えない。
 * 括弧の外に 1 行 1 つだけ現れた `——` を、後置きの継ぎ足しと見なす。
 */
function checkDanglingEmDash(
  source: ts.SourceFile,
  comments: CommentRange[],
): Violation[] {
  const violations: Violation[] = [];

  for (const block of toCommentBlocks(source, comments)) {
    for (const line of block) {
      if (
        countEmDashesOutsideBrackets(line.text.replace(INLINE_CODE, "")) !== 1
      ) {
        continue;
      }

      violations.push({
        line: line.line,
        rule: "comments/noDanglingEmDash",
        message:
          "言い切った文の末尾へ —— で補足を継ぎ足している。補足は次の行の独立した文にする（括弧の内側と、対で挟む挿入は除く）",
        severity: "error",
      });
    }
  }

  return violations;
}

/** 括弧の外にある `——` の数を返す。 */
function countEmDashesOutsideBrackets(text: string): number {
  let depth = 0;
  let count = 0;

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

    if (depth === 0 && text.startsWith(EM_DASH, index)) {
      count++;
      index += EM_DASH.length - 1;
    }
  }

  return count;
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
 * 行末コメントを拾うと値ごとに注釈を添えた配列がまるごと違反になるので、直前に改行が無いコメントを leading と見なさない getLeadingCommentRanges の挙動をそのまま使う。
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
 * コードもフェンスの行も散文ではないので、空行に見せて塊の切れ目にし、区間の内側と前後の隣接判定を同時に外す。
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

/** コメントの記号（`//`・`/*`・行頭の `*`・閉じ）を取り除いて本文だけにする。 */
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
 * 同じコメントが親と子の両方で leading として返るので、開始位置で重複を取り除く。
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
 * 冒頭コメントが飾っている本体はこの文になる。
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
 * パーサが返す行番号は 0 始まりだが、エディタと `file:line` の表記は 1 始まり。
 */
function lineOf(source: ts.SourceFile, position: number): number {
  return source.getLineAndCharacterOfPosition(position).line + 1;
}

/**
 * 対象の配下から検査するソースを再帰で集める。
 * ファイルを直に渡されたときは、拡張子が合う場合だけそのファイル 1 件を返す。
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
 * .gitignore で除外されているファイルを取り除く。
 *
 * git を実行できない環境では、除外せず全件を検査する。
 * リンタが黙って全件を見送るより、生成物込みで違反を出す方が気付ける。
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
  // 0 と 1 以外は git 側の失敗。
  if (found.status !== 0 && found.status !== 1) {
    return files;
  }

  const ignored = new Set(found.stdout.split("\n").filter(Boolean));

  return files.filter((file) => !ignored.has(file));
}

/**
 * 既定の対象はリポジトリの構成に対する見込みなので、無いディレクトリは黙って飛ばす。
 * 引数で名指しされた場所が無いのは打ち間違いなので、collectSourceFiles に throw させる。
 *
 * 設定ファイルも規約の対象で、コメントが名指す設定のキーはそこにしか現れないので、既定ではカレントディレクトリ直下の設定ファイル（`*.config.ts` など）も対象に含める。
 */
function resolveTargets(argv: string[]): string[] {
  if (argv.length > 0) {
    return argv;
  }

  const rootFiles = fs
    .readdirSync(".", { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isFile() &&
        SOURCE_EXTENSIONS.some((ext) => entry.name.endsWith(ext)),
    )
    .map((entry) => entry.name);

  return [
    ...DEFAULT_TARGETS.filter((target) => fs.existsSync(target)),
    ...rootFiles,
  ];
}

/**
 * CLI の本体。
 * 違反を 1 件ずつ標準エラーへ書き、error の件数を終了コードにする。
 *
 * warn は同じ形で出すが終了コードには数えない。
 */
function main(argv: string[]): number {
  const targets = resolveTargets(argv);
  const files = excludeIgnored(targets.flatMap(collectSourceFiles));
  const sources = files.map((file) => ({
    fileName: file,
    text: fs.readFileSync(file, "utf8"),
  }));
  const known = collectKnownNames(sources);
  let errors = 0;
  let warnings = 0;

  for (const { fileName, text } of sources) {
    for (const violation of lintSource(fileName, text, known)) {
      console.error(
        `${fileName}:${violation.line} ${violation.rule}\n  ${violation.message}`,
      );

      if (violation.severity === "warn") {
        warnings++;
      } else {
        errors++;
      }
    }
  }

  console.error(
    `Checked ${files.length} files. ${errors} violations, ${warnings} warnings.`,
  );

  return errors === 0 ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
