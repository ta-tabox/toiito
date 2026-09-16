import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readCheckoutEnvironment } from "@scripts/checkout-environment.ts";
import { afterEach, describe, expect, it } from "vitest";

/** 後始末の対象。 */
const temporaryRoots: string[] = [];

/** worktree の派生名で使う既定の接続先。 */
const WORKTREE_URL =
  "postgresql://toiito:toiito@localhost:5433/toiito_wt_issue_300_setup";

/**
 * `.git` を持つチェックアウトを一つ作る。
 *
 * worktree の判定は `.git` がファイルかディレクトリかだけを見るので、中身は問わない。
 */
function makeCheckout(name: string, gitEntry: "file" | "directory"): string {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "toiito-checkout-"));
  const root = path.join(parent, name);
  fs.mkdirSync(root);
  temporaryRoots.push(parent);

  const git = path.join(root, ".git");

  if (gitEntry === "file") {
    fs.writeFileSync(git, "gitdir: /somewhere/.git/worktrees/x\n");
  } else {
    fs.mkdirSync(git);
  }

  return root;
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("readCheckoutEnvironment の接続先", () => {
  it("環境変数にある接続先はそのまま残す", () => {
    const root = makeCheckout("issue-300-setup", "file");
    const env = {
      DATABASE_URL: "postgresql://ci:ci@db:5432/app",
      DIRECT_URL: "postgresql://ci:ci@db:5432/app_direct",
    };

    expect(readCheckoutEnvironment(env, root)).toMatchObject(env);
  });

  it("環境変数に無い接続先は、worktree から導いた開発用 DB で埋める", () => {
    const root = makeCheckout("issue-300-setup", "file");

    expect(readCheckoutEnvironment({}, root)).toMatchObject({
      DATABASE_URL: WORKTREE_URL,
      DIRECT_URL: WORKTREE_URL,
    });
  });

  it("片方だけ無いときは、無い側だけ埋める", () => {
    const root = makeCheckout("issue-300-setup", "file");
    const env = { DIRECT_URL: "postgresql://ci:ci@db:5432/app_direct" };

    expect(readCheckoutEnvironment(env, root)).toMatchObject({
      DATABASE_URL: WORKTREE_URL,
      DIRECT_URL: env.DIRECT_URL,
    });
  });

  it("リポジトリ本体では compose.yaml の toiito を指す", () => {
    const root = makeCheckout("toiito", "directory");

    expect(readCheckoutEnvironment({}, root).DATABASE_URL).toBe(
      "postgresql://toiito:toiito@localhost:5433/toiito",
    );
  });
});

describe("readCheckoutEnvironment のサインインと AI の既定", () => {
  it("worktree では Google を経ないサインインを開け、許可リストはシードの二人にする", () => {
    const root = makeCheckout("issue-300-setup", "file");

    expect(readCheckoutEnvironment({}, root)).toMatchObject({
      TOIITO_FAKE_LOGIN: "1",
      TOIITO_ALLOWED_EMAILS: "first@example.com,second@example.com",
      TOIITO_FAKE_AI: "1",
    });
  });

  it("worktree の秘密は同じチェックアウトなら同じ値になる", () => {
    const root = makeCheckout("issue-300-setup", "file");

    const first = readCheckoutEnvironment({}, root).BETTER_AUTH_SECRET;
    const second = readCheckoutEnvironment({}, root).BETTER_AUTH_SECRET;

    expect(first).toBeTruthy();
    expect(first).toBe(second);
  });

  it("Google のクライアントがあれば、Google を経ないサインインは開けない", () => {
    const root = makeCheckout("issue-300-setup", "file");
    const env = { GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "secret" };

    const environment = readCheckoutEnvironment(env, root);

    expect(environment.TOIITO_FAKE_LOGIN).toBeUndefined();
    expect(environment.TOIITO_ALLOWED_EMAILS).toBeUndefined();
  });

  it("API キーがあれば、AI をフェイクにしない", () => {
    const root = makeCheckout("issue-300-setup", "file");

    expect(
      readCheckoutEnvironment({ ANTHROPIC_API_KEY: "sk-x" }, root)
        .TOIITO_FAKE_AI,
    ).toBeUndefined();
  });

  it("環境変数にある秘密と許可リストは書き換えない", () => {
    const root = makeCheckout("issue-300-setup", "file");
    const env = {
      BETTER_AUTH_SECRET: "given",
      TOIITO_ALLOWED_EMAILS: "me@example.com",
    };

    const environment = readCheckoutEnvironment(env, root);

    expect(environment.BETTER_AUTH_SECRET).toBeUndefined();
    expect(environment.TOIITO_ALLOWED_EMAILS).toBeUndefined();
  });

  it("リポジトリ本体では接続先しか導かない", () => {
    const root = makeCheckout("toiito", "directory");

    expect(Object.keys(readCheckoutEnvironment({}, root)).sort()).toEqual([
      "DATABASE_URL",
      "DIRECT_URL",
    ]);
  });
});
