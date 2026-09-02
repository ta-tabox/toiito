# DEPLOY — 本番（Vercel + Neon）

本番へ出す手順。
秘密の置き場・初回のセットアップ・デプロイと切り戻しを持つ。

何をもって「動いた」と言うかは `HARNESS.md`、なぜこの構成なのかは `docs/adr/` が持つ。
ここは現況の手順だけに閉じる。

アプリは Vercel（Hobby）、DB は Neon の無料プラン（選定の経緯は `docs/adr/0002-production-runtime.md`）。
Vercel の Root Directory は `web/`。
main へ入れば Vercel が本番を差し替え、同じ push で `.github/workflows/migrate.yml` が migration を流す。
手で叩くものは無い。

## 秘密の置き場

置き場は二つで、値を持つのは人間だけ。
リポジトリにも `.env*` にも本番の値を書かない。

| 変数 | 置き場 | 値 |
|---|---|---|
| `DATABASE_URL` | Vercel の Environment Variables（Production） | Neon のプーラー経由（ホスト名に `-pooler` が付く方） |
| `DIRECT_URL` | 同上 | Neon の直結 |
| `ANTHROPIC_API_KEY` | 同上 | Claude API のキー |
| `TOIITO_BASIC_AUTH_USER` | 同上 | Basic 認証の利用者名（任意の文字列） |
| `TOIITO_BASIC_AUTH_PASSWORD` | 同上 | Basic 認証のパスワード |
| `PRODUCTION_DIRECT_URL` | GitHub の Settings → Secrets and variables → Actions → **Repository secrets** | `DIRECT_URL` と同じ値。migration を流す workflow だけが読む |

`pg` v9 で `sslmode=require` が libpq の意味へ変わって証明書を検証しなくなるので、**接続の 3 本は `sslmode=verify-full` で終える**。
Neon は直結・プーラーのどちらのホストでもこの綴りを通す（2026-08-29 に `pg` 8.23.0 で実測）。
ADR を立てていない理由は `docs/adr/README.md`「ADR にしないもの」。

ローカルと CI の接続文字列はこの綴りを持たない（`localhost` へ TLS を張っていないので関係が無い）。

`TOIITO_ANTHROPIC_MODEL` は任意（既定 `claude-sonnet-5`）。
`TOIITO_FAKE_AI` は**本番に入れない**。
入れると本番が実 API を叩かず、決定的なダミー応答を返す。
`TOIITO_FAKE_USER_EMAIL` も**本番に入れない**。
こちらは注意ではなく、入っているとモジュールの評価時に投げる（`docs/adr/0019-auth-better-auth.md` 決定 7）。

**#68（ログイン（Google OAuth）とリソースの所有権）が入るまで、本番は動かない。**
所有者を先にデータ層へ入れた回（`docs/adr/0024-ownership-before-auth.md` 決定 5）から、現在の利用者を決める手段が本番に無い。
同じ回の migration が持ち主のいない既存の問いを消しているので、動いていたとしても中身は空である。
引き受けた条件と、止められない事情ができたときの倒し先は 0024 の決定 5。

**5 本とも Production に入れてから最初のビルドを回す**。
`postinstall` の `prisma generate` は `prisma.config.ts` 経由で `DIRECT_URL` を即時解決するので、無いとインストール段階で exit 1 になる。
要るのは解決できることだけで、接続は要らない（`prisma generate` は DB へ繋がない）。

## 初回のセットアップ

1. **Neon 側で自分の組織を切り**、その下に本番プロジェクトを作って接続文字列を 2 本控える。
   Vercel Marketplace の Neon 統合は使わない（`docs/adr/0012-neon-outside-vercel-marketplace.md`）。
   Marketplace 経由で作ると Neon プロジェクトが Vercel 所有の組織の配下に入り、そこから自分のアカウントへ移すセルフサービスの経路が無い。
   **Postgres は 18 を選ぶ**（ローカルと CI も 18。`docs/adr/0009-postgres-18.md`）。
   Neon はメジャーの in-place upgrade を持たず、後から変えるにはプロジェクトごと作り直すことになる。
   Region は **AWS US East 1 (N. Virginia)** で、Vercel の関数リージョンの既定（`iad1`）と揃える。
   揃っていないと DB の往復が毎回大陸をまたぐ。
   接続文字列 2 本の違いはホスト名の `-pooler` だけ
