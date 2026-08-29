/**
 * 本番の入口に掛ける Basic 認証の判定。
 *
 * 通すか通さないかだけを決め、通った先で誰であるかは見ない。
 * 所有権の概念は #68（ログイン（Google OAuth）とリソースの所有権）が持つので、ここには無い。
 *
 * next にも DOM にも依存しない。
 * HTTP の応答を組み立てるのは middleware の側で、ここは判定を返すだけにする。
 */

/** Basic 認証の資格情報。 */
export type BasicAuthCredentials = {
  readonly user: string;
  readonly password: string;
};

/** Basic 認証の設定を読むときに見る環境変数。 */
type BasicAuthEnv = {
  readonly TOIITO_BASIC_AUTH_USER?: string;
  readonly TOIITO_BASIC_AUTH_PASSWORD?: string;
  readonly NODE_ENV?: string;
};

/**
 * 環境変数から Basic 認証の資格情報を読む。
 *
 * 認証を掛けないときは null を返す。
 * ただし production では null を返さず投げる。
 * 設定を入れ忘れた本番が黙って開く経路を残さないためで、この失敗は実際に一度踏んでいる（`docs/adr/0013-production-basic-auth.md`）。
 *
 * 片方だけ設定されている場合も投げる。
 * 掛けたいのか掛けたくないのかが読めない状態なので、素通しへ倒さない。
 */
export function readBasicAuthCredentials(
  env: BasicAuthEnv,
): BasicAuthCredentials | null {
  const user = env.TOIITO_BASIC_AUTH_USER;
  const password = env.TOIITO_BASIC_AUTH_PASSWORD;

  if (user && password) {
    return { user, password };
  }

  if (user || password) {
    throw new Error(
      "TOIITO_BASIC_AUTH_USER と TOIITO_BASIC_AUTH_PASSWORD は両方揃えて設定する",
    );
  }

  if (env.NODE_ENV === "production") {
    throw new Error(
      "本番では TOIITO_BASIC_AUTH_USER と TOIITO_BASIC_AUTH_PASSWORD が要る（DEPLOY.md「アクセス制限」）",
    );
  }

  return null;
}

/**
 * Authorization ヘッダが資格情報と一致するかを判定する。
 *
 * 綴りが Basic でない・base64 が壊れている・区切りの `:` が無い、のいずれもすべて不一致として扱う。
 * 不一致の理由は呼び出し側へ返さない。
 */
export function isAuthorized(
  header: string | null,
  credentials: BasicAuthCredentials,
): boolean {
  const sent = decodeBasic(header);

  if (sent === null) {
    return false;
  }

  // 短絡させると、利用者名だけ当たったことが処理時間に出る。
  const userMatches = equalsInConstantTime(sent.user, credentials.user);
  const passwordMatches = equalsInConstantTime(
    sent.password,
    credentials.password,
  );

  return userMatches && passwordMatches;
}

/** Basic の Authorization ヘッダを利用者名とパスワードへ解く。 */
function decodeBasic(header: string | null): BasicAuthCredentials | null {
  if (header === null) {
    return null;
  }

  // RFC 7235 のスキーム名は大文字小文字を区別しない。
  // ブラウザは Basic と綴るが、綴りの違いで弾く理由は無い。
  const schemeEnd = header.indexOf(" ");

  if (
    schemeEnd === -1 ||
    header.slice(0, schemeEnd).toLowerCase() !== "basic"
  ) {
    return null;
  }

  const decoded = decodeBase64Utf8(header.slice(schemeEnd + 1));

  if (decoded === null) {
    return null;
  }

  // RFC 7617 の利用者名は `:` を含めない。
  // よって最初の `:` だけが区切りで、それ以降はパスワードの一部になる。
  const separator = decoded.indexOf(":");

  if (separator === -1) {
    return null;
  }

  return {
    user: decoded.slice(0, separator),
    password: decoded.slice(separator + 1),
  };
}

/** base64 を UTF-8 の文字列へ戻す。 */
function decodeBase64Utf8(encoded: string): string | null {
  try {
    const bytes = Uint8Array.from(atob(encoded), (character) =>
      character.charCodeAt(0),
    );

    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

/**
 * 二つの文字列を、一致した文字数が処理時間に出ない形で比べる。
 *
 * 資格情報の比較なので、違いを見つけた時点で抜けない。
 */
function equalsInConstantTime(left: string, right: string): boolean {
  const length = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;

  for (let index = 0; index < length; index += 1) {
    // 範囲外は NaN になるので、0 として畳む。
    // 長さの違いは上の XOR が既に拾っている。
    const leftCode = left.charCodeAt(index) || 0;
    const rightCode = right.charCodeAt(index) || 0;

    difference |= leftCode ^ rightCode;
  }

  return difference === 0;
}
