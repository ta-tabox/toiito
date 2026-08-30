# HARNESS — AI 駆動開発の検証ハーネス

AI（Claude Code / Cowork セッション）が自律的に実装を進めるための自己検証ループの設計。
思想は一つ: **AI が自分の変更の正しさを、人間の目を借りずに機械的に確かめられる状態を保つ**。
検証できない変更は積み上がらない。
発酵槽に例えるなら、ハーネスは温度計であり、腐敗と発酵を区別する装置。

## 検証の層構造（下から順に回す）

| 層 | 何を保証するか | 道具 | 速度 |
|----|--------------|------|------|
| L0 型 | 契約の整合（repo 関数シグネチャ等） | `tsc --noEmit` | 秒 |
| L1 静的 | 明白な誤り・作法・書式 | `biome check` + `scripts/lint-comments.ts` | 秒 |
| L2 ユニット | lib 層のロジック（db / claude / personas / anchors） | Vitest（+ ローカル Postgres） | 秒 |
| L3 ビルド | ルーティング・Server Actions の結線 | `next build` | 十秒台 |
| L4 E2E | 縦一本（投入→対話→メモ→逆引き）のブラウザ実挙動 | Playwright（`pnpm e2e`） | 分 |
| L5 官能 | 対話の質・「答えを与えない」制約の遵守 | 人間（将来 LLM-judge 補助） | — |

入口は一つ: **`pnpm check`**（L0→L1→L2→L3 を直列実行）。
AI は「変更 → check 緑 → コミット」を心拍として回す。
check が赤のままコミットしない（コミットゲート）。

コミットゲートは規律なので、破っても機械は止めない。
止める力は main の ruleset に置く（GitHub の Settings → Rules → Rulesets、名前は `main: via PR + check green`）。
設定は GitHub 側の状態で diff に残らないので、何をどういう理由で有効にしたかの記録はここが正。

- **Require a pull request before merging** — 有効、承認は 0 件。
  main への直 push を塞ぐ。
  `NEXT.md` の申し送り更新のような一行の変更も PR を通る（先例: cd10a6f は main へ直接入っている）。
  例外は下の bypass の一点だけで、通常の経路には作らない。
  承認を 1 件以上にすると GitHub は自分の PR を自分で承認させないので、全ての PR が bypass 頼みになる
- **Require status checks to pass before merging** — 有効。
  必須は `check` 一本（`.github/workflows/check.yml` の job 名）。
  `claude` 系の job は当面必須にしない
- **Require branches to be up to date before merging** — 有効。
  main の差分を取り込んだ状態で CI を通さないと、緑の PR がマージ後に初めて壊れる組み合わせを取り逃がす。
  main が進むたび PR 側の取り込みが要るが、Update branch 一つで済むので手間として引き受ける
- **Bypass list** — Repository admin を Always で入れる。
  CI 自体が壊れて緑にできないときに ruleset を一時的に外して回らずに済むよう、管理者（人間）の逃げ道を残す。
  管理者は赤い PR のマージも main への直 push も通るので、そこだけは機械の拒否でなく規律に戻る。
  既定の For pull requests only はマージだけを抜けさせて直 push は塞いだままなので、逃げ道としては足りない

ruleset が enforce されるのは public であることが前提。
Free プランの private では保存はできても止まらない（GitHub Pro 以上なら private でも効く）。
非公開へ戻す判断をするなら、このゲートも同時に失われる。

claude-code-action は、走っているワークフローファイルが default branch のものと内容一致しないと本体を実行せず自己スキップする。
出るのは `Workflow validation failed. The workflow file must exist and have identical content to the version on the repository's default branch.` の一行だけ。
スキップは job の失敗でなく成功として畳まれるので、**そのファイル自身を変える PR では、その job の緑が意味を持たない**。
`claude-code-review.yml` を触った PR には `claude-review` の緑が十数秒で付き、レビューは一行も走っていない（実測 2026-08-23・PR #77）。
判定するのは走っている当のファイルだけなので、`claude.yml` だけを触った PR で `claude-review` を疑う必要は無い（`claude.yml` 側の症状は `@claude` を呼んだときの `claude` job に出るはずだが、そちらは測っていない）。
効きの確認はマージ後に main で行う。

L1 は lint と書式を Biome 一本で見る。
書式ずれは `pnpm format` で機械的に直す。
**手で整形しない**。
warning はゲートを止めない（exit 0）。
止めたい違反は biome.json で error へ上げる。

