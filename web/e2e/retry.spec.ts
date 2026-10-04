/**
 * 二体の応答に失敗した発話が再送の枠に残り、再送のボタンを押すと二体の応答が並ぶまでを、ブラウザから見る。
 *
 * 失敗はフェイクモードの目印（`FAKE_FAIL_ONCE_MARKER`）で起こし、同じ本文の二回目の呼び出しは成功する。
 * 何が `messages` と `pending_messages` に残るかは `tests/turn.test.ts` が見るので、この spec は画面の再送の枠とボタンが Server Action まで届くかを見る。
 */

import { signIn } from "@e2e/setup/sign-in";
import { expect, test } from "@playwright/test";
import { SEED_USERS } from "@scripts/seed/users";
import { FAKE_FAIL_ONCE_MARKER } from "@/lib/ai/fake";

/** この spec にしか出ない問いと、最初の呼び出しで失敗させる発話。 */
const SCENARIO = {
  question: "E2E: 返事が来なかった発話はどこへ行くのか",
  utterance: `E2E: 一度は届かない発話 ${FAKE_FAIL_ONCE_MARKER}`,
} as const;

test.beforeEach(async ({ page }) => {
  await signIn(page, SEED_USERS[0].email);
});

test("応答に失敗した発話は再送の枠に残り、再送すると二体の応答が並ぶ", async ({
  page,
}) => {
  const { question, utterance } = SCENARIO;
  await page.goto("/");

  await page.getByPlaceholder("問いをポイっと").fill(question);
  await page.getByRole("button", { name: "仕込む" }).click();
  await expect(page.getByRole("heading", { name: question })).toBeVisible();

  await page.getByPlaceholder("問いについて、いま思うことを").fill(utterance);
  await page.getByRole("button", { name: /^発話する/ }).click();

  const failure = page.getByText("応答の取得に失敗した。");
  const responses = page.getByText(/\[fake:ai_/);
  await expect(failure).toBeVisible();
  await expect(responses).toHaveCount(0);

  await page.getByRole("button", { name: "再送" }).click();

  await expect(responses).toHaveCount(2);
  await expect(responses.nth(0)).toContainText("[fake:ai_a");
  await expect(responses.nth(1)).toContainText("[fake:ai_b");
  await expect(failure).toHaveCount(0);
});
