/**
 * 落として良いデータベースの選別。
 *
 * 実際に落とす経路（drop database の発行）は見ない。
 * 見るのは、生きた worktree の DB を巻き込む形と、規則の外の名前を勝手に落とす形の二つ。
 */

import { selectPruneTargets } from "@scripts/prune-test-databases.ts";
import { describe, expect, it } from "vitest";

describe("selectPruneTargets", () => {
  it("worktree が消えた派生名を落とす", () => {
    const { orphans } = selectPruneTargets(
      ["toiito_wt_129_test", "toiito_wt_145_test"],
      ["toiito_wt_145_test"],
    );

    expect(orphans).toEqual(["toiito_wt_129_test"]);
  });

  it("生きた worktree の DB は残す", () => {
    const { orphans, unmanaged } = selectPruneTargets(
      ["toiito_wt_145_test"],
      ["toiito_wt_145_test"],
    );

    expect(orphans).toEqual([]);
    expect(unmanaged).toEqual([]);
  });

  it("開発用と既定の一本は対象にならない", () => {
    const { orphans, unmanaged } = selectPruneTargets(
      ["toiito", "toiito_test", "toiito_e2e"],
      [],
    );

    expect(orphans).toEqual([]);
    expect(unmanaged).toEqual([]);
  });

  it("手で付けた名前は落とさず人間へ渡す", () => {
    const { orphans, unmanaged } = selectPruneTargets(
      ["toiito_120_test", "toiito_129_e2e", "toiito_129_perf"],
      [],
    );

    expect(orphans).toEqual([]);
    expect(unmanaged).toEqual([
      "toiito_120_test",
      "toiito_129_e2e",
      "toiito_129_perf",
    ]);
  });

  it("他のプロジェクトのデータベースには触れない", () => {
    const { orphans, unmanaged } = selectPruneTargets(
      ["postgres", "template0", "other_app_test"],
      [],
    );

    expect(orphans).toEqual([]);
    expect(unmanaged).toEqual([]);
  });
});