**コメント規約だけは Biome の外**。
Biome のリンタはコメントを走査対象に持たず、built-in ルールにも GritQL プラグインにもコメント本体へ届く経路が無い。
そこだけを `web/scripts/lint-comments.ts` が受け持ち、`pnpm lint` が Biome の後に走らせる。
見るのは冒頭コメントの有無とスタイル（`/** */`・直後の空行）、および JSDoc の型注釈重複の二点。
同じ規約を二箇所に書くといずれ食い違うので、これ以外の作法は biome.json 側に置く。
判定ロジックは `tests/lint-comments.test.ts` が正。

規約のうち機械が見ている分の一覧は skill `coding-standards` の `languages/typescript.md`。
**残りは形しか見ていない**。
冒頭コメントが責務と境界を語れているか、削除テストに耐えるかは L5 の領分。

## ローカル Postgres

L2 以上は実 Postgres へ繋ぐ。
DB の enum・外部キー・check 制約は本物に当てないと表明した意味を持たないので、インメモリや SQLite で代替しない。

```bash
docker compose up -d
```

リポジトリルートの `compose.yaml` が Postgres 18（本番 Neon と同じメジャー）を `localhost:5433` に立てる。
開発用 `toiito` とテスト用 `toiito_test` の二つを初回起動時に作る。
止めるのは `docker compose down`、中身ごと作り直すのは `docker compose down -v`。

接続は **二本引く**。
`DATABASE_URL` はアプリ経路（本番 Neon ではプーラー経由）、`DIRECT_URL` は Prisma Migrate 用の直結。
Migrate はプーラー越しには動かないので、ローカルの時点から分けておく。
`web/.env.local` に書く。

```
DATABASE_URL=postgresql://toiito:toiito@localhost:5433/toiito
DIRECT_URL=postgresql://toiito:toiito@localhost:5433/toiito
```

スキーマを変えたら `pnpm exec prisma migrate dev --name <変更の名前>`。
check 制約は Prisma スキーマで表現できないので、生成された migration の SQL へ直接書き足す。

テストの隔離はケース単位。
テスト用 DB へ一走の初めに migration を積み（`migrate deploy`）、ケースごとに全テーブルを空にする（`web/tests/setup/truncate.ts`）。
空にするだけでは同じ DB を同時に踏む相手を防げないので、テストファイルは直列に走らせる（`fileParallelism: false`）。
裏返しに、同時アクセスの競合はこのハーネスでは再現しない。
`prisma migrate reset` は使わない。
Prisma 7 はこれを破壊的操作として検知し、AI エージェントからの実行に人間の同意を毎回要求するので、無人で回る check のゲートには置けない。

## AI フェイクモード（ハーネスの要）

`TOIITO_FAKE_AI=1` で `claude.ts` がネットワークに出ず決定的な応答を返す。

- 目的: API キー無し・ネットワーク遮断環境（Cowork サンドボックス含む）でも縦一本が end-to-end で動く。
  E2E（L4）もこのモードで回す
- 応答はペルソナ ID と直近の人間発話を含む決定的テキスト → アサーションで「どの体が・何を受けて」応答したか検証可能
- 実 API の疎通は L5 側（人間が実キーで常用する）で担保。
  ユニットテストで実 API を叩かない（遅い・非決定的・金がかかる）

## E2E（L4）

ブラウザ実挙動は Playwright で見る。
入口は `pnpm e2e`。
`pnpm check` は L0〜L3 のままで、E2E を含めない（心拍を遅くしない）。
下から通しで確かめたいときは `pnpm check:full`（check → e2e の順）。

ブラウザの実体はリポジトリにも node_modules にも入らないので、初回だけ取ってくる。

```bash
pnpm exec playwright install chromium
```

設定は `web/playwright.config.ts`、spec は `web/e2e/`。
webServer が `next dev` を `TOIITO_FAKE_AI=1` で起こすので、API キーは要らない。

開発サーバーからは三重に離してあり、`pnpm dev` を止めずに走らせられる。
口が 3100、データベースが `toiito_e2e`、ビルド出力先が `.next-e2e`。
出力先まで分けるのは、`next dev` の二重起動検知が `.next/dev/lock` 一つを見ており、口を分けただけでは 3000 で動いている開発サーバーと衝突するため。
差し替えの口は `TOIITO_DIST_DIR` で、受けるのは `next.config.ts`。

接続先は E2E 専用の `toiito_e2e`。
走るたびにデータベースごと落として作り直し、migration を積み、`pnpm seed` と同じシードを入れる（`web/e2e/setup/reset-database.ts`）。
作るのも作り直す側なので、`compose.yaml` の initdb はこのデータベースを知らない。
vitest の `toiito_test` とは分ける。
どちらも走る前に中身を作り直すので、同じ DB を向けると互いの行を踏む。
名前が `_e2e` で終わらなければ作り直しは止まる。
上書きの口は `TOIITO_E2E_DATABASE_URL`。

