/**
 * シナリオ 2・3: 発話の選択からメモを作り、そのメモから対話へ逆引きする。
 * 再訪を挟んでも逆引きが着地することと、過去セッションを画面から辿れることまで見る（issue #57）。
 *
 * 見るのは縦一本の後半（選択 → メモ → アンダーライン → 両向きの行き来）で、投入から応答までは dialogue.spec.ts が持つ。
 * 各シナリオは自分の問いを投入して自分の前提を作る。
 * E2E のデータベースは走り単位でしか作り直されないので、前のシナリオが残した行に寄りかかると順序に縛られる。
 */

import { expect, type Locator, type Page, test } from "@playwright/test";

/** 画面の座標で見たフォームの矩形。 */
type FormRect = { top: number; bottom: number; left: number; right: number };

/** シードの行とも互いとも混ざらないよう、シナリオごとに違う文言を使う。 */
const UNDERLINE_QUESTION = "E2E: 選択した語に印は残るのか";

const UNDERLINE_UTTERANCE = "E2E: 引っかかった語だけが後に残る";

const LOOKUP_QUESTION = "E2E: メモから対話へ戻れるのか";

const LOOKUP_UTTERANCE = "E2E: 語から場面を思い出せるか試す";

const MARK_QUESTION = "E2E: 着地の印は出るのか";

const MARK_UTTERANCE = "E2E: 飛んだ先で目印が要る";

const FORWARD_QUESTION = "E2E: 下線からメモへ戻れるのか";

const FORWARD_UTTERANCE = "E2E: 印から中身へ辿れるか試す";

const REVISIT_QUESTION = "E2E: 再訪しても当時の発話へ戻れるのか";

const REVISIT_UTTERANCE = "E2E: 日を空けてまた話す前に印を付ける";

const SWITCH_QUESTION = "E2E: 過去セッションを画面から辿れるのか";

const SWITCH_UTTERANCE = "E2E: 一度目の対話がここにある";

const TOUCH_QUESTION = "E2E: 指で選んでもメモは作れるのか";

const TOUCH_UTTERANCE = "E2E: 画面を指でなぞって語を掴む";

const POSITION_QUESTION = "E2E: 入力欄はいつも同じ場所に出るのか";

/** 先頭と末尾が数行離れるよう、折り返す長さにする。 */
const POSITION_UTTERANCE =
  "E2E: 選んだ語の近くでなくてよいが、入力欄がどこに出るかは決まっていてほしい。画面が狭いほど、本文の後ろへ流し込む形では選んだ位置と入力欄が離れる。だから画面の下端へ貼る。";

/** 選ぶのは発話の先頭と末尾の数文字で、離れた二箇所で位置が動かないことを見る。 */
const POSITION_KEYWORD_LENGTH = 12;

/** スマホと同じ狭さ。画面の下端へ寄せるのは、狭い画面で視界の外に出さないための形。 */
const NARROW_VIEWPORT = { width: 375, height: 812 };

/** 出したまま広げる先。画面を基準に置いているなら、幅が変わっても画面の中に居る。 */
const WIDE_VIEWPORT = { width: 1280, height: 800 };

const SINGLE_QUESTION = "E2E: 下書きは画面に一つだけか";

const SINGLE_UTTERANCE =
  "E2E: 二つの発話を続けて選んでも入力欄は一つに保たれる。やめれば何も残らない。";

/** 一つ目の発話で選ぶ語。 */
const SINGLE_FIRST = "二つの発話を続けて";

/** 二つ目の発話で選ぶ語。一つ目と違う語でないと、下書きが移ったことを見られない。 */
const SINGLE_SECOND = "やめれば何も残らない";

/**
 * 画面の下端とフォームの隙間の上限（px）。
 *
 * 実装の刻み（16px）をそのまま写すと、余白を一段変えただけで落ちる。
 * 見たいのは縁から浮いていることと、下端から離れていないことの二つ。
 */
const BOTTOM_GAP_LIMIT = 40;

test("発話の一部を選ぶとメモを作れ、その区間にアンダーラインが出る", async ({
  page,
}) => {
  const aiA = await postQuestionAndSpeak(
    page,
    UNDERLINE_QUESTION,
    UNDERLINE_UTTERANCE,
  );
  await selectTextIn(page, await idOf(aiA), UNDERLINE_UTTERANCE);

  // 選択した語は引用として見せるだけで、触れる入力欄にしない。
  await expect(page.getByRole("blockquote")).toHaveText(UNDERLINE_UTTERANCE);
  await expect(page.getByLabel("キーワード")).toHaveCount(0);

  await page.getByLabel("メモ").fill("この言い換えが効いた");
  await page.getByRole("button", { name: "メモする" }).click();

  // 下線は ai_a の枠の中の、リンクになっている区間だけを見る。
  // 同じ文字列は人間の発話にも ai_b の引用にも出るので枠で絞り、
  // 選択直後はフォームの引用にも出るので role で絞る。
  const marked = aiA.getByRole("link", {
    name: UNDERLINE_UTTERANCE,
    exact: true,
  });
  await expect(marked).toHaveCSS("text-decoration-line", "underline");
  await expect(marked).toHaveAttribute(
    "title",
    `${UNDERLINE_UTTERANCE}: この言い換えが効いた`,
  );
});

