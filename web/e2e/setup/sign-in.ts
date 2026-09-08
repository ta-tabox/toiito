/**
 * spec がブラウザのコンテキストへセッションの cookie を入れるための手順。
 *
 * Google を経ないサインイン（`POST /api/auth/sign-in/fake`）を叩くだけで、画面は触らない。
 * ログインの画面からボタンを押す経路は `e2e/auth.spec.ts` が見るので、他の spec は前提を作るところだけを共有する。
 *
 * `page.request` はそのページと cookie を共有するので、この後の `page.goto` はサインイン済みで始まる。
 */

import type { Page } from "@playwright/test";

/**
 * `email` のユーザーとしてサインインする。
 * 失敗したら理由を添えて throw する。
 */
export async function signIn(page: Page, email: string): Promise<void> {
  const response = await page.request.post("/api/auth/sign-in/fake", {
    data: { email },
  });

  if (!response.ok()) {
    throw new Error(
      `Google を経ないサインインに失敗した（${email}）: ${response.status()} ${await response.text()}`,
    );
  }
}
