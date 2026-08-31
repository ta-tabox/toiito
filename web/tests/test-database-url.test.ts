import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  testDatabaseName,
  toDatabaseSlug,
} from "@tests/setup/test-database-url";
import { afterEach, describe, expect, it } from "vitest";

/**
 * 後始末の対象。
 * 作った順に消せるよう、テストごとに積む。
 */
const temporaryRoots: string[] = [];

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

describe("toDatabaseSlug", () => {
  it("英数字以外を _ へ潰す", () => {
    expect(toDatabaseSlug("issue-145-test-db-isolation")).toBe(
      "issue_145_test_db_isolation",
    );
  });

  it("大文字を小文字へ寄せる", () => {
    expect(toDatabaseSlug("Next-Memo")).toBe("next_memo");
  });

  it("連続した記号を一つの _ にまとめ、両端は落とす", () => {
    expect(toDatabaseSlug("--a..b--")).toBe("a_b");
  });

  it("上限を超えたら先頭側を落として末尾を残す", () => {
    const slug = toDatabaseSlug(`${"x".repeat(60)}-83910e`);

    expect(slug.length).toBe(48);
    expect(slug.endsWith("_83910e")).toBe(true);
  });

  it("切り落とした跡の _ を先頭に残さない", () => {
    expect(toDatabaseSlug(`${"x".repeat(44)}-83910e`).startsWith("_")).toBe(
      false,
    );
  });

  it("英数字を一つも持たない名前でも空を返さない", () => {
    expect(toDatabaseSlug("問い設計")).toMatch(/^[a-z0-9]+$/);
  });

  it("英数字を一つも持たない名前どうしを、同じスラグへ潰さない", () => {
    expect(toDatabaseSlug("問い設計")).not.toBe(toDatabaseSlug("設計の検討"));
  });
});

describe("testDatabaseName", () => {
  it("worktree はディレクトリ名から派生する", () => {
    const root = makeCheckout("next-memo-implementation-83910e", "file");

    expect(testDatabaseName(root)).toBe(
      "toiito_wt_next_memo_implementation_83910e_test",
    );
  });

  it("リポジトリ本体は既定の一本を使う", () => {
    const root = makeCheckout("toiito", "directory");

    expect(testDatabaseName(root)).toBe("toiito_test");
  });

  it("`.git` が無ければ本体として扱う", () => {
    const parent = fs.mkdtempSync(path.join(os.tmpdir(), "toiito-checkout-"));
    temporaryRoots.push(parent);

    expect(testDatabaseName(parent)).toBe("toiito_test");
  });

  it("派生した名前は PostgreSQL の識別子に収まる", () => {
    const root = makeCheckout(`${"long-name-".repeat(8)}83910e`, "file");

    expect(testDatabaseName(root).length).toBeLessThanOrEqual(63);
  });
});
