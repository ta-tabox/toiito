/**
 * `scripts/diff-coding-standards.sh` の終了コードと出力のテストを置く。
 *
 * スクリプトは `git rev-parse --show-toplevel` の `.claude/` を配布物として読むので、ケースごとに一時リポジトリと一時のテンプレートを作り、一時リポジトリを cwd にして走らせる。
 */

import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const repositoryRoot = spawnSync("git", ["rev-parse", "--show-toplevel"], {
  cwd: import.meta.dirname,
  encoding: "utf8",
}).stdout.trim();

const diffCodingStandards = path.join(
  repositoryRoot,
  "scripts/diff-coding-standards.sh",
);

/** スクリプトが比べる、テンプレートの中の相対パス。 */
const DISTRIBUTED_FILES = [
  "rules/writing.md",
  "rules/coding.md",
  "rules/languages/typescript.md",
  "rules/languages/prisma.md",
  "skills/coding-standards/SKILL.md",
];

let workingDirectory: string;
let workingRepository: string;
let template: string;

beforeEach(() => {
  workingDirectory = mkdtempSync(path.join(tmpdir(), "diff-coding-standards-"));
  workingRepository = path.join(workingDirectory, "repository");
  template = path.join(workingDirectory, "template");
  mkdirSync(workingRepository);
  spawnSync("git", ["init", "-q"], { cwd: workingRepository });

  for (const relative of DISTRIBUTED_FILES) {
    writeFile(path.join(template, relative), `${relative}\n`);
    writeFile(
      path.join(workingRepository, ".claude", relative),
      `${relative}\n`,
    );
  }
});

afterEach(() => {
  rmSync(workingDirectory, { recursive: true, force: true });
});

/** `filePath` の親ディレクトリを作り、`content` を書く。 */
function writeFile(filePath: string, content: string): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, content);
}

/** `workingRepository` を cwd にして、`env` を足した環境でスクリプトを `args` で走らせ、終了コードと出力を返す。 */
function runDiffCodingStandards(
  args: string[],
  env: Record<string, string> = {},
) {
  const result = spawnSync("/bin/bash", [diffCodingStandards, ...args], {
    cwd: workingRepository,
    encoding: "utf8",
    env: { ...process.env, CODING_STANDARDS_TEMPLATE: "", ...env },
  });

  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

describe("テンプレートの渡し方", () => {
  it("引数で渡したテンプレートと全件一致すれば、終了コード 0 で何も出さない", () => {
    const result = runDiffCodingStandards([template]);

    expect(result).toEqual({ status: 0, stdout: "", stderr: "" });
  });

  it("CODING_STANDARDS_TEMPLATE で渡したテンプレートも比べる", () => {
    const result = runDiffCodingStandards([], {
      CODING_STANDARDS_TEMPLATE: template,
    });

    expect(result).toEqual({ status: 0, stdout: "", stderr: "" });
  });

  it("テンプレートを渡さなければ、終了コード 2 で渡し方を標準エラー出力へ出す", () => {
    const result = runDiffCodingStandards([]);

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("CODING_STANDARDS_TEMPLATE");
  });

  it("rules/ を持たないディレクトリを渡せば、終了コード 2 を返す", () => {
    const result = runDiffCodingStandards([workingRepository]);

    expect(result.status).toBe(2);
  });
});

describe("配布物の差", () => {
  it("配布物がテンプレートと違えば、終了コード 1 で unified diff を標準出力へ出す", () => {
    writeFile(
      path.join(workingRepository, ".claude/rules/coding.md"),
      "書き換えた行\n",
    );

    const result = runDiffCodingStandards([template]);

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("-rules/coding.md");
    expect(result.stdout).toContain("+書き換えた行");
  });

  it("配布物がリポジトリに無ければ、終了コード 1 を返す", () => {
    rmSync(path.join(workingRepository, ".claude/rules/languages/prisma.md"));

    const result = runDiffCodingStandards([template]);

    expect(result.status).toBe(1);
  });

  it("配布物の隣の *.project.md は比べない", () => {
    writeFile(
      path.join(workingRepository, ".claude/rules/coding.project.md"),
      "リポジトリだけの規則\n",
    );

    const result = runDiffCodingStandards([template]);

    expect(result).toEqual({ status: 0, stdout: "", stderr: "" });
  });
});
