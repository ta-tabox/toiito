/**
 * 管理の画面 `/admin` が、管理者にだけユーザーの一覧を描き、管理者でないユーザーには 404 を返すことを見る。
 *
 * 出し分けは `requireAdmin` がリクエストのセッションから決めるので、ブラウザから叩いて見る。
 * 管理者はシードの一人目で、二人目は管理者でない（`scripts/seed/users.ts`）。
 */

import { signIn } from "@e2e/setup/sign-in";
import { expect, test } from "@playwright/test";
import { SEED_USERS } from "@scripts/seed/users";

const [ADMIN, NON_ADMIN] = SEED_USERS;

test("管理者でない二人目が /admin を開くと 404 になり、一覧を描かない", async ({
  page,
}) => {
  await signIn(page, NON_ADMIN.email);
  const response = await page.goto("/admin");

  // 403 を返すと、管理の画面が在ることが管理者でないユーザーへ伝わる。
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("table")).toHaveCount(0);
});

test("管理者の一人目が /admin を開くと、シードの二人が一覧に出る", async ({
  page,
}) => {
  await signIn(page, ADMIN.email);
  const response = await page.goto("/admin");

  expect(response?.status()).toBe(200);

  for (const user of SEED_USERS) {
    await expect(page.getByRole("cell", { name: user.email })).toBeVisible();
  }
});
