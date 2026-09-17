/**
 * `lint-vocabulary.sh --text` の終了コードと出力のテストを置く。
 *
 * 禁止語はスクリプトが持つ一覧に依らず、`.vocabulary/deny` へ置いた架空の語で検査する。
 * スクリプトは `git rev-parse --show-toplevel` の直下から語のファイルを読むので、ケースごとに一時リポジトリを作り、そこを cwd にして走らせる。
 */

import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const repositoryRoot = spawnSync("git", ["rev-parse", "--show-toplevel"], {
  cwd: import.meta.dirname,
  encoding: "utf8",
}).stdout.trim();

/**
 * リポジトリの中の `lint-vocabulary.sh` のパスを返す。
 *
 * 見つからなければ throw する。
 * 配布先では `scripts/` の直下、雛形そのものを持つリポジトリでは `tools/coding-standards/scripts/` に置かれる。
 */
function findLintVocabulary(): string {
  const candidates = [
    path.join(repositoryRoot, "scripts/lint-vocabulary.sh"),
    path.join(
      repositoryRoot,
      "tools/coding-standards/scripts/lint-vocabulary.sh",
    ),
  ];
  const found = candidates.find((candidate) => existsSync(candidate));

  if (found === undefined) {
    throw new Error(
      `lint-vocabulary.sh が見つからない: ${candidates.join(", ")}`,
    );
  }

  return found;
}

const lintVocabulary = findLintVocabulary();

/** `.vocabulary/deny` へ置く架空の禁止語。 */
const DENIED_WORD = "禁止テスト語";

/** `DENIED_WORD` を含み、`.vocabulary/allow` へ置く語。 */
const ALLOWED_COMPOUND = `${DENIED_WORD}録`;

let workingRepository: string;

beforeEach(() => {
  workingRepository = mkdtempSync(path.join(tmpdir(), "lint-vocabulary-"));
  spawnSync("git", ["init", "-q"], { cwd: workingRepository });
  mkdirSync(path.join(workingRepository, ".vocabulary"));
  writeFileSync(
    path.join(workingRepository, ".vocabulary/deny"),
    `${DENIED_WORD}\n`,
  );
});

afterEach(() => {
  rmSync(workingRepository, { recursive: true, force: true });
});

/** `workingRepository` の直下に `name` のファイルを `content` で書き、親のディレクトリが無ければ作る。 */
function writeRepositoryFile(name: string, content: string): void {
  const file = path.join(workingRepository, name);

  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, content);
}

