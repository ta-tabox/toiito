/**
 * 利用者の API キーを、環境変数に置いた鍵の一覧で暗号化・復号する関数を置く。
 * `process.env` の読み取りは持たず、`secrets-config.ts` が持つ。
 *
 * 暗号化は AES-256-GCM で、暗号文は暗号化に使った鍵の鍵 ID を持つ。
 * 復号は暗号文の鍵 ID で鍵を選ぶので、回転の途中は旧い鍵の暗号文も新しい鍵の暗号文も復号できる。
 * エラー文に含めてよいのは鍵 ID と組の位置だけで、平文・暗号文・鍵の値は含めない。
 */

import {
  createCipheriv,
  createDecipheriv,
  createSecretKey,
  type KeyObject,
  randomBytes,
} from "node:crypto";

/** 暗号化の方式。 */
const CIPHER = "aes-256-gcm";

/** 鍵の長さ（バイト）で、AES-256 の鍵長。 */
const KEY_BYTES = 32;

/** 初期化ベクトルの長さ（バイト）で、GCM が推奨する 96 ビット。 */
const IV_BYTES = 12;

/**
 * 認証タグの長さ（バイト）。
 *
 * `createDecipheriv` に長さを渡さないと、`setAuthTag` が短く切り詰めたタグも受け付ける。
 */
const AUTH_TAG_BYTES = 16;

/** 鍵 ID に使える文字で、区切りの `:` と `,` を含まない。 */
const KEY_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

/** 暗号文の各部分と、環境変数の鍵 ID と鍵の値を分ける区切り。 */
const FIELD_SEPARATOR = ":";

/** 環境変数の中で、鍵 ID と鍵の値の組を並べる区切り。 */
const ENTRY_SEPARATOR = ",";

/** `decryptApiKey` に渡した値が `encryptApiKey` の戻り値の形でないときのエラー文。 */
const MALFORMED_STORED_API_KEY_MESSAGE =
  "保存された API キーの暗号文の形式が不正。encryptApiKey が返した値でない";

/**
 * 暗号化の鍵を読むときに見る環境変数。
 * 値の書き方の正は `web/README.md`「環境変数」。
 */
type EncryptionKeyEnv = {
  /** `<鍵 ID>:<鍵の値>` のカンマ区切りで、先頭の組の鍵で暗号化する。 */
  readonly TOIITO_API_KEY_ENCRYPTION_KEYS?: string;

  /** `process.env` をそのまま渡せるよう、宣言した以外のキーも通す。 */
  readonly [key: string]: string | undefined;
};

/** 鍵 ID を付けた暗号化の鍵。 */
type EncryptionKey = {
  readonly id: string;

  /** `KeyObject` で持つので、鍵の一覧をログへ出しても鍵の値は出ない。 */
  readonly key: KeyObject;
};

/**
 * 暗号化に使う鍵と、復号にだけ使う鍵の一覧。
 * `readEncryptionKeyRing` が環境変数から作り、`encryptApiKey` と `decryptApiKey` が受け取る。
 */
export type EncryptionKeyRing = {
  /** 暗号化に使う鍵で、復号にも使う。 */
  readonly encryptionKey: EncryptionKey;

  /** 回転の途中で残している旧い鍵で、復号にだけ使う。 */
  readonly decryptionOnlyKeys: readonly EncryptionKey[];
};

/** `encryptApiKey` の戻り値を分けた、復号に要る部分。 */
type StoredApiKeyParts = {
  readonly keyId: string;
  readonly iv: Buffer;
  readonly authTag: Buffer;
  readonly encrypted: Buffer;
};

/**
 * `env` の `TOIITO_API_KEY_ENCRYPTION_KEYS` から鍵の一覧を読む。
 * 先頭の組の鍵を暗号化に使う鍵にし、残りを復号にだけ使う鍵にする。
 *
 * 未設定・空・形式が不正な組・32 バイトでない鍵・重複した鍵 ID のどれかがあれば throw する。
 */
export function readEncryptionKeyRing(
  env: EncryptionKeyEnv,
): EncryptionKeyRing {
  const keys = (env.TOIITO_API_KEY_ENCRYPTION_KEYS ?? "")
    .split(ENTRY_SEPARATOR)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .map((entry, index) => parseKeyEntry(entry, index));

  assertUniqueKeyIds(keys);

  const [encryptionKey, ...decryptionOnlyKeys] = keys;

  if (!encryptionKey) {
    throw new Error(
      "TOIITO_API_KEY_ENCRYPTION_KEYS が空。<鍵 ID>:<鍵の値> をカンマ区切りで設定する（web/README.md「環境変数」）",
    );
  }

  return { encryptionKey, decryptionOnlyKeys };
}

/**
 * `plain` を `keys` の暗号化に使う鍵で暗号化し、鍵 ID・初期化ベクトル・認証タグ・暗号化した本文を `:` で繋いだ文字列を返す。
 *
 * 初期化ベクトルを呼ぶたびに乱数で作るので、同じ `plain` でも戻り値は毎回違い、暗号文どうしを比べて同じキーかを判定できない。
 */
export function encryptApiKey(plain: string, keys: EncryptionKeyRing): string {
  const { id, key } = keys.encryptionKey;
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(CIPHER, key, iv, {
    authTagLength: AUTH_TAG_BYTES,
  });
  const encrypted = Buffer.concat([
    cipher.update(plain, "utf8"),
    cipher.final(),
  ]);

  return [
    id,
    iv.toString("base64"),
    cipher.getAuthTag().toString("base64"),
    encrypted.toString("base64"),
  ].join(FIELD_SEPARATOR);
}

