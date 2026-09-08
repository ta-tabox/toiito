# web — トイット（Toiito）のアプリ本体

Next.js（App Router）+ TypeScript。
**何を・なぜ作るかはここに書かない**。
正はリポジトリルートの `docs/VISION.md` / `docs/ARCHITECTURE.md` / `docs/HARNESS.md` / `docs/ROADMAP.md`。
ここに置くのは、このディレクトリで手を動かすときに要る手順と設定だけ。

## 起動

パッケージマネージャは pnpm。
node / pnpm の版はリポジトリルートの `mise.toml` で mise が管理する（corepack は使わない）。

```bash
docker compose up -d
```

先にリポジトリルートで Postgres を立てる。
アプリもテストも実 Postgres へ繋ぐので、これが無いと `pnpm dev` も `pnpm check` も動かない（詳細は `docs/HARNESS.md`「ローカル Postgres」）。

```bash
pnpm install
pnpm dev
```

[http://localhost:3000](http://localhost:3000) が入口。

変更したら `pnpm check`（型 → lint → テスト → ビルド）。
**赤のままコミットしない**。

リモート（Claude Code on the web）ではこの節の準備が要らない。
セッション起動時のフックが Postgres も `.env.local` も依存も用意するので、`pnpm dev` から始められる（`docs/HARNESS.md`「リモート」）。

## 環境変数

`.env.local` に置く（git 管理外。雛形は `.env.example`）。

| 変数 | 要否 | 既定 | 何に効くか |
|---|---|---|---|
| `DATABASE_URL` | 必須 | — | アプリからの接続先。本番 Neon ではプーラー経由 |
| `DIRECT_URL` | 必須 | — | Prisma Migrate 用の直結。プーラー越しには Migrate が動かないので分ける |
| `ANTHROPIC_API_KEY` | 実 AI を使うなら必須 | — | Claude API のキー。**サーバー側のみ**で使い、クライアントへ露出させない |
| `BETTER_AUTH_SECRET` | 必須 | — | セッションのトークンと OAuth の state の署名に使う秘密。32 文字以上の乱数 |
| `TOIITO_ALLOWED_EMAILS` | 必須 | — | サインインを許す email のカンマ区切り。空だと起動時に落ちる |
| `BETTER_AUTH_URL` | Google を使うなら必須 | — | アプリの公開 URL。cookie と OAuth の callback を組み立て、信頼する origin もこの値で決まる |
| `GOOGLE_CLIENT_ID` | Google を使うなら必須 | — | Google OAuth のクライアント ID。片方だけ設定すると落ちる |
| `GOOGLE_CLIENT_SECRET` | 同上 | — | 同じクライアントのシークレット |
| `TOIITO_FAKE_LOGIN` | Google を使わないなら必須 | 未設定 | `1` で Google を経ないサインイン（`POST /api/auth/sign-in/fake`）を有効にする。`VERCEL_ENV=production` では設定できない |
| `TOIITO_ANTHROPIC_MODEL` | 任意 | `claude-sonnet-5` | 二体 AI が使うモデルの上書き |
| `TOIITO_ANTHROPIC_MAX_TOKENS` | 任意 | `16000` | 一回の応答に許すトークン数の上書き。thinking のトークンもここから引かれるので、下げすぎると本文が途中で切れる |
| `TOIITO_ANTHROPIC_TIMEOUT_MS` | 任意 | `120000` | 一回の呼び出しを待つ上限（ミリ秒）。超えたら打ち切り・空本文と同じく例外にする。実行環境（Vercel Hobby）が関数を殺す 300 秒より手前に置く |
| `TOIITO_ANTHROPIC_EFFORT_CONCRETE` | 任意 | 未設定（API の既定） | 具体さんの思考の深さ。`low` / `medium` / `high` / `xhigh` / `max`。値域の外は既定へ倒す |
| `TOIITO_ANTHROPIC_EFFORT_ABSTRACT` | 任意 | `medium` | 抽象さんの思考の深さ。値域は同上 |
| `TOIITO_FAKE_AI` | 任意 | 未設定 | `1` でネットワークに出ず決定的な応答を返す。API キー無しで縦一本を通すためのハーネス |
| `TOIITO_TEST_DATABASE_URL` | 任意 | `postgresql://toiito:toiito@localhost:5433/toiito_test` | テストの接続先。CI で差し替える口 |
| `TOIITO_E2E_DATABASE_URL` | 任意 | `postgresql://toiito:toiito@localhost:5433/toiito_e2e` | E2E の接続先。変えてよいのはサーバーの側だけで、データベース名は `toiito_e2e` から動かせない |
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
E2E は worktree をまたいで `toiito_e2e` 一本を共有するので、こちらで変えてよいのはサーバーの側（ホスト・ポート・資格情報）だけである。
データベース名が `toiito_e2e` でない上書きは止まる（`docs/HARNESS.md`「E2E（L4）」）。

`TOIITO_FAKE_AI=1` は AI 呼び出しを伴う動作確認で使う。
実 API を自動テストで叩かない（遅い・非決定的・金がかかる）。

認証は 3 通りの組み合わせがあり、どれも `TOIITO_ALLOWED_EMAILS` と `BETTER_AUTH_SECRET` は要る。
サインインの手段が一つも無い設定は起動時に落ちる。

**手元で Google を使わない**のがいちばん軽い。
`pnpm seed` が入れる二人を許可リストへ置き、Google を経ないサインインを開ける。
ログインの画面に許可リストの email が並ぶので、押せばその人になる。

```
BETTER_AUTH_SECRET=<openssl rand -base64 32 で作った値>
TOIITO_ALLOWED_EMAILS=first@example.com,second@example.com
TOIITO_FAKE_LOGIN=1
```

**手元で Google を使う**なら、Google Cloud で OAuth クライアントを作り、redirect URI に `http://localhost:3000/api/auth/callback/google` を登録する。
`TOIITO_FAKE_LOGIN` は外してよい。

```
BETTER_AUTH_URL=http://localhost:3000
GOOGLE_CLIENT_ID=<クライアント ID>
GOOGLE_CLIENT_SECRET=<クライアントシークレット>
TOIITO_ALLOWED_EMAILS=<自分の Google アカウントの email>
```

**本番と Preview**の値は `docs/DEPLOY.md`「秘密の置き場」と「Preview」が持つ。
`TOIITO_FAKE_LOGIN` は本番へ入れられない（`VERCEL_ENV=production` で起動時に落ちる）。

テストと E2E は設定を自分で渡すので、手で書くのは `.env.local` の一箇所だけである。

`DIRECT_URL_PROD` と `DIRECT_URL_PREVIEW` は、手元から本番と Preview へ migration を流す口（`pnpm migrate:prod` / `pnpm migrate:preview`）。
`DIRECT_URL` を書き換えて使い回さないのは、直前に何を入れたかで流し先が変わるため。
本番へは main への push で `.github/workflows/migrate.yml` が流すので、こちらを叩くのは切り戻しと再実行の場面になる。
Preview には自動経路が無いので、migration を含む PR の画面を見るには毎回叩く（`docs/DEPLOY.md`「Preview」）。

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
詳細は `docs/HARNESS.md`「E2E（L4）」。

## スキーマを変えるとき

スキーマの正は `prisma/schema.prisma`。

```bash
pnpm exec prisma migrate dev --name <変更の名前>
```

check 制約は Prisma スキーマで表現できないので、生成された migration の SQL へ直接書き足す。
生成クライアント（`src/generated/`）は git 管理外で、`pnpm install` の postinstall が作る。