2. Vercel でリポジトリを import する。
   import 画面で環境変数を入れられるので、上の 5 本をそこで入れる。
   入れずに import すると最初のビルドが `prisma generate` で落ちる（落ちても、入れてから Redeploy すれば済む）
3. Project Settings → Build and Deployment → Root Directory に `web/` を入れる
4. Project Settings → Functions → Node.js Version を 24 にする（版の正は `mise.toml`）
5. Project Settings → Deployment Protection → Vercel Authentication を有効にする（**Standard Protection**。Hobby で選べるのはこれだけ）
6. GitHub の Settings → Secrets and variables → Actions → **Repository secrets** に `PRODUCTION_DIRECT_URL` を入れる。
   同じ画面にある Environment secrets ではない（下記）

Install Command は `web/vercel.json` が持つので、ダッシュボードでは触らない。

**secret は Repository secrets へ入れる**。
Environment secrets は `environment:` を宣言した job にしか渡らず、`.github/workflows/migrate.yml` はそれを宣言していない。
そちらへ入れると `secrets.PRODUCTION_DIRECT_URL` が空文字になり、設定したのに効かない状態になる。

**secret は migration の workflow が main へ入る前に入れる**。
`migrate.yml` は main への push で走るので、secret が無いまま入れると空文字が渡って最初の job が赤くなる。

**import は main へマージした後に回す**。
Vercel の production ビルドが見るのは main なので、`web/vercel.json` の無い main を先に import すると、下の pnpm の版の失敗を初回ビルドで一度踏むことになる。

## pnpm の版

`web/vercel.json` の `installCommand` が `pnpm@11.21.0` を名指しで入れてから install する。
corepack は使わない（`CLAUDE.md`「開発ハーネス」）。

**版の正は `mise.toml`** で、`vercel.json` は追随する側。
`mise.toml` を上げたら同じ値へ揃える。
揃え忘れると本番だけ古い pnpm で install することになり、`web/pnpm-workspace.yaml` の `allowBuilds` が効かずに `prisma generate` が engine 不在で落ちうる。

自動検出に任せない理由と、採らなかった案は `docs/adr/0007-production-pnpm-version.md`。

## migration

main への push で `.github/workflows/migrate.yml` が `prisma migrate deploy` を流す。
流すものが無ければ何もしないので、migration を含まない push でも走らせている。

Vercel のビルドとは競走するが、`migrate deploy` は秒・`next build` は分なので、順序は構造上ほぼ守られる。

**後方非互換な変更はこの前提が効かない**。
列の削除・改名のように旧コードが動かなくなる migration は、自動経路へそのまま載せず三段階に割る。

1. 旧コードでも動く形（列の追加・NULL 許容・二重書き）だけを先に main へ入れる
2. 旧コードが古い列を使わなくなる変更を、次の PR で入れる
3. 古い列を落とす migration は、さらにその後の PR で入れる

決定の経緯と、この規律が守れなかったときの倒し先は `docs/adr/0008-production-migration-path.md`。

**手元から流す口もある**（切り戻しの後の再実行や、自動経路が落ちたとき）。

```bash
pnpm migrate:prod
```

接続先は `.env.local` の `DIRECT_URL_PROD`（`web/README.md` の表）。
流す前に接続先のホストとデータベース名を表示するので、本番と Preview の取り違えはそこで見る。

## Preview

PR ごとの Preview デプロイにも環境変数を 6 本入れる（Vercel の Environment Variables で環境に **Preview** を選ぶ）。
接続先は Neon の `preview` ブランチで、本番とは別の DB を向く。

| 変数 | 値 |
|---|---|
| `DATABASE_URL` | `preview` ブランチのプーラー経由 |
| `DIRECT_URL` | 同ブランチの直結 |
| `TOIITO_FAKE_AI` | `1` |
| `TOIITO_FAKE_USER_EMAIL` | `pnpm seed` が入れる一人目の email（`web/scripts/seed/users.ts`） |
| `TOIITO_BASIC_AUTH_USER` | Production と同じ値 |
| `TOIITO_BASIC_AUTH_PASSWORD` | 同上 |

接続 2 本の末尾は本番と同じく `sslmode=verify-full`。

**アクセス制限の 2 本を落とさない**。
欠けていると `proxy.ts` がモジュールの評価時に投げ、Preview の全リクエストが 500 になる。
`next build` は proxy を実行しないのでビルドは通るため、**Vercel のチェックは緑のまま中身だけ壊れる**。

