/**
 * 環境変数から作る設定と、本番の判定。
 *
 * `config.ts` が持つのは DB への接続先と本番の判定だけで、AI プロバイダは `lib/ai/providers.ts`、認証は `lib/auth/index.ts` が自分で解決する。
 * env はその値を使う層のエントリポイントで読む（`.claude/rules/layers.md`「境界の禁止則」）。
 * 本番の判定は `process.env` を読まず、呼び出し側が受け取った env を渡す。
 *
 * 変数の名前と既定値の正は web/README.md の表。
 */

/**
 * アプリからの接続先。
 *
 * 未設定のまま残すのは、接続を張る側（`db.ts`）が文脈付きで throw できるようにするため。
 * `config.ts` で throw すると、DB を使わない経路まで巻き添えになる。
 */
export const DATABASE_URL = process.env.DATABASE_URL;

/**
 * 本番かどうかを判定するときに読む環境変数。
 * `process.env` をそのまま渡せるよう、宣言した以外のキーも通す。
 */
type RuntimeEnv = {
  /** Vercel が渡す実行環境の名前（`production` / `preview` / `development`）。 */
  readonly VERCEL_ENV?: string;

  readonly [key: string]: string | undefined;
};

/**
 * `env` の `VERCEL_ENV` が本番（`production`）を指すかを返す。
 *
 * Vercel の Preview も `NODE_ENV=production` で走るので、`NODE_ENV` では本番を見分けない。
 */
export function isProduction(env: RuntimeEnv): boolean {
  return env.VERCEL_ENV === "production";
}
