/**
 * サインインの導線と、セッションの守りが実際のリクエストで効くかを見る。
 *
 * 単体テストが言えるのは `proxy` が返す値と設定の読み取りまでで、cookie に何が乗るか・別 origin からの POST が拒まれるかはブラウザから叩かないと見えない（`docs/adr/0022-session-security.md` 決定 2・4）。
 * この spec だけはサインイン済みで始めない。
 * 未サインインの状態そのものを見るので、共有の前提（`e2e/setup/sign-in.ts`）を使わない。
 *
 * Google の同意画面までは通さない。
 * `TOIITO_FAKE_LOGIN=1` の環境なので、押せるのは許可リストのボタンだけである。
 */

import { E2E_BASE_URL } from "@e2e/setup/base-url";
import { signIn } from "@e2e/setup/sign-in";
import { expect, test } from "@playwright/test";
import { SEED_USERS } from "@scripts/seed/users";

/** 別 origin から投げるときに名乗るホスト。 */
const OTHER_ORIGIN = "https://toiito.example";

test("未サインインで問いの一覧を開くと、ログインの画面へ送られる", async ({
  page,
}) => {
  await page.goto("/");

  await expect(page).toHaveURL(/\/login$/);
  await expect(
    page.getByRole("button", { name: SEED_USERS[0].email }),
  ).toBeVisible();
});

test("未サインインでメモの一覧を開いても、ログインの画面へ送られる", async ({
  page,
}) => {
  await page.goto("/memos");

  await expect(page).toHaveURL(/\/login$/);
});

test("ログインの画面のボタンを押すと、問いの一覧が開く", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: SEED_USERS[0].email }).click();

  await expect(page).toHaveURL("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("toiito");
});

test("ログアウトするとログインの画面へ戻り、問いの一覧はもう開かない", async ({
  page,
}) => {
  await signIn(page, SEED_USERS[0].email);
  await page.goto("/");
  await page.getByRole("button", { name: "ログアウト" }).click();

  await expect(page).toHaveURL(/\/login$/);

  await page.goto("/");

  await expect(page).toHaveURL(/\/login$/);
});

test("セッションの cookie は HttpOnly で SameSite=Lax", async ({ page }) => {
  const response = await page.request.post("/api/auth/sign-in/fake", {
    data: { email: SEED_USERS[0].email },
  });

  const setCookie = response
    .headersArray()
    .filter((header) => header.name.toLowerCase() === "set-cookie")
    .map((header) => header.value)
    .find((value) => value.includes("session_token"));

  expect(setCookie).toBeDefined();
  expect(setCookie).toContain("HttpOnly");
  expect(setCookie).toContain("SameSite=Lax");

  // `secure` は明示しないので、http で叩くこの spec には乗らない。
  // 本番で乗ることを見るのは `docs/DEPLOY.md`「ログイン」の curl（`docs/adr/0022-session-security.md` 決定 2）。
  expect(setCookie).not.toContain("Secure");
});

test("別 origin を名乗るサインインは拒まれる", async ({ page }) => {
  // 先にサインインしておく。
  // Better Auth が origin を照合するのは cookie を持つリクエストだけで、cookie が無い相手は照合の対象にならない。
  await signIn(page, SEED_USERS[0].email);

  const response = await page.request.post("/api/auth/sign-in/fake", {
    headers: { origin: OTHER_ORIGIN },
    data: { email: SEED_USERS[0].email },
  });

  expect(response.status()).toBe(403);
});

test("別 origin を名乗る Server Action は拒まれる", async ({ page }) => {
  await signIn(page, SEED_USERS[0].email);
  await page.goto("/");

  // Server Action の ID はビルドごとに変わるので、画面が出した隠しフィールドから取得する。
  // JS を切ったブラウザはこのフィールドを含む multipart を POST するので、同じ形が別 origin から投げられる。
  const actionField = await page
    .locator('form:has([placeholder="問いをポイっと"]) input[type="hidden"]')
    .getAttribute("name");

  expect(actionField).toMatch(/^\$ACTION_ID_/);

  const submit = (origin: string) =>
    page.request.post("/", {
      headers: { origin },
      multipart: {
        [String(actionField)]: "",
        body: `E2E: ${origin} から投入した問い`,
      },
    });

  // 対照。
  // 同じ形が自分の origin からは通ることを見ないと、下の拒否が origin の照合によるものだと言えない。
  expect((await submit(E2E_BASE_URL)).ok()).toBe(true);

  // Next は origin と x-forwarded-host の食い違いを「Invalid Server Actions request」として中断し、応答は 500 になる。
  // 状態コードは版で動きうるので、拒否されたことだけを見る。
  expect((await submit(OTHER_ORIGIN)).ok()).toBe(false);
});
