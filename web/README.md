# web — トイット（Toiito）のアプリ本体

Next.js（App Router）+ TypeScript。
**何を・なぜ作るかはここに書かない**。
正典はリポジトリルートの `VISION.md` / `ARCHITECTURE.md` / `HARNESS.md` / `ROADMAP.md`。
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
| `TOIITO_MODEL` | 任意 | `claude-sonnet-5` | 二体 AI が使うモデルの上書き |
| `TOIITO_FAKE_AI` | 任意 | 未設定 | `1` でネットワークに出ず決定的な応答を返す。API キー無しで縦一本を通すためのハーネス |
| `TOIITO_TEST_DATABASE_URL` | 任意 | `postgresql://toiito:toiito@localhost:5433/toiito_test` | テストの接続先。CI で差し替える口 |

ローカルの二本はどちらも同じ Postgres を指す。

```
DATABASE_URL=postgresql://toiito:toiito@localhost:5433/toiito
DIRECT_URL=postgresql://toiito:toiito@localhost:5433/toiito
```

`TOIITO_TEST_DATABASE_URL` は既定のままでよい（`compose.yaml` が `toiito_test` を作る）。
テストは走るたびにこのデータベースを空にするので、**開発用の接続先を渡さないこと**。
名前が `_test` で終わらなければ止まるようにしてある。

`TOIITO_FAKE_AI=1` は AI 呼び出しを伴う動作確認で使う。
実 API を自動テストで叩かない（遅い・非決定的・金がかかる）。

## スキーマを変えるとき

スキーマの正は `prisma/schema.prisma`。

```bash
pnpm exec prisma migrate dev --name <変更の名前>
```

check 制約は Prisma スキーマで表現できないので、生成された migration の SQL へ直接書き足す。
生成クライアント（`src/generated/`）は git 管理外で、`pnpm install` の postinstall が作る。
