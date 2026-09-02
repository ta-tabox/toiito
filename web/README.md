# web — トイット（Toiito）のアプリ本体

Next.js（App Router）+ TypeScript。
**何を・なぜ作るかはここに書かない**。
正はリポジトリルートの `VISION.md` / `ARCHITECTURE.md` / `HARNESS.md` / `ROADMAP.md`。
ここに置くのは、このディレクトリで手を動かすときに要る手順と設定だけ。

## 起動

パッケージマネージャは pnpm。
node / pnpm の版はリポジトリルートの `mise.toml` で mise が管理する（corepack は使わない）。

```bash
docker compose up -d
```

先にリポジトリルートで Postgres を立てる。
アプリもテストも実 Postgres へ繋ぐので、これが無いと `pnpm dev` も `pnpm check` も動かない（詳細は `HARNESS.md`「ローカル Postgres」）。

```bash
pnpm install
pnpm dev
```

[http://localhost:3000](http://localhost:3000) が入口。

変更したら `pnpm check`（型 → lint → テスト → ビルド）。
**赤のままコミットしない**。

リモート（Claude Code on the web）ではこの節の準備が要らない。
セッション起動時のフックが Postgres も `.env.local` も依存も用意するので、`pnpm dev` から始められる（`HARNESS.md`「リモート」）。

## 環境変数

`.env.local` に置く（git 管理外。雛形は `.env.example`）。

| 変数 | 要否 | 既定 | 何に効くか |
|---|---|---|---|
| `DATABASE_URL` | 必須 | — | アプリからの接続先。本番 Neon ではプーラー経由 |
| `DIRECT_URL` | 必須 | — | Prisma Migrate 用の直結。プーラー越しには Migrate が動かないので分ける |
| `ANTHROPIC_API_KEY` | 実 AI を使うなら必須 | — | Claude API のキー。**サーバー側のみ**で使い、クライアントへ露出させない |
| `TOIITO_BASIC_AUTH_USER` | 本番では必須 | — | Basic 認証の利用者名。development では未設定なら認証を掛けない |
| `TOIITO_BASIC_AUTH_PASSWORD` | 本番では必須 | — | 同じ Basic 認証のパスワード。片方だけ設定すると起動時に落ちる |
| `TOIITO_ANTHROPIC_MODEL` | 任意 | `claude-sonnet-5` | 二体 AI が使うモデルの上書き |
| `TOIITO_ANTHROPIC_MAX_TOKENS` | 任意 | `16000` | 一回の応答に許すトークン数の上書き。thinking のトークンもここから引かれるので、下げすぎると本文が途中で切れる |
| `TOIITO_ANTHROPIC_TIMEOUT_MS` | 任意 | `120000` | 一回の呼び出しを待つ上限（ミリ秒）。超えたら打ち切り・空本文と同じく例外にする。実行環境（Vercel Hobby）が関数を殺す 300 秒より手前に置く |
| `TOIITO_ANTHROPIC_EFFORT_CONCRETE` | 任意 | 未設定（API の既定） | 具体さんの思考の深さ。`low` / `medium` / `high` / `xhigh` / `max`。値域の外は既定へ倒す |
| `TOIITO_ANTHROPIC_EFFORT_ABSTRACT` | 任意 | `medium` | 抽象さんの思考の深さ。値域は同上 |
| `TOIITO_FAKE_AI` | 任意 | 未設定 | `1` でネットワークに出ず決定的な応答を返す。API キー無しで縦一本を通すためのハーネス |
| `TOIITO_FAKE_USER_EMAIL` | 本物のログインが入るまで必須 | — | 現在の利用者として扱う `user.email`。未設定だと画面が落ちる。**本番では設定すると起動時に落ちる**（認証を丸ごと外す口なので） |
| `TOIITO_TEST_DATABASE_URL` | 任意 | `postgresql://toiito:toiito@localhost:5433/toiito_test` | テストの接続先。CI で差し替える口 |
| `TOIITO_E2E_DATABASE_URL` | 任意 | `postgresql://toiito:toiito@localhost:5433/toiito_e2e` | E2E の接続先。テストと同じ DB を向けると互いの行を踏むので分ける |
| `DIRECT_URL_PROD` | `pnpm migrate:prod` を叩くなら必須 | — | 本番 Neon の直結。手元から migration を流す先 |
| `DIRECT_URL_PREVIEW` | `pnpm migrate:preview` を叩くなら必須 | — | Neon の `preview` ブランチの直結。同上 |

ローカルの二本はどちらも同じ Postgres を指す。

```
DATABASE_URL=postgresql://toiito:toiito@localhost:5433/toiito
DIRECT_URL=postgresql://toiito:toiito@localhost:5433/toiito
```

`TOIITO_TEST_DATABASE_URL` は既定のままでよい（`compose.yaml` が `toiito_test` を作る）。
テストは走るたびにこのデータベースを空にするので、**開発用の接続先を渡さないこと**。
名前が `_test` で終わらなければ止まるようにしてある。

`TOIITO_E2E_DATABASE_URL` も既定のままでよい（走るたびに作り直す側が、無ければ作る）。
こちらは名前が `_e2e` で終わらなければ止まる。

`TOIITO_FAKE_AI=1` は AI 呼び出しを伴う動作確認で使う。
実 API を自動テストで叩かない（遅い・非決定的・金がかかる）。

`TOIITO_FAKE_USER_EMAIL` は、認証が入るまでの「現在の利用者」を指す（`docs/adr/0019-auth-better-auth.md` 決定 7）。
`pnpm seed` が入れる一人目の email をそのまま書けばよい（`scripts/seed/users.ts`）。
シードを流す前や、指した email の利用者が居ない DB では落ちる。
テストと E2E は設定を自分で渡すので、書く先は `.env.local` だけである。

```
TOIITO_FAKE_USER_EMAIL=first@example.com
```

`DIRECT_URL_PROD` と `DIRECT_URL_PREVIEW` は、手元から本番と Preview へ migration を流す口（`pnpm migrate:prod` / `pnpm migrate:preview`）。
`DIRECT_URL` を書き換えて使い回さないのは、直前に何を入れたかで流し先が変わるため。
本番へは main への push で `.github/workflows/migrate.yml` が流すので、こちらを叩くのは切り戻しと再実行の場面になる。
Preview には自動経路が無いので、migration を含む PR の画面を見るには毎回叩く（`DEPLOY.md`「Preview」）。

## E2E を走らせる

ブラウザの実体は `pnpm install` では入らないので、初回だけ取ってくる。

```bash
pnpm exec playwright install chromium
```

```bash
pnpm e2e
```

`pnpm check` は E2E を含まない（心拍を遅くしない）。
通しで確かめるのは `pnpm check:full`（check → e2e）。
webServer は口（3100）・データベース（`toiito_e2e`）・ビルド出力先（`.next-e2e`）を開発用から分けるので、`pnpm dev` は止めなくてよい。
詳細は `HARNESS.md`「E2E（L4）」。

## スキーマを変えるとき

スキーマの正は `prisma/schema.prisma`。

```bash
pnpm exec prisma migrate dev --name <変更の名前>
```

check 制約は Prisma スキーマで表現できないので、生成された migration の SQL へ直接書き足す。
生成クライアント（`src/generated/`）は git 管理外で、`pnpm install` の postinstall が作る。
