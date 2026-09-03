import { resolveE2eDatabaseUrl } from "@e2e/setup/e2e-database-url";
import { describe, expect, it } from "vitest";

describe("resolveE2eDatabaseUrl", () => {
  it("上書きが無ければ手元の toiito_e2e を向く", () => {
    expect(resolveE2eDatabaseUrl(undefined)).toBe(
      "postgresql://toiito:toiito@localhost:5433/toiito_e2e",
    );
  });

  it("データベース名が同じなら、別のサーバーを向く上書きを通す", () => {
    const url = "postgresql://ci:ci@postgres.internal:5432/toiito_e2e";

    expect(resolveE2eDatabaseUrl(url)).toBe(url);
  });

  it("worktree ごとに名前を派生させる上書きは止める", () => {
    expect(() =>
      resolveE2eDatabaseUrl(
        "postgresql://toiito:toiito@localhost:5433/toiito_177_e2e",
      ),
    ).toThrowError(/toiito_177_e2e/);
  });
});
