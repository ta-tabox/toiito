# HARNESS — AI 駆動開発の検証ハーネス

AI（Claude Code / Cowork セッション）が自律的に実装を進めるための自己検証ループの設計。
思想は一つ: **AI が自分の変更の正しさを、人間の目を借りずに機械的に確かめられる状態を保つ**。
検証できない変更は積み上がらない——コンポスターに例えるなら、ハーネスは温度計であり、腐敗と発酵を区別する装置。

## 検証の層構造（下から順に回す）

| 層 | 何を保証するか | 道具 | 速度 |
|----|--------------|------|------|
| L0 型 | 契約の整合（repo 関数シグネチャ等） | `tsc --noEmit` | 秒 |
| L1 静的 | 明白な誤り・作法・書式 | `biome check` + `scripts/lint-comments.mts` | 秒 |
| L2 ユニット | lib 層のロジック（db / claude / personas / anchors） | Vitest（+ ローカル Postgres） | 秒 |
| L3 ビルド | ルーティング・Server Actions の結線 | `next build` | 十秒台 |
| L4 E2E | 縦一本（投入→対話→メモ→逆引き）のブラウザ実挙動 | Playwright（P1） | 分 |
| L5 官能 | 対話の質・「答えを与えない」制約の遵守 | 人間（将来 LLM-judge 補助） | — |

入口は一つ: **`pnpm check`**（L0→L1→L2→L3 を直列実行）。
AI は「変更 → check 緑 → コミット」を心拍として回す。
check が赤のままコミットしない（コミットゲート）。

L1 は lint と書式を Biome 一本で見る（正典: fermentary/playbooks/toolchain.md）。
書式ずれは `pnpm format` で機械的に直す——**手で整形しない**。
warning はゲートを止めない（exit 0）。
止めたい違反は biome.json で error へ上げる。

**コメント規約だけは Biome の外**。
Biome のリンタはコメントを走査対象に持たず、built-in ルールにも GritQL プラグインにもコメント本体へ届く経路が無い。
そこだけを `web/scripts/lint-comments.mts` が受け持ち、`pnpm lint` が Biome の後に走らせる。
見るのは冒頭コメントの有無とスタイル（`/** */`・直後の空行）、および JSDoc の型注釈重複の二点。
これ以外の作法は biome.json 側に置く——同じ規約を二箇所に書くと、いずれ食い違う。
判定ロジックは `tests/lint-comments.test.ts` が正。

規約のうち機械が見ている分の一覧は skill `coding-standards` の `languages/typescript.md`。
**残りは形しか見ていない**——冒頭コメントが責務と境界を語れているか、削除テストに耐えるかは L5 の領分。

## ローカル Postgres

L2 以上は実 Postgres へ繋ぐ。
インメモリや SQLite で代替しない——DB の enum・外部キー・check 制約は、本物に当てないと表明した意味を持たない。

```bash
docker compose up -d
```

リポジトリルートの `compose.yaml` が Postgres 17（本番 Neon と同じメジャー）を `localhost:5433` に立てる。
開発用 `toiito` とテスト用 `toiito_test` の二つを初回起動時に作る。
止めるのは `docker compose down`、中身ごと作り直すのは `docker compose down -v`。

接続は **二本引く**。
`DATABASE_URL` はアプリ経路（本番 Neon ではプーラー経由）、`DIRECT_URL` は Prisma Migrate 用の直結——Migrate はプーラー越しには動かないので、ローカルの時点から分けておく。
`web/.env.local` に書く。

```
DATABASE_URL=postgresql://toiito:toiito@localhost:5433/toiito
DIRECT_URL=postgresql://toiito:toiito@localhost:5433/toiito
```

スキーマを変えたら `pnpm exec prisma migrate dev --name <変更の名前>`。
check 制約は Prisma スキーマで表現できないので、生成された migration の SQL へ直接書き足す。

テストは走るたびにテスト用 DB へ migration を積み直して（`migrate deploy`）全テーブルを空にする。
`prisma migrate reset` は使わない——Prisma 7 はこれを破壊的操作として検知し、AI エージェントからの実行に人間の同意を毎回要求するので、無人で回る check のゲートには置けない。

## AI フェイクモード（ハーネスの要）

`TOIITO_FAKE_AI=1` で `claude.ts` がネットワークに出ず決定的な応答を返す。

- 目的: API キー無し・ネットワーク遮断環境（Cowork サンドボックス含む）でも縦一本が end-to-end で動く。
  E2E（L4）もこのモードで回す
- 応答はペルソナ ID と直近の人間発話を含む決定的テキスト → アサーションで「どの体が・何を受けて」応答したか検証可能
- 実 API の疎通は L5 側（人間が実キーで常用する）で担保。
  ユニットテストで実 API を叩かない（遅い・非決定的・金がかかる）

## テスト可能性の設計制約（コードの書き方に課すルール)

1. **ロジックは lib 層へ寄せる**。
   UI コンポーネントや Server Actions にロジックを埋めない。
   actions.ts は「lib を呼ぶ配線」に留める
2. **環境依存は env 変数一点で切り替える**（DB 接続先、AI フェイク、モデル名）。
   テストは env を差し替えるだけで隔離できる
3. **messages は immutable** 等の不変条件は、スキーマの check 制約とテストの両方で表明する（片方に頼らない）
4. 新機能は「lib 関数 + テスト」→「UI 配線」の順で作る

## 実行環境

ハーネスが保証するのは一点だけ——**どこで走らせても `pnpm check` が同じ意味を持つ**こと。
それ以外の非対称は仕様として引き受ける。

check の前提は Postgres が起動していること（`docker compose up -d`）。
「外部プロセス不要」は 2026-08-15 に捨てた前提で、代わりに開発・テスト・本番の方言が揃った。

### リモート（Claude Code on the web）

docker が無いので `docker compose up -d` は使えない。
代わりに `.claude/hooks/session-start.sh` がセッション起動時に走り、イメージ同梱の Postgres を `compose.yaml` と同じ `localhost:5433` に立て、node と pnpm を `mise.toml` の版で置き、`web/.env.local` を書いて `pnpm install` と `migrate deploy` まで済ませる。
接続文字列も `pnpm check` の意味もローカルと同じで、人手の準備は要らない。
API キーが無いので `.env.local` には `TOIITO_FAKE_AI=1` が入る（環境変数で `ANTHROPIC_API_KEY` が渡っていればフェイクは入れない）。

引き受ける非対称は二つ。
どちらも外向きの通信が許可制で、塞ぐ手段がこの環境に無い:

- Postgres が 17 でなく 16（apt.postgresql.org へ出られない）
- 版の管理が mise でなく直置き（mise.run へ出られない）。
  版の正は `mise.toml` のままで、フックはそれを読む側

## フェーズ

- **P0（今回）**: Vitest + フェイクモード + lib 層テスト + `pnpm check`
- **P1**: Playwright E2E（フェイクモードで縦一本）、シードスクリプト（開発用の問い・対話・メモ一式を投入）。
  メモ機能実装と同時が効率的
- **P2**: ペルソナ逸脱検査 — 「答えを与えない」制約を LLM-as-judge でサンプリング検査。
  L5 の一部自動化（完全自動化はしない。官能は人間の領分）
- **CI**: リモート環境構築タスクと同時（GitHub Actions で check を回すだけ。先回りして作らない）

## 意図的にやらないこと

- カバレッジ計測・閾値（個人プロジェクトで数字を KPI 化しない。VISION と同じ理屈）
- コンポーネント単体テスト（jsdom）。
  UI の検証は L3 + L4 に寄せる
- 実 Claude API を叩く自動テスト