test("選択を touchend で終えてもメモの小フォームが立つ", async ({ page }) => {
  const aiA = await postQuestionAndSpeak(page, TOUCH_QUESTION, TOUCH_UTTERANCE);
  await selectTextInByTouch(page, await idOf(aiA), TOUCH_UTTERANCE);

  await expect(page.getByRole("blockquote")).toHaveText(TOUCH_UTTERANCE);
});

test("メモの小フォームは、選んだ位置でもスクロールでも画面幅でも、画面の下端の少し上に居る", async ({
  page,
}) => {
  await page.setViewportSize(NARROW_VIEWPORT);
  const aiA = await postQuestionAndSpeak(
    page,
    POSITION_QUESTION,
    POSITION_UTTERANCE,
  );
  const messageId = await idOf(aiA);

  await selectTextIn(
    page,
    messageId,
    POSITION_UTTERANCE.slice(0, POSITION_KEYWORD_LENGTH),
  );
  const atHead = await formRect(page);

  expectNearBottom(atHead, NARROW_VIEWPORT);

  await selectTextIn(
    page,
    messageId,
    POSITION_UTTERANCE.slice(-POSITION_KEYWORD_LENGTH),
  );
  expect(await formRect(page)).toEqual(atHead);

  // 書いている途中に発話を読み返せる（背面を止めない）。
  await page.mouse.wheel(0, 300);
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBeGreaterThan(0);

  expect(await formRect(page)).toEqual(atHead);

  // 出したまま画面を広げても、基準は画面のまま。
  await page.setViewportSize(WIDE_VIEWPORT);

  const widened = await formRect(page);

  expectNearBottom(widened, WIDE_VIEWPORT);
  expect(widened.left).toBeGreaterThanOrEqual(0);
  expect(widened.right).toBeLessThanOrEqual(WIDE_VIEWPORT.width);
});

test("別の発話を選ぶと下書きはそちらへ移り、やめれば選択の色ごと残らない", async ({
  page,
}) => {
  const aiA = await postQuestionAndSpeak(
    page,
    SINGLE_QUESTION,
    SINGLE_UTTERANCE,
  );
  const aiB = page.locator('[id^="msg-"]').filter({ hasText: "[fake:ai_b" });

  await selectTextIn(page, await idOf(aiA), SINGLE_FIRST);
  await expect(page.getByRole("blockquote")).toHaveText(SINGLE_FIRST);

  await selectTextIn(page, await idOf(aiB), SINGLE_SECOND);

  // 前の発話の下書きが残っていると、やめた拍子にそれが出てくる。
  await expect(memoForm(page)).toHaveCount(1);
  await expect(page.getByRole("blockquote")).toHaveText(SINGLE_SECOND);

  await page.getByRole("button", { name: "やめる" }).click();

  await expect(memoForm(page)).toHaveCount(0);
  expect(await page.evaluate(() => window.getSelection()?.toString())).toBe("");
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
  await expect(
    aiA.getByRole("link", { name: LOOKUP_UTTERANCE, exact: true }),
  ).toHaveCSS("text-decoration-line", "underline");

  await page.goto("/memos");
  await page.getByRole("link", { name: LOOKUP_UTTERANCE }).click();

  // 行を押すと拡大表示が開く。
  // 出所の発話への逆引きはその中にある。
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("link", { name: "この発話へ" }).click();

  // 着地の印は三箇所が同じ書式を共有して初めて出る。
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

  await aiA.getByRole("link", { name: FORWARD_UTTERANCE, exact: true }).click();

  // 開くのは押した下線に紐づくメモ一件で、一覧を出すだけでは足りない。
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("heading")).toHaveText(FORWARD_UTTERANCE);
});

test("着地した発話に印が付く", async ({ page }) => {
  const aiA = await postQuestionAndSpeak(page, MARK_QUESTION, MARK_UTTERANCE);
  const messageId = await idOf(aiA);
  await selectTextIn(page, messageId, MARK_UTTERANCE);

  await page.getByRole("button", { name: "メモする" }).click();

  // 下線が出るまでは、メモがまだ出来ていない。
  // 待たずに移ると、そのメモが並んでいない一覧を相手にすることになる。
  await expect(
    aiA.getByRole("link", { name: MARK_UTTERANCE, exact: true }),
  ).toBeVisible();

  await page.goto("/memos");
  await page.getByRole("link", { name: MARK_UTTERANCE }).click();
  await page
    .getByRole("dialog")
    .getByRole("link", { name: "この発話へ" })
    .click();

  // 見るのは印が付いたことまで。
  // 色と消え方は CSS の animation が持つので、そこは L5 の領分。
  await expect(page.locator(`#${messageId}`)).toHaveAttribute(
    "data-landed",
    "",
  );
});