作り直しは globalSetup でなく webServer の command に置く。
Playwright は webServer をプラグインとして globalSetup より先に立ち上げるので、逆にすると dev サーバーが接続を張った後で足元の DB を落とすことになる。

入っているのは 12 シナリオ。

| spec | 見るもの |
|---|---|
| `dialogue.spec.ts` | 問い投入 → 発話 → 二体が ai_a → ai_b の順に応答 |
| `memo.spec.ts` | 発話の選択 → メモ作成 → アンダーライン出現 |
| 同上 | メモが `/memos` に並び、拡大表示から出所の発話へ着地 |
| 同上 | 下線を押すと、その語のメモが一覧で開く |
| 同上 | 着地した発話に印が付く |
| 同上 | 再訪したあとでも、メモが当時の発話へ着地する |
| 同上 | 再訪するとセッションの切り替え口が出て、過去を読み返せる |
| `basic-auth.spec.ts` | 資格情報が無ければ 401 で止まる |
| 同上 | 401 が `WWW-Authenticate` を添える |
| 同上 | パスワードが違えば 401 で止まる |
| 同上 | 資格情報が合えば通り、その先はアプリが応える |
| 同上 | ブラウザが資格情報を持てば、問いの一覧まで開く |

`memo.spec.ts` の 2 本は #57（再訪と過去セッションの読み方）で足した。
逆引きの着地が再訪を挟んでも切れないことを見る。

`basic-auth.spec.ts` の 5 本は #102（本番の URL が制限の外にある）で足した。
**サーバーを二本立てて分ける**——既定の一本は資格情報を持たないので制限が掛からず、上の 7 本はそれまでどおり走る。
資格情報を持つもう一本（口は 3101、出力先は `.next-e2e-auth`）だけを `basic-auth.spec.ts` が叩く。
project を分けて `baseURL` を持たせているので、spec 側は行き先を意識しない。

叩くのは存在しない経路（`/no-such-page`）にしてある。
データベースを引かずに済むので他の spec の作り直しと競走せず、アプリのルートでない場所が 401 になること自体が「制限が routing より前に掛かっている」証拠にもなる。

**この層は Vercel のランタイム差を再現しない**。
`next dev` も `next start` も Node で走るので、Edge でだけ環境変数が読めない類の失敗はここに出ない。
本番が閉じている確認は `DEPLOY.md`「アクセス制限」の curl が持つ。

選択は Range を組んで document へ mouseup を投げる形で作る。
Playwright のドラッグでは文字の途中で始まる範囲を安定して作れず、選択を拾う側は document の mouseup を見ている。

本文の下線は role で指す。
選択した直後だけ、同じ文字列が本文とメモフォームの引用の二箇所に出るので、文字で指すとリンクでない側を掴む。

## テスト可能性の設計制約（コードの書き方に課すルール)

1. **ロジックは lib 層へ寄せる**。
   UI コンポーネントや Server Actions にロジックを埋めない。
   actions.ts は「lib を呼ぶ配線」に留める
2. **env を読むのは `web/src/lib/config.ts` と `web/src/proxy.ts` だけ**（前者が DB 接続先・AI フェイク・モデル名・トークン上限・思考の深さ、後者が Basic 認証）。
   既定値もそこで決め、他のモジュールは解決済みの値を参照する。
   呼び出しごとに変わりうる値は引数で受け取る。
   env の読み方そのものは、env を模した object を渡す純関数として検査する（`readAiSettings` / `readBasicAuthCredentials`）。
   テストは `process.env` を書き換えない。
   別プロセスで起動する `web/scripts/` と `web/e2e/setup/` は、env が入口なのでこの限りでない。
   プロセス自身の挙動を切り替える `TZ` も設定ではないので同じく外れる
3. **messages は immutable** 等の不変条件は、スキーマの check 制約とテストの両方で表明する（片方に頼らない）
4. 新機能は「lib 関数 + テスト」→「UI 配線」の順で作る

## 実行環境

ハーネスが保証するのは一点だけ。
**どこで走らせても `pnpm check` が同じ意味を持つ**こと。
それ以外の非対称は仕様として引き受ける。

check の前提は Postgres が起動していること（`docker compose up -d`）。
「外部プロセス不要」は 2026-08-15 に捨てた前提で、代わりに開発・テスト・本番の方言が揃った。

### リモート（Claude Code on the web）

