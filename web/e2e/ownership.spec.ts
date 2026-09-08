/**
 * 他人の問いが、一覧に出ないだけでなく URL を直接叩いても読めないことを見る。
 *
 * 単体テスト（`tests/db.test.ts`）は repo 関数が空を返すことしか言えない。
 * 画面が 404 を返すか、それとも中身を出したうえで空に見せているかは、ブラウザから叩かないと見えない。
 *
 * 二人分のセッションを作れるのは `TOIITO_FAKE_LOGIN=1` の環境だけである。
 * 実 OAuth では二人分のサインインを自動化できない（`docs/adr/0032-login-and-fake-sign-in.md` 決定 1）。
 */

import { signIn } from "@e2e/setup/sign-in";
import { expect, type Page, test } from "@playwright/test";
import { OTHER_USER_INPUT } from "@scripts/seed/questions";
import { SEED_USERS } from "@scripts/seed/users";

const [OWNER, OTHER] = SEED_USERS;

/**
 * 二人目としてサインインし、二人目が持つ問いの対話画面の経路を返す。
 * 経路はシードが振る UUID を含むので、一覧から辿って取得する。
 */
async function pathOfOtherUserQuestion(page: Page): Promise<string> {
  await signIn(page, OTHER.email);
  await page.goto("/");
  await page.getByText(OTHER_USER_INPUT.body).click();
  await expect(page).toHaveURL(/\/q\//);

  return new URL(page.url()).pathname;
}

test("二人目の問いは、一人目の一覧に出ない", async ({ page }) => {
  await signIn(page, OWNER.email);
  await page.goto("/");

  await expect(page.getByText(OTHER_USER_INPUT.body)).toHaveCount(0);
});

test("二人目の問いの URL を一人目が直接叩くと 404 になる", async ({ page }) => {
  const path = await pathOfOtherUserQuestion(page);

  await signIn(page, OWNER.email);
  const response = await page.goto(path);

  // 「見えない」でなく「無い」を返す。
  // 403 を返すと、その ID の問いが存在することだけは漏れる。
  expect(response?.status()).toBe(404);
});

test("同じ URL を持ち主が開けば、その問いが読める", async ({ page }) => {
  const path = await pathOfOtherUserQuestion(page);

  const response = await page.goto(path);

  expect(response?.status()).toBe(200);
  await expect(
    page.getByRole("heading", { name: OTHER_USER_INPUT.body }),
  ).toBeVisible();
});

test("二人目のメモは、一人目のメモ一覧に出ない", async ({ page }) => {
  await signIn(page, OTHER.email);
  await page.goto("/memos");
  const otherKeywords = await page.getByRole("listitem").count();

  await signIn(page, OWNER.email);
  await page.goto("/memos");

  await expect(page.getByText(OTHER_USER_INPUT.body)).toHaveCount(0);
  expect(otherKeywords).toBeGreaterThan(0);
});
