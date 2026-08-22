/**
 * シナリオ 2・3: 発話の選択からメモを作り、そのメモから対話へ逆引きする。
 *
 * 見るのは縦一本の後半（選択 → メモ → アンダーライン → 両向きの行き来）で、投入から応答までは dialogue.spec.ts が持つ。
 * 各シナリオは自分の問いを投入して自分の前提を作る。
 * E2E のデータベースは走り単位でしか作り直されないので、前のシナリオが残した行に寄りかかると順序に縛られる。
 */

import { expect, type Page, test } from "@playwright/test";

/** シードの行とも互いとも混ざらないよう、シナリオごとに違う文言を使う。 */
const UNDERLINE_QUESTION = "E2E: 選択した語に印は残るのか";

const UNDERLINE_UTTERANCE = "E2E: 引っかかった語だけが後に残る";

const LOOKUP_QUESTION = "E2E: メモから対話へ戻れるのか";

const LOOKUP_UTTERANCE = "E2E: 語から場面を思い出せるか試す";

const MARK_QUESTION = "E2E: 着地の印は出るのか";

const MARK_UTTERANCE = "E2E: 飛んだ先で目印が要る";

const FORWARD_QUESTION = "E2E: 下線からメモへ戻れるのか";

const FORWARD_UTTERANCE = "E2E: 印から中身へ辿れるか試す";

test("発話の一部を選ぶとメモを作れ、その区間にアンダーラインが出る", async ({
  page,
}) => {
  const aiA = await postQuestionAndSpeak(
    page,
    UNDERLINE_QUESTION,
    UNDERLINE_UTTERANCE,
  );
  await selectTextIn(page, await idOf(aiA), UNDERLINE_UTTERANCE);

  // キーワードは選択文字列そのもので、書き換えさせない。
  const keyword = page.getByLabel("キーワード");
  await expect(keyword).toHaveValue(UNDERLINE_UTTERANCE);
  await expect(keyword).toHaveAttribute("readonly", "");

  await page.getByLabel("メモ").fill("この言い換えが効いた");
  await page.getByRole("button", { name: "メモする" }).click();

  // 下線は ai_a の枠の中だけを見る。
  // 同じ文字列は人間の発話にも ai_b の引用にも出るので、枠で絞らないと別の発話を指しうる。
  const marked = aiA.getByText(UNDERLINE_UTTERANCE, { exact: true });
  await expect(marked).toHaveCSS("text-decoration-line", "underline");
  await expect(marked).toHaveAttribute(
    "title",
    `${UNDERLINE_UTTERANCE}: この言い換えが効いた`,
  );
});

test("作ったメモは /memos に並び、そこから出所の発話へ着地する", async ({
  page,
}) => {
  const aiA = await postQuestionAndSpeak(
    page,
    LOOKUP_QUESTION,
    LOOKUP_UTTERANCE,
  );
  const messageId = await idOf(aiA);
  await selectTextIn(page, messageId, LOOKUP_UTTERANCE);

  await page.getByRole("button", { name: "メモする" }).click();
  await expect(aiA.getByText(LOOKUP_UTTERANCE, { exact: true })).toHaveCSS(
    "text-decoration-line",
    "underline",
  );

  await page.goto("/memos");
  await page.getByRole("link", { name: LOOKUP_UTTERANCE }).click();

  // 行を押すと拡大表示が開く。
  // 出所の発話への逆引きはその中にある。
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("link", { name: "この発話へ" }).click();

  // 着地の印は三箇所が同じ綴りを共有して初めて出る。
  // /memos が組み立てるリンク、発話へ付けた id、globals.css の [id^="msg-"]:target。
  await expect(page).toHaveURL(new RegExp(`/q/[^#]+#${messageId}$`));

  await expect(page.locator(`#${messageId}`)).toBeInViewport();
});

