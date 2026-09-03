import { SEED_USERS } from "@scripts/seed/users.ts";
import { createOwner } from "@tests/setup/owner";
import { afterAll, describe, expect, it } from "vitest";
import {
  assertFakeUserNotInProduction,
  getCurrentUser,
  readFakeUserEmail,
} from "@/lib/current-user";
import * as db from "@/lib/db";

afterAll(async () => {
  await db.disconnect();
});

describe("assertFakeUserNotInProduction", () => {
  it("production でフェイク認証が設定されていたら投げる", () => {
    expect(() =>
      assertFakeUserNotInProduction({
        NODE_ENV: "production",
        TOIITO_FAKE_USER_EMAIL: "someone@example.com",
      }),
    ).toThrow(/本番/);
  });

  it("production でも未設定なら通す", () => {
    expect(() =>
      assertFakeUserNotInProduction({ NODE_ENV: "production" }),
    ).not.toThrow();
  });

  it("Vercel の Preview は通す（NODE_ENV では本番と見分けられない）", () => {
    expect(() =>
      assertFakeUserNotInProduction({
        NODE_ENV: "production",
        VERCEL_ENV: "preview",
        TOIITO_FAKE_USER_EMAIL: "someone@example.com",
      }),
    ).not.toThrow();
  });

  it("Vercel の Production は投げる", () => {
    expect(() =>
      assertFakeUserNotInProduction({
        NODE_ENV: "production",
        VERCEL_ENV: "production",
        TOIITO_FAKE_USER_EMAIL: "someone@example.com",
      }),
    ).toThrow(/本番/);
  });

  it("Preview の印が無ければ投げる（他所のホストで素通しへ落ちない）", () => {
    // VERCEL_ENV は除外の側にしか使わないので、未定義になれば判定は厳しくなる。
    expect(() =>
      assertFakeUserNotInProduction({
        NODE_ENV: "production",
        VERCEL_ENV: "development",
        TOIITO_FAKE_USER_EMAIL: "someone@example.com",
      }),
    ).toThrow(/本番/);
  });

  it("production 以外は設定されていても通す", () => {
    expect(() =>
      assertFakeUserNotInProduction({
        NODE_ENV: "development",
        TOIITO_FAKE_USER_EMAIL: "someone@example.com",
      }),
    ).not.toThrow();
  });
});

describe("readFakeUserEmail", () => {
  it("設定された email を返す", () => {
    expect(
      readFakeUserEmail({ TOIITO_FAKE_USER_EMAIL: "someone@example.com" }),
    ).toBe("someone@example.com");
  });

  it("未設定なら投げる（素通しへ倒さない）", () => {
    expect(() => readFakeUserEmail({ NODE_ENV: "development" })).toThrow(
      /TOIITO_FAKE_USER_EMAIL/,
    );
  });
});

describe("getCurrentUser", () => {
  it("env が指す利用者を返し、その id が repo 関数の所有者になる", async () => {
    const owner = await createOwner();
    const user = await getCurrentUser();

    expect(user.id).toBe(owner);
    expect(user.email).toBe(SEED_USERS[0].email);
  });

  it("env が指す利用者が DB に居なければ投げる", async () => {
    await expect(getCurrentUser()).rejects.toThrow(/pnpm seed/);
  });
});