/**
 * `encryptApiKey` が返した `stored` を、`stored` の鍵 ID に当たる `keys` の鍵で復号して平文を返す。
 * 形式が不正なとき・鍵 ID に当たる鍵が `keys` に無いとき・認証タグが合わないときは throw する。
 */
export function decryptApiKey(stored: string, keys: EncryptionKeyRing): string {
  const parts = parseStoredApiKey(stored);
  const key = findKey(keys, parts.keyId);

  if (!key) {
    throw new Error(
      `鍵 ID ${parts.keyId} の鍵が TOIITO_API_KEY_ENCRYPTION_KEYS に無い。暗号化に使った鍵が一覧から外されている（docs/DEPLOY.md「秘密の置き場」）`,
    );
  }

  const decipher = createDecipheriv(CIPHER, key, parts.iv, {
    authTagLength: AUTH_TAG_BYTES,
  });
  decipher.setAuthTag(parts.authTag);

  try {
    return Buffer.concat([
      decipher.update(parts.encrypted),
      decipher.final(),
    ]).toString("utf8");
  } catch (error) {
    throw new Error(
      `鍵 ID ${parts.keyId} の暗号文を復号できない。暗号文が書き換えられたか、同じ鍵 ID に暗号化したときと違う鍵の値が設定されている`,
      { cause: error },
    );
  }
}

/**
 * `TOIITO_API_KEY_ENCRYPTION_KEYS` の `index` 番目（0 起点）の組 `entry` を読み、鍵 ID を付けた鍵を返す。
 * 鍵 ID が `KEY_ID_PATTERN` に合わないか、鍵の値が 32 バイトの正規の base64 でなければ throw する。
 */
function parseKeyEntry(entry: string, index: number): EncryptionKey {
  const position = `TOIITO_API_KEY_ENCRYPTION_KEYS の ${index + 1} 番目の組`;
  const fields = entry.split(FIELD_SEPARATOR);

  if (fields.length !== 2 || !KEY_ID_PATTERN.test(fields[0])) {
    throw new Error(
      `${position}が <鍵 ID>:<鍵の値> の形でない。鍵 ID は英数字・_・- で書く（web/README.md「環境変数」）`,
    );
  }

  const [id, value] = fields;
  const bytes = decodeBase64(value);

  if (bytes?.length !== KEY_BYTES) {
    throw new Error(
      `${position}の鍵の値が 32 バイトの base64 でない。openssl rand -base64 32 で作る（web/README.md「環境変数」）`,
    );
  }

  return { id, key: createSecretKey(bytes) };
}

/**
 * `keys` に同じ鍵 ID が二つ以上あれば throw する。
 *
 * 同じ鍵 ID の鍵が二つあると、その鍵 ID の暗号文をどちらの鍵で復号するかが決まらない。
 */
function assertUniqueKeyIds(keys: readonly EncryptionKey[]): void {
  const ids = keys.map((key) => key.id);
  const duplicated = new Set(ids.filter((id, i) => ids.indexOf(id) !== i));

  if (duplicated.size > 0) {
    throw new Error(
      `TOIITO_API_KEY_ENCRYPTION_KEYS の鍵 ID が重複している: ${[...duplicated].join("・")}`,
    );
  }
}

/**
 * `keys` から鍵 ID が `keyId` の鍵を探す。
 * 暗号化に使う鍵と復号にだけ使う鍵のどちらにも無ければ undefined を返す。
 */
function findKey(
  keys: EncryptionKeyRing,
  keyId: string,
): KeyObject | undefined {
  return [keys.encryptionKey, ...keys.decryptionOnlyKeys].find(
    (candidate) => candidate.id === keyId,
  )?.key;
}

/**
 * `stored` を鍵 ID・初期化ベクトル・認証タグ・暗号化した本文へ分ける。
 * 区切りの数・鍵 ID の文字・base64・初期化ベクトルと認証タグの長さのどれかが合わなければ throw する。
 */
function parseStoredApiKey(stored: string): StoredApiKeyParts {
  const fields = stored.split(FIELD_SEPARATOR);

  if (fields.length !== 4) {
    throw new Error(MALFORMED_STORED_API_KEY_MESSAGE);
  }

  const [keyId, ivText, authTagText, encryptedText] = fields;
  const iv = decodeBase64(ivText);
  const authTag = decodeBase64(authTagText);
  const encrypted = decodeBase64(encryptedText);

  if (
    !KEY_ID_PATTERN.test(keyId) ||
    iv?.length !== IV_BYTES ||
    authTag?.length !== AUTH_TAG_BYTES ||
    !encrypted
  ) {
    throw new Error(MALFORMED_STORED_API_KEY_MESSAGE);
  }

  return { keyId, iv, authTag, encrypted };
}

/**
 * `text` を base64 として読み、バイト列を返す。
 * 読んだバイト列を base64 へ書き戻して `text` に一致しなければ undefined を返す。
 *
 * `Buffer.from` は base64 でない文字を読み飛ばすので、書き戻して比べないと、1 文字書き換えた暗号文が元と同じバイト列として読まれうる。
 */
function decodeBase64(text: string): Buffer | undefined {
  const bytes = Buffer.from(text, "base64");

  if (bytes.toString("base64") !== text) {
    return undefined;
  }

  return bytes;
}
