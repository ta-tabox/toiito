/**
 * シナリオ: 対話画面で材料を付けると、材料が論点ごとに並び、問いの一覧の状態が上がる。
 *
 * 材料はフェイクモードの決定的な応答なので、論点の文字列に問いの本文が入ることまで当てられる。
 * 規律に通らない応答で何も保存されないことは `tests/material-from-ai.test.ts` が持つ。
 */

import { signIn } from "@e2e/setup/sign-in";
import { expect, test } from "@playwright/test";
import { SEED_USERS } from "@scripts/seed/users";

/** シードの行とも他の spec とも混ざらない問い。 */
const QUESTION = "E2E: 材料が先にあると問いは深まるのか";

// どの画面もサインインを要求するので、シードの一人目として始める。
test.beforeEach(async ({ page }) => {
  await signIn(page, SEED_USERS[0].email);
});

test("培地を付けると、対話画面に材料が並び、問いの一覧で発酵のラベルになる", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByPlaceholder("問いをポイっと").fill(QUESTION);
  await page.getByRole("button", { name: "仕込む" }).click();
  await expect(page.getByRole("heading", { name: QUESTION })).toBeVisible();

  await page.getByRole("button", { name: "培地を付ける" }).click();

  const materials = page.locator("[data-material]");
  await expect(materials).toHaveCount(2);
  await expect(
    page.getByRole("heading", { name: `[fake:material] 「${QUESTION}」` }),
  ).toBeVisible();
  await expect(materials.first().getByRole("link")).toHaveAttribute(
    "href",
    "https://example.com/fake-material/for",
  );

  await page.goto("/");
  const row = page.getByRole("listitem").filter({ hasText: QUESTION });
  await expect(row).toContainText("発酵");
});