`TOIITO_FAKE_USER_EMAIL` も同じ形で壊れる。
欠けていれば全ページが落ち、指した email の利用者が Preview の DB に居なくても落ちる。
**本番（Production）には入れない**——認証を丸ごと外す口なので、入っていると起動時に投げる（`docs/adr/0019-auth-better-auth.md` 決定 7）。

決定の経緯と採らなかった案は `docs/adr/0015-preview-neon-branch.md`。

### ブランチを切る

Neon の toiito → Branches → Create branch。
名前は `preview`、parent は `production`、種類は **Branch schema only**。

既定の Branch data and schema は親の HEAD をコピーするので、本番の問いがそのまま Preview に入る。
後から消す手も採れるが、消し忘れと接続先の取り違えが挟まるので、**最初から入れない**方を採る。

**auto-delete は付けない**。
全 PR が共有する 1 本なので、期限で消えると Preview のビルドが黙って赤へ戻る。

**schema only は `_prisma_migrations` も空にする**（2026-08-29 に実測）。
テーブルは在るのに Prisma からは migration が一つも当たっていないと見えるので、そのまま `migrate deploy` を流すと同じ migration を二重に当てにいって落ちる。
辻褄を合わせてから開発用データを入れる。
`web/` で叩き、`prisma/migrations/` に在る分をすべて `--applied` で入れる（いまは init の一本だけ）。

```bash
DIRECT_URL='<preview の直結>' pnpm exec prisma migrate resolve --applied 20260816090000_init
DATABASE_URL='<preview のプーラー>' pnpm seed
```

**所有権の migration（`20260902090000_ownership_foundation`）を流した後は、もう一度 `pnpm seed` を流す**。
この migration は持ち主のいない既存の問いを消すので（`docs/adr/0020-ownership-granularity.md` 決定 5）、流した後の Preview は空になる。
シードは利用者二人ごと入れ直す。

接続先はシェルの環境変数が `.env.local` より優先される（`process.loadEnvFile` も `--env-file` も、既に環境にある値を上書きしない）。
`migrate status` が `Database schema is up to date!` を返せば辻褄が合っている。

最後に接続文字列 2 本を Vercel の Preview へ入れる（上の表）。

### migration を含む PR

**Preview の DB へ migration を自動で流す経路は無い**。
新しい列を足す PR の画面を Preview で見るなら、手元から一度流す。

```bash
pnpm migrate:preview
```

接続先は `.env.local` の `DIRECT_URL_PREVIEW`（`web/README.md` の表）。

流さないまま開くと、DB が新しい列を持たないので画面が落ちる。

### 効きの確認

**Preview は制限が二重になる**ので、素で叩いた応答をアプリ側の証拠として読まない。
外側の Vercel Authentication が先に答え、**401 ですらなく 302 で SSO へ飛ばす**（2026-08-29 に実測）。

```
HTTP/2 302
location: https://vercel.com/sso-api?url=...
```

アプリ側まで届いているかを見るには、外側を抜けてから叩く。
Vercel の共有リンク（`?_vercel_share=...`、23 時間で失効）で cookie を取り、その cookie のまま資格情報なしで叩く。

```bash
curl -s -c jar -b jar -L -o /dev/null 'https://<preview-url>/?_vercel_share=<token>'
curl -s -b jar -D - -o /dev/null 'https://<preview-url>/no-such-page'
```

`WWW-Authenticate: Basic realm="toiito"` を伴う 401 が返ればアプリ側の制限に届いている。
この realm は `web/src/proxy.ts` にしかない綴りなので、どちらの層が答えたかがこれで割れる。
アプリのルートに当たらない経路を叩くのは、制限が routing より前に掛かっていることも同時に見るため。

**向いている DB は、Preview のランタイムログで見る**。
表示された問いの ID が seed のものであれば `preview` ブランチを読んでいる。
本番の ID が出てきたら接続文字列が Production のものになっている。

## 切り戻し

コードは Vercel の Instant Rollback で戻す。
ルーティング層の切り替えなので秒で終わる。

```bash
vercel rollback <previous-deployment-url-or-id>
```

ダッシュボードの Deployments からも同じことができる。
Hobby で戻せるのは直前の production デプロイまで（任意の過去デプロイへ戻せるのは Pro 以上）。

