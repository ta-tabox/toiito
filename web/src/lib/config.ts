/**
 * 環境変数から作る設定。
 *
 * ここが持つのは DB への接続先だけで、AI プロバイダは `lib/ai/providers.ts`、Basic 認証は `proxy.ts` が自分で解決する。
 * env を読む場所をその値を使う層の入口へ寄せると、探す側が使う場所から辿れる（HARNESS.md「テスト可能性の設計制約」2）。
 *
 * 変数の名前と既定値の正は web/README.md の表。
 */

/**
 * アプリからの接続先。
 *
 * 未設定のまま残すのは、接続を張る側（db.ts）が文脈付きで落とせるようにするため。
 * ここで落とすと、DB を使わない経路まで巻き添えになる。
 */
export const DATABASE_URL = process.env.DATABASE_URL;