docker が無いので `docker compose up -d` は使えない。
代わりに `.claude/hooks/session-start.sh` がセッション起動時に走り、イメージ同梱の Postgres を `compose.yaml` と同じ `localhost:5433` に立て、node と pnpm を `mise.toml` の版で置き、`web/.env.local` を書いて `pnpm install` と `migrate deploy` まで済ませる。
接続文字列も `pnpm check` の意味もローカルと同じで、人手の準備は要らない。
API キーが無いので `.env.local` には `TOIITO_FAKE_AI=1` が入る（環境変数で `ANTHROPIC_API_KEY` が渡っていればフェイクは入れない）。

引き受ける非対称は三つ。
最初の二つは外向きの通信が許可制で、塞ぐ手段がこの環境に無いことから来る:

- Postgres が 18 でなく 16（apt.postgresql.org へ出られない）
- 版の管理が mise でなく直置き（mise.run へ出られない）。
  版の正は `mise.toml` のままで、フックはそれを読む側
- L4 の実走は手元（macOS）が担う。
  三つ目だけは通信の話ではない——ブラウザは `/opt/pw-browsers` に同梱されており、2026-08-23 のセッションで E2E 7 本がリモートで緑になっている。
  ただし同梱の `chromium-1194` と `@playwright/test` 1.62.1 が要求する版（1234）がずれており、`executablePath` を差さないと起動しない。
  **その設定は常設しない**（下の表の最終行）ので、リモートで書けるのは設定と spec までという段取りは変わらない

#### 設定の置き場

リモートの準備には置き場が三つある。
リポジトリの `.claude/hooks/session-start.sh`、クラウド環境の環境変数欄、同じ画面のセットアップスクリプト欄。
振り分けの規則は一行:

> **リポジトリの内容から復元できるものはフック、利用者や環境に固有のものはクラウド設定。**

前者を設定画面へ持つと、版を上げてもリポジトリだけが動いて設定が置いていかれる。
後者をリポジトリへ持つと、fork した他人のコンテナにこちらの固有値が焼かれる。

| 置くもの | 置き場 | 理由 |
|---|---|---|
| node / pnpm の版 | フック | 正は `mise.toml`。上げれば同じコミットでフックが追随する |
| Postgres の起動・ロール・DB | フック | `compose.yaml` と `docker/initdb/` を復元しているだけ |
| `web/.env.local` の接続文字列 | フック | 値が上の二つから決まる |
| `GIT_AUTHOR_NAME` / `GIT_AUTHOR_EMAIL` | クラウド環境変数 | 利用者に固有。リポジトリへ焼くと、他人が fork で立てたセッションのコミットが持ち主名義で積まれる |
| `GIT_COMMITTER_*` | どこにも置かない | コンテナの global config が既に Claude 名義で、署名鍵もそこに紐づいている。上書きすると Unverified になる |
| `ANTHROPIC_API_KEY` | どこにも置かない | 環境変数欄は「この環境を使用するすべてのユーザーに表示される」ので秘密を置けない。リモートはフェイクモードで走る |
| セットアップスクリプト欄 | 空のまま | 準備の中身はすべてリポジトリから復元できるので、フック一本に集約する |
| Playwright の `executablePath` | どこにも置かない | 同梱ブラウザの版はイメージ側の都合で動く。リポジトリへ焼けば手元と CI が巻き添えになり、環境変数へ置けば版が動いた日に黙って古いパスを差す。リモートで実走させる回だけ `playwright.config.ts` へ書き捨てる（`channel` は `executablePath` と併記できないので落とす） |

`GIT_AUTHOR_*` が環境変数で来ない環境では、フックが `exit 1` で止まる。
黙って Claude 名義のコミットが積まれるより、セッションが立たない方が気づけるため（`CLAUDE.md`「git」）。

環境を新しく作るときの順序は、環境変数を入れる → セッションを立てて `env | grep GIT_AUTHOR` で届くのを見る → 作業を始める。

## フェーズ

- **P0（今回）**: Vitest + フェイクモード + lib 層テスト + `pnpm check`
- **P1**: 済み。
  シードスクリプト（`pnpm seed`）、Playwright の足場（webServer・専用 DB・`pnpm e2e` / `pnpm check:full`）、7 シナリオが揃っている
- **P2**: ペルソナ逸脱検査 — 「答えを与えない」制約を LLM-as-judge でサンプリング検査。
  L5 の一部自動化（完全自動化はしない。官能は人間の領分）
- **CI**: リモート環境構築タスクと同時（GitHub Actions で check を回すだけ。先回りして作らない）

## 意図的にやらないこと

- カバレッジ計測・閾値（個人プロジェクトで数字を KPI 化しない。VISION と同じ理屈）
- コンポーネント単体テスト（jsdom）。
  UI の検証は L3 + L4 に寄せる
- 実 Claude API を叩く自動テスト
