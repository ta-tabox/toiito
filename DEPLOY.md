# DEPLOY — 本番（Vercel + Neon）

本番へ出す手順。
秘密の置き場・初回のセットアップ・デプロイと切り戻しを持つ。

何をもって「動いた」と言うかは `HARNESS.md`、なぜこの構成なのかは `docs/adr/` が持つ。
ここは現況の手順だけに閉じる。

アプリは Vercel（Hobby）、DB は Neon の無料プラン（選定の経緯は `docs/adr/0002-production-runtime.md`）。
Vercel の Root Directory は `web/`。
main へ入れば Vercel が本番を差し替える。
手で叩くものは無い。

**migration の経路はまだ通っていない**（#96（本番の migration 経路を通す））。
本番 DB にテーブルが無いので、DB へ触る画面は 500 を返す。
ここで確かめられるのは、ビルドが通って Next が立つところまで。

## 秘密の置き場

Vercel の Environment Variables（Production）へ 3 本入れる。
値を持つのは人間だけで、リポジトリにも `.env*` にも書かない。

| 変数 | 値 |
|---|---|
| `DATABASE_URL` | Neon のプーラー経由（ホスト名に `-pooler` が付く方） |
| `DIRECT_URL` | Neon の直結 |
| `ANTHROPIC_API_KEY` | Claude API のキー |

`TOIITO_MODEL` は任意（既定 `claude-sonnet-5`）。
`TOIITO_FAKE_AI` は**本番に入れない**。
入れると本番が実 API を叩かず、決定的なダミー応答を返す。

**3 本とも Production に入れてから最初のビルドを回す**。
`postinstall` の `prisma generate` は `prisma.config.ts` 経由で `DIRECT_URL` を即時解決するので、無いとインストール段階で exit 1 になる。
要るのは解決できることだけで、接続は要らない（`prisma generate` は DB へ繋がない）。

## 初回のセットアップ

1. Neon で本番プロジェクトを作り、接続文字列を 2 本控える。
   違いはホスト名の `-pooler` だけ
2. Vercel でリポジトリを import する。
   import 画面で環境変数を入れられるので、上の 3 本をそこで入れる。
   入れずに import すると最初のビルドが `prisma generate` で落ちる（落ちても、入れてから Redeploy すれば済む）
3. Project Settings → Build and Deployment → Root Directory に `web/` を入れる
4. Project Settings → Functions → Node.js Version を 24 にする（版の正は `mise.toml`）
5. Project Settings → Deployment Protection → Vercel Authentication を **All Deployments** にする

Install Command は `web/vercel.json` が持つので、ダッシュボードでは触らない。

**import は main へマージした後に回す**。
Vercel の production ビルドが見るのは main なので、`web/vercel.json` の無い main を先に import すると、下の pnpm の版の失敗を初回ビルドで一度踏むことになる。

## pnpm の版

`web/vercel.json` の `installCommand` が `pnpm@11.21.0` を名指しで入れてから install する。
corepack は使わない（`CLAUDE.md`「開発ハーネス」）。

**版の正は `mise.toml`** で、`vercel.json` は追随する側。
`mise.toml` を上げたら同じ値へ揃える。
揃え忘れると本番だけ古い pnpm で install することになり、`web/pnpm-workspace.yaml` の `allowBuilds` が効かずに `prisma generate` が engine 不在で落ちうる。

自動検出に任せない理由と、採らなかった案は `docs/adr/0007-production-pnpm-version.md`。

## 切り戻し

コードは Vercel の Instant Rollback で戻す。
ルーティング層の切り替えなので秒で終わる。

```bash
vercel rollback <previous-deployment-url-or-id>
```

ダッシュボードの Deployments からも同じことができる。
Hobby で戻せるのは直前の production デプロイまで（任意の過去デプロイへ戻せるのは Pro 以上）。

DB 側の切り戻しは #96（本番の migration 経路を通す）が持つ。

## 門

#65（認証と所有権の方式を決める）/ #68（ログイン（Google OAuth）とリソースの所有権）が入るまでの繋ぎとして、Vercel Authentication を **All Deployments** で掛ける。
Production も含めて Vercel のアカウントでログインしないと入れない。
Standard Protection は production ドメインを素通しにするので選ばない。
#68 が入ったら外す。

独自ドメインは当てていない。
`<project>.vercel.app` のまま使い、当てるのは #68 が入るか Hobby から動かすときにする。
Hobby は非商用限定なので、他人へ開く段では実行環境ごと決め直すことになる（`docs/adr/0002-production-runtime.md`「覆る条件」）。

## 引き受けている非対称

Neon 無料の **Scale to Zero は 5 分のアイドルで停止し、無効化できない**。
「思いついたときに投げる」使い方だと、ほぼ毎回停止から復帰することになる。
復帰の体感は L5（人間の官能）でしか測れないので、待たされるなら DB 側の枠の問題として別に立てる。

ストレージは 0.5 GB／プロジェクトで、超えると書き込みが失敗する。
Vercel Hobby の関数実行時間の上限は 300 秒で、変更できない。
一往復は `max_tokens: 1024` を二回逐次で待つ形なので、実測が 300 秒へ近づいたら実行環境を決め直す（`docs/adr/0002-production-runtime.md`「覆る条件」）。
