/**
 * ケースごとの所有者を用意する。
 *
 * repo 関数はどれも所有者を要求するので、行を作るテストは先にここを通る。
 * ケース間の隔離はテーブルを空にすることで作る（`truncate.ts`）ため、`beforeEach` の中で呼ぶ。
 *
 * setupFiles には入れない。
 * 所有者を要らないテストにまで DB への書き込みを足すことになる。
 */

import { SEED_USERS } from "@scripts/seed/users";
import { createUser } from "@/lib/db";
import type { OwnerId } from "@/lib/types";

/**
 * 所有者を一人作り、その ID を返す。
 *
 * 既定の email はシードの一人目で、`TOIITO_FAKE_USER_EMAIL` が指すのと同じ人になる（`vitest.config.ts`）。
 * ページを描くテストは `getCurrentUser` 越しにこの人を引くので、既定から動かすと画面が空になる。
 * 他人を作るときだけ email を渡す。
 */
export async function createOwner(
  email: string = SEED_USERS[0].email,
): Promise<OwnerId> {
  const user = await createUser(email, `テストの利用者（${email}）`);

  return user.id;
}
