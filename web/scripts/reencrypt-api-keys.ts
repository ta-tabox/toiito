/**
 * 利用者の API キーの暗号文を、暗号化に使う鍵で暗号化し直す関数と、鍵 ID ごとの暗号文の件数を出す関数と、その CLI を置く。
 * 鍵の回転の手順は持たず、`docs/DEPLOY.md`「利用者の API キーを暗号化する鍵を回転する」が持つ。
 *
 * 手元から本番か Preview の DB へ直結で繋いで走り、接続先と鍵の一覧を適用先ごとの環境変数から読む。
 * 鍵を適用先ごとの変数に分けるのは、手元の `TOIITO_API_KEY_ENCRYPTION_KEYS` で本番の暗号文を数えると、鍵 ID の一致だけで旧い鍵の暗号文が無いと読めてしまうため。
 *
 * エントリポイントは CLI（`pnpm keys:reencrypt <prod|preview> [--report]`）。
 */

import { fileURLToPath } from "node:url";
import type { EncryptionKeyRing } from "@/lib/secrets";
import {
  describeConnection,
  resolveTarget,
  type TargetName,
} from "./migrate.ts";
import { registerSrcAlias } from "./node-alias.ts";

/**
 * db.ts の repo 関数一式。
 *
 * 静的 import は `registerSrcAlias` の登録より先に解決されるので、実体の読み込みは各関数の中まで遅らせる（`scripts/node-alias.ts`）。
 */
type Repo = typeof import("@/lib/db");

/** 暗号化と復号の関数一式で、読み込みを遅らせる理由は `Repo` と同じ。 */
type Secrets = typeof import("@/lib/secrets");

/**
 * 適用先と、その鍵の一覧を持つ環境変数の対応。
 * 名前の正は `web/README.md` の表。
 */
const ENCRYPTION_KEYS_VARIABLES = {
  prod: "TOIITO_API_KEY_ENCRYPTION_KEYS_PROD",
  preview: "TOIITO_API_KEY_ENCRYPTION_KEYS_PREVIEW",
} as const satisfies Record<TargetName, string>;

/** 解決した適用先の、DB の直結の接続先と鍵の一覧の値。 */
export type KeysTarget = {
  readonly name: TargetName;
  readonly directUrl: string;
  readonly encryptionKeys: string;
};

/** 暗号化し直した結果の件数。 */
export type ReencryptionResult = {
  /** 暗号化に使う鍵で暗号化し直した件数。 */
  reencrypted: number;

  /** 読んだ後に利用者が API キーを差し替えたか削除したので、書き換えなかった件数。 */
  changedByUser: number;
};

/** 鍵 ID ごとの暗号文の件数と、暗号化に使う鍵以外の鍵 ID の暗号文の件数。 */
export type KeyIdReport = {
  /** 出力する文で、一行に一つの鍵 ID と、最後の行に残りの件数を持つ。 */
  text: string;

  /** 暗号化に使う鍵以外の鍵 ID の暗号文の件数で、0 なら旧い鍵を外してよい。 */
  remaining: number;
};

/**
 * 引数の適用先の名前（`name`）と `env` から、DB の直結の接続先と鍵の一覧の値を決める。
 * 名前が値域の外のとき・接続先の変数が空のとき・鍵の一覧の変数が空のときは throw する。
 *
 * 鍵の一覧の変数が空のまま `TOIITO_API_KEY_ENCRYPTION_KEYS` へ既定すると、手元の鍵で本番の暗号文を読むことになるので、既定しない。
 */
export function resolveKeysTarget(
  name: string | undefined,
  env: Readonly<Record<string, string | undefined>>,
): KeysTarget {
  const { name: target, directUrl } = resolveTarget(name, env);
  const variable = ENCRYPTION_KEYS_VARIABLES[target];
  const encryptionKeys = env[variable];

  if (!encryptionKeys) {
    throw new Error(
      `${variable} が要る。${target} の Vercel に入れた鍵の一覧と同じ値を、実行する間だけ環境変数で渡す（変数の正は web/README.md の表）`,
    );
  }

  return { name: target, directUrl, encryptionKeys };
}