test("再訪したあとでも、メモからそのメモを付けた当時の発話へ着地する", async ({
  page,
}) => {
  const aiA = await postQuestionAndSpeak(
    page,
    REVISIT_QUESTION,
    REVISIT_UTTERANCE,
  );
  const messageId = await idOf(aiA);
  await selectTextIn(page, messageId, REVISIT_UTTERANCE);
  await page.getByRole("button", { name: "メモする" }).click();

  await page.getByRole("button", { name: "新しいセッションで再訪" }).click();

  // 再訪すると画面は新しいセッションへ移る。
  // メモを付けた発話はここには無い（消えたのではなく、描いているセッションが違う）。
  await expect(page.locator(`#${messageId}`)).toHaveCount(0);

  await page.goto("/memos");
  await page.getByRole("link", { name: REVISIT_UTTERANCE }).click();
  await page
    .getByRole("dialog")
    .getByRole("link", { name: "この発話へ" })
    .click();

  // 着地の条件は、飛べたことではなく、当時の発話がそこに描かれていること。
  await expect(page.locator(`#${messageId}`)).toBeInViewport();
  await expect(page.locator(`#${messageId}`)).toContainText(REVISIT_UTTERANCE);
});

test("再訪すると切り替え口が出て、過去セッションを読み返せる", async ({
  page,
}) => {
  const aiA = await postQuestionAndSpeak(
    page,
    SWITCH_QUESTION,
    SWITCH_UTTERANCE,
  );
  const messageId = await idOf(aiA);

  // セッションが一つのうちは切り替え口を出さない（選ぶ先が無い）。
  const switcher = page.getByRole("navigation", { name: "セッション" });
  await expect(switcher).toHaveCount(0);

  await page.getByRole("button", { name: "新しいセッションで再訪" }).click();
  await expect(switcher.getByRole("link")).toHaveCount(2);

  await switcher.getByRole("link").first().click();

  // 過去セッションは読み返すだけ。
  // 続けたくなったときのために、最新へ戻る口だけを残す。
  await expect(page.locator(`#${messageId}`)).toBeVisible();
  await expect(page.getByRole("button", { name: /^発話する/ })).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "最新のセッションへ" }),
  ).toBeVisible();
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
 * メモの小フォームの位置を、画面の座標で読む。
 *
 * ページの座標では、スクロールで動かないことを見られない。
 */
async function formRect(page: Page): Promise<FormRect> {
  return memoForm(page).evaluate((form) => {
    const { top, bottom, left, right } = form.getBoundingClientRect();

    return { top, bottom, left, right };
  });
}

/** メモの小フォーム。発話の口の form と混ざらないよう、「メモする」を持つ側で引く。 */
function memoForm(page: Page): Locator {
  return page
    .locator("form")
    .filter({ has: page.getByRole("button", { name: "メモする" }) });
}

/** フォームが画面の下端へ寄っており、かつ縁に貼り付いていないこと。 */
function expectNearBottom(rect: FormRect, viewport: { height: number }): void {
  const bottomGap = viewport.height - rect.bottom;

  expect(bottomGap).toBeGreaterThan(0);
  expect(bottomGap).toBeLessThanOrEqual(BOTTOM_GAP_LIMIT);
}

/**
 * 枠の中の文字列を、デスクトップで人が引いたのと同じ形で選択する。
 * 選択を閉じるのは mouseup。
 */
async function selectTextIn(
  page: Page,
  messageId: string,
  text: string,
): Promise<void> {
  await selectTextInEndingWith(page, { messageId, text, endWith: "mouseup" });
}

/**
 * 同じ選択を、iOS がジェスチャを終えるのと同じ touchend で閉じる。
 *
 * iOS は選択のジェスチャの終わりに mouseup を撃たないので、mouseup だけを見ていると下書きが立たない（issue #147）。
 * この層はデスクトップの Chromium で走って実機の口そのものは再現しないので、守れるのは touchend のリスナが張られていることまで。
 */
async function selectTextInByTouch(
  page: Page,
  messageId: string,
  text: string,
): Promise<void> {
  await selectTextInEndingWith(page, { messageId, text, endWith: "touchend" });
}

/**
 * 枠の中の文字列を選び、指定した口で選択を終える。
 *
 * Range を組んでから document へイベントを投げる。
 * Playwright のドラッグでは文字の途中で始まる範囲を安定して作れない。
 * touchend を素の Event で作るのは、TouchEvent の構築が実行環境のタッチ対応に依存するため。
 * 受ける側はイベントの中身を見ずに選択を読み直すだけなので、型名が合っていれば足りる。
 */
async function selectTextInEndingWith(
  page: Page,
  target: { messageId: string; text: string; endWith: "mouseup" | "touchend" },
): Promise<void> {
  await page.evaluate(({ messageId, text, endWith }) => {
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
      document.dispatchEvent(
        endWith === "mouseup"
          ? new MouseEvent("mouseup", { bubbles: true })
          : new Event("touchend", { bubbles: true }),
      );

      return;
    }

    throw new Error(`選択する文字列が本文に無い: ${text}`);
  }, target);
}
