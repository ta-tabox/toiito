/**
 * シナリオ 1: 問いを投入して発話すると、二体が順に応答する。
 *
 * 見るのは投入から応答表示までの一本で、メモの作成と逆引きは別の spec が持つ。
 * 応答はフェイクモードの決定的な文字列なので、どの体が・何を受けて応答したかまで当てられる。
 */

import { signIn } from "@e2e/setup/sign-in";
import { expect, test } from "@playwright/test";
import { OTHER_USER_INPUT } from "@scripts/seed/questions";
import { SEED_USERS } from "@scripts/seed/users";

/** シードの行と混ざらないよう、この spec にしか出ない文言を使う。 */
const QUESTION = "E2E: 速さを求めることは何を削ることなのか";

const UTTERANCE = "E2E: 急ぐほど問いが痩せる気がする";

/** 送信中のボタンを見るシナリオの問い。 */
const PENDING_QUESTION = "E2E: 待たされているあいだに何を考えるのか";

// どの画面もサインインを要求するので、シードの一人目として始める。
test.beforeEach(async ({ page }) => {
  await signIn(page, SEED_USERS[0].email);
});

test("問いを投入して発話すると、ai_a → ai_b の順にフェイク応答が並ぶ", async ({
  page,
}) => {
  await page.goto("/");

  // シードは二人分入るので、一覧に出るのは現在のユーザーの分だけであることを先に見る。
  // 絞り込みが repo 関数から抜けると、この一覧に二人目の問いが並ぶ。
  await expect(page.getByText(OTHER_USER_INPUT.body)).toHaveCount(0);

  await page.getByPlaceholder("問いをポイっと").fill(QUESTION);
  await page.getByRole("button", { name: "仕込む" }).click();

  await expect(page.getByRole("heading", { name: QUESTION })).toBeVisible();

  await page.getByPlaceholder("問いについて、いま思うことを").fill(UTTERANCE);
  await page.getByRole("button", { name: /^発話する/ }).click();

  // 見るのはペルソナ行のうち ID までにする。
  // 見出しの言い回し（「具体派」）はペルソナ文書の改稿で動くが、どの体が応答したかは動かない。
  const responses = page.getByText("[fake:");
  await expect(responses).toHaveCount(2);
  await expect(responses.nth(0)).toContainText("[fake:ai_a");
  await expect(responses.nth(1)).toContainText("[fake:ai_b");

  await expect(responses.nth(1)).toContainText(`「${UTTERANCE}」`);
});

test("仕込むを押すと、対話画面へ移るまでボタンは押せない", async ({ page }) => {
  await page.goto("/");

  // 問いの作成はすぐ終わるので、そのままでは表明より先に送信が終わる。
  // Server Action の POST をここで止め、送信中の状態を観測できるあいだ保つ。
  const held = Promise.withResolvers<void>();
  await page.route("/", async (route) => {
    if (route.request().method() === "POST") {
      await held.promise;
    }

    await route.continue();
  });

  await page.getByPlaceholder("問いをポイっと").fill(PENDING_QUESTION);
  await page.getByRole("button", { name: "仕込む" }).click();

  await expect(
    page.getByRole("button", { name: "仕込んでいる" }),
  ).toBeDisabled();

  held.resolve();
  await expect(
    page.getByRole("heading", { name: PENDING_QUESTION }),
  ).toBeVisible();
});
