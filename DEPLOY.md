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
| `PRODUCTION_DIRECT_URL` | GitHub の Settings → Secrets and variables → Actions | `DIRECT_URL` と同じ値。migration を流す workflow だけが読む |

`TOIITO_MODEL` は任意（既定 `claude-sonnet-5`）。
`TOIITO_FAKE_AI` は**本番に入れない**。
入れると本番が実 API を叩かず、決定的なダミー応答を返す。

**3 本とも Production に入れてから最初のビルドを回す**。
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
   import 画面で環境変数を入れられるので、上の 3 本をそこで入れる。
   入れずに import すると最初のビルドが `prisma generate` で落ちる（落ちても、入れてから Redeploy すれば済む）
3. Project Settings → Build and Deployment → Root Directory に `web/` を入れる
4. Project Settings → Functions → Node.js Version を 24 にする（版の正は `mise.toml`）
5. Project Settings → Deployment Protection → Vercel Authentication を有効にする（**Standard Protection**。Hobby で選べるのはこれだけ）
6. GitHub の Settings → Secrets and variables → Actions に `PRODUCTION_DIRECT_URL` を入れる

Install Command は `web/vercel.json` が持つので、ダッシュボードでは触らない。

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

## 門

#65（認証と所有権の方式を決める）/ #68（ログイン（Google OAuth）とリソースの所有権）が入るまでの繋ぎとして、Vercel Authentication を **Standard Protection** で掛ける。
Vercel にログイン済みで、かつこのチームの一員でないと入れない。

**チームの一員が開くとログイン画面を挟まず通る**。
門が外れているわけではないので、効きを確かめるならプライベートウィンドウで開く。

**この門は本番の URL を守っていない**（2026-08-29 に実測）。
Standard Protection の API 上の名前が `prod_deployment_urls_and_all_previews` で、守るのは production の**デプロイ URL**（`<project>-<hash>-<team>.vercel.app`）と Preview だけである。
**production の domain（`<project>.vercel.app` を含む）は素通しになる**。
シークレットウィンドウでも Safari でもログインを求められずアプリへ到達することを確認した。

塞げる `all`（All Deployments）は Pro の Advanced Deployment Protection（月 150 ドル）が要るので、**Hobby には本番を門で囲う手が無い**。

これは ADR 0002 が Vercel を選んだ決め手を崩している。
扱いは #102 が持つ。

#68 が入ったら外す。

独自ドメインは当てていない。
`<project>.vercel.app` のまま使い、当てるのは #68 が入るか Hobby から動かすときにする。

**当てると、そのドメインだけ上の門の外に出る**。
塞ぐ手は月 150 ドルの Advanced Deployment Protection を買うか、#68 が入って門自体が要らなくなるのを待つかの二つしかない。
Hobby は非商用限定なので、他人へ開く段では実行環境ごと決め直すことになる（`docs/adr/0002-production-runtime.md`「覆る条件」）。

## 引き受けている非対称

Neon 無料の **Scale to Zero は 5 分のアイドルで停止し、無効化できない**。
「思いついたときに投げる」使い方だと、ほぼ毎回停止から復帰することになる。
復帰の体感は L5（人間の官能）でしか測れないので、待たされるなら DB 側の枠の問題として別に立てる。

ストレージは 0.5 GB／プロジェクトで、超えると書き込みが失敗する。
Vercel Hobby の関数実行時間の上限は 300 秒で、変更できない。
一往復は `max_tokens: 1024` を二回逐次で待つ形なので、実測が 300 秒へ近づいたら実行環境を決め直す（`docs/adr/0002-production-runtime.md`「覆る条件」）。
