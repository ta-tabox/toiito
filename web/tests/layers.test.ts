/**
 * `web/src` の追跡しているファイルがすべて `.claude/rules/layers.md` の表に置き場を持つことのテストを置く。
 *
 * 表は `db.ts`・`auth/config.ts` のようにディレクトリを省いた名前でもファイルを名指すので、パスの末尾の一致も名指しとして数える。
 */

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repositoryRoot = spawnSync("git", ["rev-parse", "--show-toplevel"], {
  cwd: import.meta.dirname,
  encoding: "utf8",
}).stdout.trim();

/** 置き場を読み取る `layers.md` の節の見出し。 */
const PLACEMENT_SECTIONS = [
  "## 境界を閉じるモジュール",
  "## 層と、import してよい相手",
];

/**
 * `markdown` の見出しが `heading` の節の本文を返す。
 *
 * 見出しが無ければ throw する。
 */
function sectionOf(markdown: string, heading: string): string {
  const start = markdown.indexOf(`${heading}\n`);

  if (start === -1) {
    throw new Error(`layers.md に節が無い: ${heading}`);
  }

  const next = markdown.indexOf("\n## ", start + heading.length);

  return markdown.slice(start, next === -1 ? undefined : next);
}

/**
 * `markdown` の置き場の節の表の行から、バッククォートで囲んだ語を `web/src` からの相対の glob として返す。
 */
function listPlacementGlobs(markdown: string): string[] {
  const tableRows = PLACEMENT_SECTIONS.flatMap((heading) =>
    sectionOf(markdown, heading)
      .split("\n")
      .filter((line) => line.startsWith("|")),
  );
  const quoted = tableRows.flatMap((row) =>
    [...row.matchAll(/`([^`]+)`/g)].map((match) => match[1]),
  );

  return quoted.map((word) => word.replace(/^web\/src\//, ""));
}

/** `file` か、その末尾のディレクトリを省いた形のどれかが `glob` に当たるか。 */
function isPlacedBy(file: string, glob: string): boolean {
  const segments = file.split("/");

  return segments.some((_, index) =>
    path.matchesGlob(segments.slice(index).join("/"), glob),
  );
}

describe("layers.md の置き場", () => {
  it("web/src の追跡しているファイルは、どれも層の表か境界の表の置き場に当たる", () => {
    const layers = readFileSync(
      path.join(repositoryRoot, ".claude/rules/layers.md"),
      "utf8",
    );
    const globs = listPlacementGlobs(layers);
    const sourceFiles = spawnSync("git", ["ls-files"], {
      cwd: path.join(repositoryRoot, "web/src"),
      encoding: "utf8",
    })
      .stdout.split("\n")
      .filter((file) => file !== "");

    const unplaced = sourceFiles.filter(
      (file) => !globs.some((glob) => isPlacedBy(file, glob)),
    );

    expect(sourceFiles).not.toEqual([]);
    expect(unplaced).toEqual([]);
  });

  it("ディレクトリを省いた名前は、同じ末尾を持つファイルを名指す", () => {
    expect(isPlacedBy("lib/auth/config.ts", "auth/config.ts")).toBe(true);
    expect(isPlacedBy("lib/secrets.ts", "secrets.ts")).toBe(true);
    expect(isPlacedBy("lib/ai/prompt.ts", "lib/*.ts")).toBe(false);
  });
});
