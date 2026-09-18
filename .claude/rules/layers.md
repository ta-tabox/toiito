---
paths:
  - "web/src/**"
  - "web/scripts/**"
  - "web/tests/**"
  - "web/e2e/**"
---

# 置き場と依存の向き（toiito）

`coding.md`「置き場と依存の向き」の規則を、このリポジトリのモジュールに当てた表。
`docs/ARCHITECTURE.md` と `docs/HARNESS.md` は境界の禁止則をここへ委ね、「正は `.claude/rules/layers.md`」の一行で指す。

## 境界を閉じるモジュール

| 境界 | 閉じるモジュール | 他のモジュールが受け取るもの |
|---|---|---|
| DB（Prisma） | `web/src/lib/db.ts` | `types.ts` のドメイン型 |
| 環境変数（DB の接続先） | `web/src/lib/config.ts` | `DATABASE_URL` |
| 環境変数（AI） | `web/src/lib/ai/providers.ts` | `AI_PROVIDER`（解決済みのプロバイダ） |
| 環境変数（認証） | `web/src/lib/auth/index.ts`（写像は `auth/config.ts` の `readAuthConfig`） | 組み立て済みの Better Auth と、ログインの画面に並べるサインインの手段（`SignInMethods`） |
| 環境変数（利用者の API キーを暗号化する鍵） | `web/src/lib/secrets-config.ts`（写像は `secrets.ts` の `readEncryptionKeyRing`） | `EncryptionKeyRing`（`secrets.ts` の `encryptApiKey` と `decryptApiKey` へ渡す） |
| Claude API（HTTP） | `web/src/lib/ai/anthropic.ts` | `ProviderResponse` |
| ペルソナ定義（ファイル） | `web/src/lib/personas.ts` | プロンプトの文字列 |
| 現在のユーザー（セッション） | `web/src/lib/auth/current-user.ts` | `User`（`id` は `OwnerId`） |
| DOM（選択範囲） | `web/src/components/message-body.tsx` | セグメントとセグメント内オフセットの数値 |

## 境界の禁止則

- Better Auth のアダプタへ渡す `authDatabaseClient`（`db.ts` が持つ Prisma のクライアント）を呼ぶのは `lib/auth/index.ts` だけにする
- スキーマの正は `prisma/schema.prisma` 一箇所にし、DDL を別ファイルに書き写さない
- repo 関数はすべて `async` で書く
- 所有者を受け取る repo 関数は、読みでは where に所有者の条件を置き、`create` と `update` の前では `requireOwnedQuestion` か `requireOwnedSession` を呼ぶ
  無い行とアクセス権の無い行は同じ応答（undefined か同じ文面の throw）にする
- `OwnerId` を作るのは `user` 表を SELECT した `db.ts` の `fromUserRow` だけにする
  RSC と Server Action は `requireCurrentUser` から受け取った `id` を repo 関数へ渡す
- `Anchor` を作るのは `anchors.ts` の `parseAnchor` だけにする
  フォームの値・DOM の選択・DB の行から範囲を作るときは `parseAnchor` を通してから、`addMemo` と `excerptParts` へ渡す
- `process.env` を読むのは `lib/config.ts`・`lib/ai/providers.ts`・`lib/auth/index.ts`・`lib/secrets-config.ts` と、別プロセスで走る `scripts/`・`e2e/setup/` だけにする
  写像と既定値は `readAnthropicSettings`・`ANTHROPIC_DEFAULTS`・`readAuthConfig`・`readEncryptionKeyRing` の純関数が持ち、テストは `process.env` を書き換えずに env を模した値を渡す
- アプリに入れるのは実行環境に依らない道具だけにする
  `@vercel/*` の import・ISR のオンデマンド再検証・Edge Config・Cron Jobs を入れたくなったら、実行環境を決め直す合図として一度戻る
- `session.cookieCache` と `session.deferSessionRefresh` は既定（無効）のまま置く
  速度が要るときに先に手を付けるのは `getCurrentUser` の `React.cache()` である
- ログインをまたぐ識別子（匿名セッション・未ログインの下書きの引き継ぎ・自前の「戻り先」cookie）は持たない
  未ログインで何かを書かせたいときは、ログインをまたがない形で解けるかを先に見る
- DB への書き込みは、UI からも `scripts/seed/` からも `db.ts` の repo 関数を通す

## 層と、import してよい相手

置き場は `web/` で始まるもの以外を `web/src` からの相対で書き、一つのファイルが複数の行に当たるときは名指した行を glob の行より優先する。
`web/src` の追跡しているファイルがどれかの行か上の表に当たることは、`web/tests/layers.test.ts` が見る。

| 層 | 置き場 | import してよい相手 | 持つもの |
|---|---|---|---|
| ドメイン型 | `lib/types.ts` | 純粋な計算（型だけ） | 型だけ |
| 純粋な計算 | `lib/*.ts`・`lib/ai/prompt.ts`・`lib/auth/protected-paths.ts` | ドメイン型・純粋な計算 | 取りうる値の定数と判定・関数とテスト |
| 境界 | 上の表・`lib/ai/**`・`lib/auth/**` | 純粋な計算・ドメイン型・境界 | 境界の道具と検証 |
| 一往復の手順 | `lib/turn.ts` | 境界・純粋な計算・ドメイン型 | AI 呼び出しと永続化の順序 |
| 配線 | `app/**`・`web/scripts/seed/index.ts` | クライアント側の部品・手順・境界・純粋な計算 | 受け取り・呼び出し・`revalidatePath` か `redirect` |
| 全リクエストの入口 | `proxy.ts` | `lib/auth/protected-paths.ts` | cookie の有無だけで `/login` へ送るかの判定 |
| クライアント側の部品 | `components/**` | クライアント側の部品・`node:*` を import しない純粋な計算 | DOM の読み書きと描画 |
| ペルソナの定義 | `personas/*.md` | 無し | システムプロンプトの本文（読むのは `lib/personas.ts` だけ） |

## 一つしか無い状態の正

| 状態 | 正 |
|---|---|
| 開いているメモ | URL のクエリ `?memo=<id>` |
| 描いているセッション | URL のクエリ `?s=<id>`（無ければ最新） |
| 開いている覗き見の枠 | `memo-preview.tsx` の store（`useSyncExternalStore` で読む） |
| 選択を読み直す発話 | `message-body.tsx` の `readers`（document へのリスナは 1 本） |

## プロジェクト固有（育てる欄）
- CSS とテストが DOM を指す印は `data-*` 属性で付け、className では指さない
  属性は画面を足すたびに増えるので、いま付いている属性は一覧を持たず `web/src` と `web/e2e` を `data-` で検索して見る
