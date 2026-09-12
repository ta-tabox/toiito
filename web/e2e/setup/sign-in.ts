/**
 * spec がブラウザのコンテキストへセッションの cookie を入れるための手順。
 *
 * Google を経ないサインイン（`POST /api/auth/sign-in/fake`）を叩くだけで、画面は触らない。
 * ログインの画面からボタンを押す経路は `e2e/auth.spec.ts` が見るので、他の spec は前提を作るところだけを共有する。
 *
 * `page.request` はそのページと cookie を共有するので、この後の `page.goto` はサインイン済みで始まる。
 */

import { E2E_BASE_URL } from "@e2e/setup/base-url";
import type { Page } from "@playwright/test";

/**
 * `email` のユーザーとしてサインインする。
 * 失敗したら理由を添えて throw する。
 *
 * Origin を自分で名乗るのは、Better Auth が cookie を持つ POST に対して origin の照合を要求するため。
 * ブラウザはフォームの送信に Origin を付けるが、`page.request` は付けないので、2 回目以降のサインインが 403 になる。
 */
export async function signIn(page: Page, email: string): Promise<void> {
  const response = await page.request.post("/api/auth/sign-in/fake", {
    headers: { origin: E2E_BASE_URL },
    data: { email },
  });

  if (!response.ok()) {
    throw new Error(
      `Google を経ないサインインに失敗した（${email}）: ${response.status()} ${await response.text()}`,
    );
  }
}
