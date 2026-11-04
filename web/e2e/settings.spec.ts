/**
 * 設定の画面で、API キーの登録と削除が画面に出ること、HTML に API キーが出ないこと、他人の設定が見えないことを見る。
 *
 * 単体テスト（`tests/db.test.ts`）は repo 関数が暗号文を返さないことしか言えない。
 * 画面が描いた HTML に API キーの文字列が混じらないかは、ブラウザから叩かないと見えない。
 */

import { signIn } from "@e2e/setup/sign-in";
import { expect, type Page, test } from "@playwright/test";
import { SEED_USERS } from "@scripts/seed/users";

const [OWNER, OTHER] = SEED_USERS;

/** 画面へ入力するダミーの API キーで、実在しない値。 */
const DUMMY_API_KEY = "sk-ant-e2e-dummy-key-0123456789";

/** 設定の画面の API キーの登録の状態を描く要素。 */
function apiKeyStatus(page: Page) {
  return page.locator("[data-api-key-status]");
}

/** 設定の画面で、ダミーの API キーを入力して保存し、登録済みと出るまで待つ。 */
async function saveDummyApiKey(page: Page): Promise<void> {
  await page.goto("/settings");
  await page.getByLabel(/API キー/).fill(DUMMY_API_KEY);
  await page.getByRole("button", { name: "保存する" }).click();
  await expect(apiKeyStatus(page)).toHaveText("登録済み");
}

/** 設定の画面で API キーを削除し、未登録と出るまで待つ。 */
async function deleteApiKey(page: Page): Promise<void> {
  await page.goto("/settings");
  await page.getByRole("button", { name: "API キーを削除する" }).click();
  await expect(apiKeyStatus(page)).toHaveText("未登録");
}

test("ダミーの API キーを保存すると登録済みと出て、画面の HTML にその文字列が含まれない", async ({
  page,
}) => {
  await signIn(page, OWNER.email);
  await saveDummyApiKey(page);

  const response = await page.goto("/settings");
  const html = (await response?.text()) ?? "";

  expect(html).toContain("登録済み");
  expect(html).not.toContain(DUMMY_API_KEY);
  await expect(page.getByLabel(/API キー/)).toHaveValue("");

  await deleteApiKey(page);
});

test("API キーを削除すると未登録に戻る", async ({ page }) => {
  await signIn(page, OWNER.email);
  await saveDummyApiKey(page);

  await deleteApiKey(page);

  await expect(
    page.getByRole("button", { name: "API キーを削除する" }),
  ).toHaveCount(0);
});

test("別の利用者でサインインすると、最初の利用者の設定が見えない", async ({
  page,
}) => {
  await signIn(page, OWNER.email);
  await saveDummyApiKey(page);

  await signIn(page, OTHER.email);
  await page.goto("/settings");

  await expect(apiKeyStatus(page)).toHaveText("未登録");

  await signIn(page, OWNER.email);
  await deleteApiKey(page);
});
