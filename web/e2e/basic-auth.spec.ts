/**
 * 本番のアクセス制限が、実際のリクエストを止めるかを見る。
 *
 * 判定の単体テスト（`tests/basic-auth.test.ts`）と `proxy` の戻り値のテスト（`tests/proxy.test.ts`）は、
 * 関数が正しい値を返すことしか言えない。
 * サーバーが本当に 401 を返すか、制限がすべての経路に掛かっているかは、この層でしか見えない。
 *
 * 資格情報を持つサーバーは別に立てる（`playwright.config.ts` の basic-auth プロジェクト）。
 * 他の spec が使うサーバーは資格情報を持たないので、素通しのまま変わらない。
 *
 * 叩くのは存在しない経路にする。
 * データベースを引かずに済むので、他の spec が作り直している最中でも結果が揺れない。
 * アプリのルートでない場所が 401 になることは、制限が routing より前に掛かっている証拠にもなる。
 */

import { BASIC_AUTH } from "@e2e/setup/basic-auth-credentials";
import { expect, test } from "@playwright/test";

/** アプリのどのルートにも当たらない経路。 */
const UNROUTED = "/no-such-page";

/**
 * Playwright へ渡す形の資格情報。
 * プロパティ名が `username` なので、環境変数側の `user` から詰め替える。
 */
const HTTP_CREDENTIALS = {
  username: BASIC_AUTH.user,
  password: BASIC_AUTH.password,
};

test("資格情報が無ければ 401 で止まる", async ({ request }) => {
  const response = await request.get(UNROUTED);

  expect(response.status()).toBe(401);
});

test("401 は WWW-Authenticate を添えるので、ブラウザが入力を促せる", async ({
  request,
}) => {
  const response = await request.get(UNROUTED);

  expect(response.headers()["www-authenticate"]).toContain("Basic");
});

test("パスワードが違えば 401 で止まる", async ({ browser }) => {
  const context = await browser.newContext({
    httpCredentials: { username: BASIC_AUTH.user, password: "ちがう" },
  });

  try {
    const response = await context.request.get(UNROUTED);

    expect(response.status()).toBe(401);
  } finally {
    await context.close();
  }
});

test("資格情報が合えば通り、その先はアプリが応える", async ({ browser }) => {
  const context = await browser.newContext({
    httpCredentials: HTTP_CREDENTIALS,
  });

  try {
    const response = await context.request.get(UNROUTED);

    // 通した先は「そんなページは無い」で、制限が返す 401 ではない。
    expect(response.status()).toBe(404);
  } finally {
    await context.close();
  }
});

test("ブラウザが資格情報を持てば、問いの一覧まで開く", async ({ browser }) => {
  const context = await browser.newContext({
    httpCredentials: HTTP_CREDENTIALS,
  });
  const page = await context.newPage();

  try {
    await page.goto("/");

    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  } finally {
    await context.close();
  }
});
