/**
 * シナリオ 1: 問いを投入して発話すると、二体が順に応答する。
 *
 * 見るのは投入から応答表示までの一本で、メモの作成と逆引きは別の spec が持つ（issue #6）。
 * 応答はフェイクモードの決定的な文字列なので、どの体が・何を受けて応答したかまで当てられる。
 */

import { expect, test } from "@playwright/test";
import { OTHER_USER_INPUT } from "@scripts/seed/questions";

/** シードの行と混ざらないよう、この spec にしか出ない文言を使う。 */
const QUESTION = "E2E: 速さを求めることは何を削ることなのか";

const UTTERANCE = "E2E: 急ぐほど問いが痩せる気がする";

test("問いを投入して発話すると、ai_a → ai_b の順にフェイク応答が並ぶ", async ({
  page,
}) => {
  await page.goto("/");

  // シードは二人分入るので、一覧に出るのは現在の利用者の分だけであることを先に見る。
  // 絞り込みが repo 層から抜けると、ここに二人目の問いが並ぶ。
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
