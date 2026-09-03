/**
 * 開発用シードが入れる二人の宣言。
 *
 * 二人入れるのは、所有権の絞り込みが効いていることを一人では見られないため。
 * 先頭が「現在の利用者」で、`TOIITO_FAKE_USER_EMAIL` はこの email を指す（`src/lib/current-user.ts`）。
 * 二人目の問いは、どの画面にも出てはいけない側として在る。
 *
 * 本物のログインが入れば、利用者を作るのは Better Auth になる（#68（ログイン（Google OAuth）とリソースの所有権））。
 * ここが作るのは、その前に画面を触るための固定の二人だけである。
 */

/** シードで入れる利用者一人分。 */
export type SeedUser = {
  email: string;
  name: string;
};

/**
 * 入れる二人。
 *
 * ドメインは RFC 2606 が文書用に予約している `example.com`。
 * 実在の宛先を書くと、届かないメールを送る経路が後から生えたときに実害へ変わる。
 */
export const SEED_USERS: SeedUser[] = [
  { email: "first@example.com", name: "シードの一人目" },
  { email: "second@example.com", name: "シードの二人目" },
];