/**
 * 暗号化に使う鍵（`keys.encryptionKey`）と違う鍵 ID を持つ暗号文を、すべて復号して暗号化に使う鍵で暗号化し直す。
 * 一件でも復号できなければ、どの行も書き換えずに throw する。
 *
 * 書き換えの前に全件を復号するので、鍵の一覧に旧い鍵が欠けていても、一部の行だけが書き換わった状態で止まらない。
 */
export async function reencryptApiKeys(
  keys: EncryptionKeyRing,
): Promise<ReencryptionResult> {
  const repo: Repo = await import("@/lib/db");
  const secrets: Secrets = await import("@/lib/secrets");

  const rows = await repo.listEncryptedApiKeys();
  const staleRows = rows.filter(
    (row) => secrets.keyIdOf(row.encrypted_api_key) !== keys.encryptionKey.id,
  );
  const replacements = staleRows.map((row) => ({
    row,
    replacement: secrets.encryptApiKey(
      secrets.decryptApiKey(row.encrypted_api_key, keys),
      keys,
    ),
  }));

  let reencrypted = 0;

  for (const { row, replacement } of replacements) {
    const replaced = await repo.replaceEncryptedApiKey(row, replacement);

    if (replaced) {
      reencrypted += 1;
    }
  }

  return { reencrypted, changedByUser: replacements.length - reencrypted };
}

/**
 * 暗号文を復号せずに鍵 ID ごとに数え、暗号化に使う鍵（`keys.encryptionKey`）以外の鍵 ID の件数と一緒に返す。
 * 暗号文の形式が不正な行があれば throw する。
 */
export async function reportApiKeys(
  keys: EncryptionKeyRing,
): Promise<KeyIdReport> {
  const repo: Repo = await import("@/lib/db");
  const secrets: Secrets = await import("@/lib/secrets");

  const rows = await repo.listEncryptedApiKeys();
  const keyIds = rows.map((row) => secrets.keyIdOf(row.encrypted_api_key));
  const encryptionKeyId = keys.encryptionKey.id;

  const lines = [...new Set(keyIds)].sort().map((keyId) => {
    const count = keyIds.filter((id) => id === keyId).length;
    const role = keyId === encryptionKeyId ? "（暗号化に使う鍵）" : "";

    return `${keyId}${role}: ${count} 件`;
  });
  const remaining = keyIds.filter((keyId) => keyId !== encryptionKeyId).length;

  return {
    text: [
      ...lines,
      `暗号化に使う鍵（${encryptionKeyId}）以外の鍵 ID の暗号文: ${remaining} 件`,
    ].join("\n"),
    remaining,
  };
}

/**
 * CLI の本体。
 *
 * 適用先の接続先を表示してから、`--report` があれば件数を出し、無ければ暗号化し直す。
 * 件数を出したとき、暗号化に使う鍵以外の鍵 ID の暗号文が残っていれば終了コードを 1 にする。
 */
async function main(): Promise<void> {
  const [targetName, ...flags] = process.argv.slice(2);
  const target = resolveKeysTarget(targetName, process.env);

  console.log(`${target.name} の DB: ${describeConnection(target.directUrl)}`);

  // `config.ts` は `DATABASE_URL` をモジュールの評価時に読むので、repo 関数を読み込む前に適用先へ向ける。
  process.env.DATABASE_URL = target.directUrl;
  registerSrcAlias();

  const { readEncryptionKeyRing } = await import("@/lib/secrets");
  const keys = readEncryptionKeyRing({
    TOIITO_API_KEY_ENCRYPTION_KEYS: target.encryptionKeys,
  });

  if (flags.includes("--report")) {
    const report = await reportApiKeys(keys);
    console.log(report.text);
    process.exitCode = report.remaining > 0 ? 1 : 0;
  } else {
    const result = await reencryptApiKeys(keys);
    console.log(
      `暗号化し直した: ${result.reencrypted} 件、利用者が差し替えたので書き換えなかった: ${result.changedByUser} 件`,
    );
  }

  const { disconnect } = await import("@/lib/db");
  await disconnect();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
