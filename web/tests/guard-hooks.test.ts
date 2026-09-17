import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const repositoryRoot = spawnSync("git", ["rev-parse", "--show-toplevel"], {
  cwd: import.meta.dirname,
  encoding: "utf8",
}).stdout.trim();

/**
 * フックのファイル名 `name` から、リポジトリの中の実体のパスを返す。
 *
 * 見つからなければ throw する。
 * 配布先では `.claude/hooks/` の直下、雛形そのものを持つリポジトリでは `tools/gh-review/hooks/` に置かれる。
 */
function findHook(name: string): string {
  const candidates = [
    path.join(repositoryRoot, ".claude/hooks", name),
    path.join(repositoryRoot, "tools/gh-review/hooks", name),
  ];
  const found = candidates.find((candidate) => existsSync(candidate));

  if (found === undefined) {
    throw new Error(`${name} が見つからない: ${candidates.join(", ")}`);
  }

  return found;
}

const hooks = {
  forcePush: findHook("guard-force-push.sh"),
  ghApi: findHook("guard-gh-api.sh"),
};

/**
 * `command` を `tool_input.command` に持つ JSON を `hook` の標準入力へ渡し、`permissionDecision` を返す。
 *
 * `hook` は環境変数 `PATH` を `searchPath` にして走らせる。
 * フックが何も出さずに終われば undefined を返し、終了コードが 0 でなければ throw する。
 */
function decisionOf(
  hook: string,
  command: string,
  searchPath = process.env.PATH,
): string | undefined {
  const result = spawnSync("/bin/bash", [hook], {
    input: JSON.stringify({ tool_input: { command } }),
    encoding: "utf8",
    env: { ...process.env, PATH: searchPath },
  });

  if (result.status !== 0) {
    throw new Error(
      `${hook} が終了コード ${result.status} で終わった: ${result.stderr}`,
    );
  }

  if (result.stdout === "") {
    return undefined;
  }

  return JSON.parse(result.stdout).hookSpecificOutput.permissionDecision;
}

describe("guard-force-push.sh", () => {
  it.each([
    ["remote 名の後の --force", "git push origin --force"],
    ["短オプションの束 -fu", "git push -fu origin main"],
    ["+src:dst の refspec", "git push origin +main:main"],
    [":branch の削除 refspec", "git push origin :old-branch"],
    ["コマンド置換の中の -f", "echo $(git push -f)"],
  ])("%s を含む push は ask になる", (_label, command) => {
    expect(decisionOf(hooks.forcePush, command)).toBe("ask");
  });

  it.each([
    ["フラグの無い push", "git push origin main"],
    ["-u だけの push", "git push -u origin main"],
    [
      "; の後の文字列に push を含む行",
      'git status; echo "--- 未 push の有無 ---"',
    ],
    ["push の前にある -f", "gh api graphql -f query=x; git push origin main"],
  ])("%s は何も出さない", (_label, command) => {
    expect(decisionOf(hooks.forcePush, command)).toBeUndefined();
  });
});

describe("guard-gh-api.sh", () => {
  it.each([
    ["-X PATCH", "gh api -X PATCH repos/o/r -f name=x"],
    ["--method DELETE", "gh api --method DELETE repos/o/r/git/refs/heads/x"],
    ["secret への到達", "gh api repos/o/r/actions/secrets"],
    [
      "フィールドの値に /comments を含む issue の作成",
      'gh api repos/o/r/issues -f title="see /comments"',
    ],
    [
      "resolve 以外の mutation",
      "gh api graphql -f query='mutation { deleteIssue(input: {issueId: \"x\"}) { clientMutationId } }'",
    ],
  ])("%s は ask になる", (_label, command) => {
    expect(decisionOf(hooks.ghApi, command)).toBe("ask");
  });

  it.each([
    ["読み取り", "gh api repos/o/r/pulls/1/comments"],
    ["コメントの投稿", "gh api repos/o/r/pulls/1/comments -f body=x"],
    [
      "返信の投稿",
      "gh api -X POST repos/o/r/pulls/1/comments/2/replies -f body=x",
    ],
    [
      "resolveReviewThread",
      "gh api graphql -f query='mutation { resolveReviewThread(input: {threadId: \"x\"}) { thread { id } } }'",
    ],
    ["gh api でないコマンド", "gh pr view 1"],
  ])("%s は何も出さない", (_label, command) => {
    expect(decisionOf(hooks.ghApi, command)).toBeUndefined();
  });
});

describe("jq が無い環境", () => {
  const emptyBin = mkdtempSync(path.join(tmpdir(), "guard-hooks-"));

  afterAll(() => {
    rmSync(emptyBin, { recursive: true, force: true });
  });

  // PATH を空のディレクトリにして、フックが jq を見つけられない環境で走らせる。
  it.each([
    ["guard-force-push.sh", hooks.forcePush, "git push origin main"],
    ["guard-gh-api.sh", hooks.ghApi, "gh api repos/o/r"],
  ])("%s は通る形のコマンドでも ask になる", (_name, hook, command) => {
    expect(decisionOf(hook, command, emptyBin)).toBe("ask");
  });
});