/** `workingRepository` を cwd にして `lint-vocabulary.sh` を `args` で走らせ、終了コードと出力を返す。 */
function runLintVocabulary(args: string[]) {
  const result = spawnSync("/bin/bash", [lintVocabulary, ...args], {
    cwd: workingRepository,
    encoding: "utf8",
  });

  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

describe("--text の禁止語", () => {
  it("禁止語を含む行があれば、終了コード 1 で行番号と本文を標準出力へ出す", () => {
    writeRepositoryFile("body.txt", `一行目\n二行目に${DENIED_WORD}がある\n`);

    const result = runLintVocabulary(["--text", "body.txt"]);

    expect(result.status).toBe(1);
    expect(result.stdout).toBe(`body.txt:2: 二行目に${DENIED_WORD}がある\n`);
  });

  it("禁止語を含む行があれば、対処の案内を標準エラー出力へ出す", () => {
    writeRepositoryFile("body.txt", `${DENIED_WORD}\n`);

    const result = runLintVocabulary(["--text", "body.txt"]);

    expect(result.stderr).not.toBe("");
  });

  it("禁止語を含まなければ、終了コード 0 で何も出さない", () => {
    writeRepositoryFile("body.txt", "一行目\n二行目\n");

    const result = runLintVocabulary(["--text", "body.txt"]);

    expect(result).toEqual({ status: 0, stdout: "", stderr: "" });
  });

  it("改行で終わらない最終行の禁止語も報告する", () => {
    writeRepositoryFile("body.txt", `一行目\n${DENIED_WORD}`);

    const result = runLintVocabulary(["--text", "body.txt"]);

    expect(result.status).toBe(1);
    expect(result.stdout).toBe(`body.txt:2: ${DENIED_WORD}\n`);
  });
});

describe(".vocabulary/allow", () => {
  it("許可語の中に埋もれた禁止語は報告しない", () => {
    writeRepositoryFile(".vocabulary/allow", `${ALLOWED_COMPOUND}\n`);
    writeRepositoryFile("body.txt", `${ALLOWED_COMPOUND}を読む\n`);

    const result = runLintVocabulary(["--text", "body.txt"]);

    expect(result).toEqual({ status: 0, stdout: "", stderr: "" });
  });

  it("許可語の外に現れた禁止語は報告する", () => {
    writeRepositoryFile(".vocabulary/allow", `${ALLOWED_COMPOUND}\n`);
    writeRepositoryFile("body.txt", `${ALLOWED_COMPOUND}と${DENIED_WORD}\n`);

    const result = runLintVocabulary(["--text", "body.txt"]);

    expect(result.status).toBe(1);
    expect(result.stdout).toBe(
      `body.txt:1: ${ALLOWED_COMPOUND}と${DENIED_WORD}\n`,
    );
  });
});

describe("語のファイルの読み込み", () => {
  it("改行で終わらない最終行の語も禁止語として読む", () => {
    writeRepositoryFile(".vocabulary/deny", `別の語\n${DENIED_WORD}`);
    writeRepositoryFile("body.txt", `${DENIED_WORD}\n`);

    const result = runLintVocabulary(["--text", "body.txt"]);

    expect(result.status).toBe(1);
    expect(result.stdout).toBe(`body.txt:1: ${DENIED_WORD}\n`);
  });

  it("改行で終わらない最終行の語も許可語として読む", () => {
    writeRepositoryFile(".vocabulary/allow", `別の語\n${ALLOWED_COMPOUND}`);
    writeRepositoryFile("body.txt", `${ALLOWED_COMPOUND}\n`);

    const result = runLintVocabulary(["--text", "body.txt"]);

    expect(result).toEqual({ status: 0, stdout: "", stderr: "" });
  });
});

describe(".vocabulary/banned.tsv", () => {
  /** `.vocabulary/banned.tsv` へ置く架空の禁止語。 */
  const BANNED_WORD = "表の禁止語";

  /** `BANNED_WORD` を含み、`.vocabulary/banned.tsv` の 3 列目へ置く語。 */
  const BANNED_COMPOUND = `${BANNED_WORD}録`;

  beforeEach(() => {
    writeRepositoryFile(
      ".vocabulary/banned.tsv",
      `# 説明\n${BANNED_WORD}\t言い換え\t別の複合語 ${BANNED_COMPOUND}\n`,
    );
  });

  it("1 列目の語を禁止語として報告する", () => {
    writeRepositoryFile("body.txt", `${BANNED_WORD}\n`);

    const result = runLintVocabulary(["--text", "body.txt"]);

    expect(result.status).toBe(1);
    expect(result.stdout).toBe(`body.txt:1: ${BANNED_WORD}\n`);
  });

  it("差分を見るとき、ルート直下の .vocabulary/banned.tsv の追加行は報告しない", () => {
    spawnSync("git", ["add", ".vocabulary/banned.tsv"], {
      cwd: workingRepository,
    });

    const result = runLintVocabulary([]);

    expect(result).toEqual({ status: 0, stdout: "", stderr: "" });
  });

  it("3 列目に並べた複合語の中に埋もれた禁止語は報告しない", () => {
    writeRepositoryFile("body.txt", `${BANNED_COMPOUND}を読む\n`);

    const result = runLintVocabulary(["--text", "body.txt"]);

    expect(result).toEqual({ status: 0, stdout: "", stderr: "" });
  });
});

describe("--text の引数", () => {
  it("ファイルが無ければ、終了コード 2 で何も報告しない", () => {
    const result = runLintVocabulary(["--text", "missing.txt"]);

    expect(result.status).toBe(2);
    expect(result.stdout).toBe("");
  });
});
