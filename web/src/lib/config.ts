/**
 * 環境変数から作る設定と、本番の判定と、本番で開発用の環境変数を拒否する検証。
 *
 * `config.ts` が持つのは DB への接続先と本番の判定と開発用の環境変数の一覧だけで、AI プロバイダは `lib/ai/providers.ts`、認証は `lib/auth/index.ts` が自分で解決する。
 * env はその値を使う層のエントリポイントで読む（`.claude/rules/layers.md`「境界の禁止則」）。
 * 本番の判定と検証は `process.env` を読まず、呼び出し側が受け取った env を渡す。
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
 * 本番（`VERCEL_ENV=production`）で設定されていてはならない環境変数。
 * 載せるのは、検証や外部 API を経ない経路へアプリを切り替える変数だけにする。
 */
export const DEVELOPMENT_ONLY_ENV = [
  "TOIITO_FAKE_LOGIN",
  "TOIITO_FAKE_AI",
] as const;

/**
 * `env` の `VERCEL_ENV` が本番（`production`）を指すかを返す。
 *
 * Vercel の Preview も `NODE_ENV=production` で走るので、`NODE_ENV` では本番を見分けない。
 */
export function isProduction(env: RuntimeEnv): boolean {
  return env.VERCEL_ENV === "production";
}

/**
 * `env` が本番を指すとき、`DEVELOPMENT_ONLY_ENV` の変数が一つでも設定されていれば throw する。
 * 値が `1` でなくても、空でなければ throw する。
 *
 * `web/next.config.ts` が `next build` の最初に呼ぶので、本番に入った開発用の変数は本番のビルドの失敗として現れる。
 * 各変数を読む関数は本番を判定しないので、本番で拒否する変数を足すときは `DEVELOPMENT_ONLY_ENV` に足す。
 */
export function assertNoDevelopmentEnv(env: RuntimeEnv): void {
  if (!isProduction(env)) {
    return;
  }

  const present = DEVELOPMENT_ONLY_ENV.filter((name) => env[name]);

  if (present.length > 0) {
    throw new Error(
      `${present.join("・")} は本番（VERCEL_ENV=production）では設定できない。Preview・E2E・手元の動作確認だけが使う（docs/DEPLOY.md「秘密の置き場」）`,
    );
  }
}