**migration は戻らない**。
`prisma migrate deploy` に取り消しは無いので、スキーマを戻すには打ち消す migration を書いて流すことになる。
コードだけ戻して直る範囲に収めるのが、上の三段階に割る規律の目的。

データごと巻き戻すなら Neon の point-in-time restore を使う（2026-08-28 時点で無料プランでも使える）。
ただし履歴は **6 時間・変更 1 GB-month** までで、戻せるのは root ブランチだけ。
枠を超えた時点より前へは戻せないので、これを常用の安全網と見なさない。

## アクセス制限

#65（認証と所有権の方式を決める）/ #68（ログイン（Google OAuth）とリソースの所有権）が入るまでの繋ぎとして、**アプリ側の Basic 認証**で本番を囲う。
`web/src/proxy.ts` が全リクエストを見て、`TOIITO_BASIC_AUTH_USER` と `TOIITO_BASIC_AUTH_PASSWORD` に一致しなければ 401 を返す。

**本番で二本が欠けていれば、リクエストを捌く前に落ちる**。
掛けたつもりの制限が掛かっていない状態を作らないための設計で、経緯は `docs/adr/0013-production-basic-auth.md`。

**ホスティング側のアクセス制限は本番に効かない**（2026-08-29 に実測）。
Hobby で選べる Vercel Authentication の Standard Protection は、API 上の名前が `prod_deployment_urls_and_all_previews` で、守るのは production の**デプロイ URL**（`<project>-<hash>-<team>.vercel.app`）と Preview だけである。
production の domain（`<project>.vercel.app`）は素通しになる。
シークレットウィンドウでも Safari でもログインを求められずアプリへ到達することを確認した。
囲える All Deployments は Pro の Advanced Deployment Protection（月 150 ドル）が要る。

**Vercel Authentication は無効化しない**。
デプロイ URL と Preview はあちらが守り続ける。

#68 が入ったら Basic 認証ごと外す。

### 効きの確認

**設定した後、本番の URL を直接叩いて確かめる。**

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://<project>.vercel.app/
```

401 が返れば掛かっている。
200 が返ったら効いていないので、環境変数が Production に入っているかを見る。

**この確認を省かない。**
2026-08-29 に二度、設定上は掛かっているはずの制限が実際には通っていた（一度目は Vercel Authentication の適用範囲、二度目は Edge ランタイムで環境変数が読めない件）。
どちらもリクエストを一度投げるまで誰にも見えなかった。

ローカルの `pnpm e2e` にも制限の spec があるが、**あちらは Vercel のランタイム差を再現しない**（`HARNESS.md`「E2E」）。
退行を見るための層で、本番が閉じている証拠にはならない。

独自ドメインは当てていない。
`<project>.vercel.app` のまま使い、当てるのは #68 が入るか Hobby から動かすときにする。
アクセス制限はアプリ側にあるので、当てても保護は付いてくる。
Hobby は非商用限定なので、他人へ開く段では実行環境ごと決め直すことになる（`docs/adr/0002-production-runtime.md`「覆る条件」）。

## 引き受けている非対称

Neon 無料の **Scale to Zero は 5 分のアイドルで停止し、無効化できない**。
「思いついたときに投げる」使い方だと、ほぼ毎回停止から復帰することになる。

**実測で約 10 秒**（2026-08-29。停止するだけ空けてから `/` を開いた）。
問い一覧は DB を読むだけで AI を呼ばないので、この 10 秒は Vercel の関数のコールドスタートと Neon の復帰の合計になる。
どちらに寄っているかは分けていない（どちらも「アイドル後の一発目」の費用で、分ける実益が薄い）。

**人間の判定は「遅延として感じない」**（同日）。
DB 側の枠の問題として別に立てる条件は満たさなかったので、この非対称は引き受けたままにする。

ストレージは 0.5 GB／プロジェクトで、超えると書き込みが失敗する。

Vercel Hobby の関数実行時間の上限は 300 秒で、変更できない。
**一往復の実測は 15〜27 秒**（2026-08-29・実キー・本番で 2 回）。
上限の 5〜9% なので、当面ここが効いてくることは無い。
近づいたら実行環境を決め直す（`docs/adr/0002-production-runtime.md`「覆る条件」）。

内訳は上の 10 秒と合わせて読める。
**AI の生成が 14〜17 秒、アイドル後の立ち上がりが約 10 秒**。
一往復は `max_tokens: 1024` を二回逐次で待つ形なので、幅を作っているのは主に出力の長さである。
