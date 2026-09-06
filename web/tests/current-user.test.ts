import { SEED_USERS } from "@scripts/seed/users.ts";
import { createOwner } from "@tests/setup/owner";
import { afterAll, describe, expect, it } from "vitest";
import { getCurrentUser, readSingleUserEmail } from "@/lib/current-user";
import * as db from "@/lib/db";

afterAll(async () => {
  await db.disconnect();
});

describe("readSingleUserEmail", () => {
  it("設定された email を返す", () => {
    expect(
      readSingleUserEmail({ TOIITO_SINGLE_USER_EMAIL: "someone@example.com" }),
    ).toBe("someone@example.com");
  });

  it("未設定なら投げる（素通しへ倒さない）", () => {
    expect(() => readSingleUserEmail({})).toThrow(/TOIITO_SINGLE_USER_EMAIL/);
  });
});

describe("getCurrentUser", () => {
  it("env が名指しする利用者を返し、その id が repo 関数の所有者になる", async () => {
    const owner = await createOwner();
    const user = await getCurrentUser();

    expect(user.id).toBe(owner);
    expect(user.email).toBe(SEED_USERS[0].email);
  });

  it("env が名指しする利用者が DB に居なければ投げる", async () => {
    await expect(getCurrentUser()).rejects.toThrow(/DB に居ない/);
  });
});
