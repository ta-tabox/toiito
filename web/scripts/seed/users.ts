/**
 * 開発用シードが入れるユーザー二人の宣言。
 *
 * 二人入れるのは、所有権の絞り込みが効いていることを一人では見られないため。
 * 先頭が「現在のユーザー」で管理者を兼ね、二人目の問いはどの画面にも出てはいけない側として在る。
 * 二人目は管理者でないので、管理の画面が管理者でないユーザーへ 404 を返すことも二人目で見る。
 *
 * 本番のユーザーを作るのは Better Auth で、`SEED_USERS` が入れる 2 人は Preview と E2E だけが使う。
 * この 2 人は Google のアカウントを持たないので、サインインできるのは `TOIITO_FAKE_LOGIN=1` の環境だけである。
 */

/** シードで入れるユーザー一人分。 */
export type SeedUser = {
  email: string;
  name: string;
  is_admin: boolean;
};

/**
 * 入れる二人。
 *
 * ドメインは RFC 2606 が文書用に予約している `example.com`。
 * 実在の宛先を書くと、届かないメールを送る経路が後から生えたときに実害へ変わる。
 */
export const SEED_USERS: SeedUser[] = [
  { email: "first@example.com", name: "シードの一人目", is_admin: true },
  { email: "second@example.com", name: "シードの二人目", is_admin: false },
];
