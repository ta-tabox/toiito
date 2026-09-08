/**
 * 認証の設定を環境変数から読む。
 *
 * 読み取りと検証だけを持ち、Better Auth のインスタンスは組み立てない（組み立ては `auth.ts`）。
 * next にも better-auth にも依存しないので、設定の検証を単体テストから直に呼べる。
 *
 * 設定が欠けていたら、検証なしで通す側へフォールバックせず throw する。
 * 設定したつもりで設定されていない状態を残さないための規律で、この失敗は実際に二度踏んでいる（`docs/adr/0022-session-security.md`）。
 *
 * エントリポイントは `readAuthConfig`。
 */

/** 認証の設定を読むときに見る環境変数。 */
type AuthEnv = {
  readonly BETTER_AUTH_SECRET?: string;
  readonly BETTER_AUTH_URL?: string;
  readonly GOOGLE_CLIENT_ID?: string;
  readonly GOOGLE_CLIENT_SECRET?: string;
  readonly TOIITO_ALLOWED_EMAILS?: string;
  readonly TOIITO_FAKE_LOGIN?: string;
  readonly VERCEL_ENV?: string;
  readonly [key: string]: string | undefined;
};

/** Google OAuth のクライアント。 */
export type GoogleClient = {
  readonly clientId: string;
  readonly clientSecret: string;
};

/** 認証の設定。 */
export type AuthConfig = {
  readonly secret: string;

  /**
   * cookie と callback の URL を組み立てる基点。
   *
   * 未設定なら Better Auth がリクエストのヘッダから組み立てる。
   * 組み立てさせるとヘッダを名乗った相手が信頼される側へ入るので、Preview のように URL が動く環境でだけ未設定にする。
   */
  readonly baseUrl: string | undefined;

  readonly allowedEmails: readonly string[];
  readonly google: GoogleClient | undefined;
  readonly isFakeLoginEnabled: boolean;
};

/**
 * 環境変数から認証の設定を読む。
 *
 * 必須の変数が欠けている場合と、サインインの手段が一つも設定されていない場合は throw する。
 */
export function readAuthConfig(env: AuthEnv): AuthConfig {
  const baseUrl = env.BETTER_AUTH_URL;
  const config: AuthConfig = {
    secret: readSecret(env),
    baseUrl,
    allowedEmails: readAllowedEmails(env),
    google: readGoogleClient(env, baseUrl),
    isFakeLoginEnabled: readFakeLoginEnabled(env),
  };

  if (!config.google && !config.isFakeLoginEnabled) {
    throw new Error(
      "サインインの手段が一つも設定されていない。GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / BETTER_AUTH_URL を設定するか、Preview と E2E では TOIITO_FAKE_LOGIN=1 を設定する（web/README.md「環境変数」）",
    );
  }

  return config;
}

/**
 * `email` が許可リストに含まれるかを判定する。
 *
 * 比較の前に前後の空白を取り除いて小文字へ揃える。
 * Better Auth は IdP から受け取った email を小文字にして `user` 表へ書き込むので、揃えないと大文字を含む設定値が一致しなくなる。
 */
export function isAllowedEmail(
  allowedEmails: readonly string[],
  email: string,
): boolean {
  return allowedEmails.includes(email.trim().toLowerCase());
}

/**
 * `BETTER_AUTH_SECRET` を読む。
 * 未設定なら throw する。
 */
function readSecret(env: AuthEnv): string {
  const secret = env.BETTER_AUTH_SECRET;

  if (!secret) {
    throw new Error(
      "BETTER_AUTH_SECRET が設定されていない。セッションのトークンと OAuth の state の署名に使う（web/README.md「環境変数」）",
    );
  }

  return secret;
}

/**
 * `TOIITO_ALLOWED_EMAILS` をカンマ区切りで読み、小文字へ揃えた配列を返す。
 *
 * 空の配列になるなら throw する。
 * 空を許すと、招待制のアプリが誰も入れない状態と誰でも入れる状態のどちらへ倒れたのかを読み取れなくなる（`docs/adr/0018-invite-only-multi-user.md` 決定 3）。
 */
function readAllowedEmails(env: AuthEnv): readonly string[] {
  const emails = (env.TOIITO_ALLOWED_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter((email) => email.length > 0);

  if (emails.length === 0) {
    throw new Error(
      "TOIITO_ALLOWED_EMAILS が空。サインインを許す email をカンマ区切りで設定する（web/README.md「環境変数」）",
    );
  }

  return emails;
}

/**
 * Google OAuth のクライアントを読む。
 * `GOOGLE_CLIENT_ID` と `GOOGLE_CLIENT_SECRET` の両方が未設定なら undefined を返す。
 *
 * 片方だけ設定されている場合と、`baseUrl` が undefined の場合は throw する。
 * 片方だけの状態は Google を使うのか使わないのかが読み取れないので、Google 抜きで起動する側へフォールバックしない。
 */
function readGoogleClient(
  env: AuthEnv,
  baseUrl: string | undefined,
): GoogleClient | undefined {
  const clientId = env.GOOGLE_CLIENT_ID;
  const clientSecret = env.GOOGLE_CLIENT_SECRET;

  if (!clientId && !clientSecret) {
    return undefined;
  }

  if (!clientId || !clientSecret) {
    throw new Error(
      "GOOGLE_CLIENT_ID と GOOGLE_CLIENT_SECRET は両方揃えて設定する",
    );
  }

  if (!baseUrl) {
    throw new Error(
      "Google OAuth を設定するなら BETTER_AUTH_URL も設定する。Google が redirect URI の事前登録を要求するので、callback の URL をリクエストのヘッダから組み立てると登録した URI と食い違う",
    );
  }

  return { clientId, clientSecret };
}

/**
 * `TOIITO_FAKE_LOGIN` が `1` かどうかを返す。
 *
 * `VERCEL_ENV=production` で有効になっていれば throw する。
 * Google を経ないサインインが本番で有効だと、許可リストに載った email を名乗るだけで他人のリソースへ到達できる。
 */
function readFakeLoginEnabled(env: AuthEnv): boolean {
  const isEnabled = env.TOIITO_FAKE_LOGIN === "1";

  if (isEnabled && env.VERCEL_ENV === "production") {
    throw new Error(
      "TOIITO_FAKE_LOGIN は本番（VERCEL_ENV=production）では設定できない。Preview と E2E だけが使う（docs/adr/0033-login-and-fake-sign-in.md 決定 3）",
    );
  }

  return isEnabled;
}
