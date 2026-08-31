/**
 * 流し先の解決。
 *
 * 実際に流す経路（`prisma migrate deploy` の起動）は見ない。
 * 見るのは、意図しない DB へ流れる二つの形——値域の外の名前が通ることと、環境変数が無いまま既定へ倒れること。
 */

import { describeConnection, resolveTarget } from "@scripts/migrate.ts";
import { describe, expect, it } from "vitest";

const ENV = {
  DIRECT_URL_PROD: "postgresql://u:p@prod.example:5432/toiito",
  DIRECT_URL_PREVIEW: "postgresql://u:p@preview.example:5432/toiito",
};

describe("流し先の解決", () => {
  it("名前に対応する環境変数を引く", () => {
    expect(resolveTarget("preview", ENV).directUrl).toBe(
      ENV.DIRECT_URL_PREVIEW,
    );
    expect(resolveTarget("prod", ENV).directUrl).toBe(ENV.DIRECT_URL_PROD);
  });

  it("値域の外の名前を弾く", () => {
    expect(() => resolveTarget("production", ENV)).toThrow();
  });

  it("指定なしを弾く", () => {
    expect(() => resolveTarget(undefined, ENV)).toThrow();
  });

  it("環境変数が無ければ弾く", () => {
    // ここで既定へ倒すと、.env.local のローカル DB へ流れる。
    expect(() =>
      resolveTarget("prod", {
        DIRECT_URL: "postgresql://u:p@localhost/toiito",
      }),
    ).toThrow("DIRECT_URL_PROD");
  });
});

describe("接続先の表示", () => {
  it("資格情報を落としてホストとデータベース名だけ残す", () => {
    expect(
      describeConnection("postgresql://user:secret@prod.example:5432/toiito"),
    ).toBe("prod.example:5432/toiito");
  });
});