test("下線を押すと、その語のメモが一覧で開く", async ({ page }) => {
  const aiA = await postQuestionAndSpeak(
    page,
    FORWARD_QUESTION,
    FORWARD_UTTERANCE,
  );
  await selectTextIn(page, await idOf(aiA), FORWARD_UTTERANCE);
  await page.getByRole("button", { name: "メモする" }).click();

  await aiA.getByText(FORWARD_UTTERANCE, { exact: true }).click();

  // 開くのは押した下線に紐づくメモ一件で、一覧を出すだけでは足りない。
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("heading")).toHaveText(FORWARD_UTTERANCE);
});

test("着地した発話に :target の印が出る", async ({ page }) => {
  // クライアント遷移では印が出ない（リロードすると出る）。
  // 遷移で URL のフラグメントは変わるが :target が評価し直されないためで、逆引きの導線が黙って半分になっている。
  // 直し方は /memos のリンクを文書遷移へ戻すか、印を :target から外すかの二択で、どちらも #5 の領分。
  // 直った時点でこの表明は「落ちるはずが通った」として報告されるので、annotation を外す合図になる。
  test.fail();

  const aiA = await postQuestionAndSpeak(page, MARK_QUESTION, MARK_UTTERANCE);
  const messageId = await idOf(aiA);
  await selectTextIn(page, messageId, MARK_UTTERANCE);

  await page.getByRole("button", { name: "メモする" }).click();

  await page.goto("/memos");
  await page.getByRole("link", { name: MARK_UTTERANCE }).click();
  await page
    .getByRole("dialog")
    .getByRole("link", { name: "この発話へ" })
    .click();

  await expect(page.locator(`#${messageId}`)).toHaveCSS(
    "outline-color",
    "rgb(245, 158, 11)",
  );
});

/**
 * 問いを投入して一度発話し、二体の応答が出るまで待つ。
 *
 * 返すのは ai_a の応答が入った枠で、メモを付ける対象になる。
 * どの体かの判定は `[fake:` の行に寄せる。
 * 見出しの言い回しはペルソナ文書の改稿で動くが、この印は動かない。
 */
async function postQuestionAndSpeak(
  page: Page,
  question: string,
  utterance: string,
) {
  await page.goto("/");
  await page.getByPlaceholder("問いをポイっと投げ入れる").fill(question);
  await page.getByRole("button", { name: "投入" }).click();
  await expect(page.getByRole("heading", { name: question })).toBeVisible();

  await page.getByPlaceholder("問いについて、いま思うことを").fill(utterance);
  await page.getByRole("button", { name: /^発話する/ }).click();

  const aiA = page.locator('[id^="msg-"]').filter({ hasText: "[fake:ai_a" });
  await expect(aiA).toHaveCount(1);

  return aiA;
}

/**
 * 枠に付いた着地点の id を読む。
 * 付いていなければ落とす（逆引きの前提が崩れているので、後続の表明は意味を持たない）。
 */
async function idOf(message: ReturnType<Page["locator"]>): Promise<string> {
  const id = await message.getAttribute("id");

  if (!id) {
    throw new Error("発話の枠に id が付いていない");
  }

  return id;
}

/**
 * 枠の中の文字列を、人が引いたのと同じ形で選択する。
 *
 * Range を組んでから document へ mouseup を投げる。
 * Playwright のドラッグでは文字の途中で始まる範囲を安定して作れず、選択を拾う側は document の mouseup を見ている。
 */
async function selectTextIn(
  page: Page,
  messageId: string,
  text: string,
): Promise<void> {
  await page.evaluate(
    ({ messageId, text }) => {
      const spans = document.querySelectorAll(
        `#${CSS.escape(messageId)} [data-segment-index]`,
      );

      for (const span of spans) {
        const node = span.firstChild;
        const start = node?.textContent?.indexOf(text) ?? -1;
        const selection = window.getSelection();

        if (!node || start < 0 || !selection) {
          continue;
        }

        const range = document.createRange();
        range.setStart(node, start);
        range.setEnd(node, start + text.length);

        selection.removeAllRanges();
        selection.addRange(range);
        document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));

        return;
      }

      throw new Error(`選択する文字列が本文に無い: ${text}`);
    },
    { messageId, text },
  );
}
