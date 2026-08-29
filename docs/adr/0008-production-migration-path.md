# 0008. 本番の migration は main への push を起点に GitHub Actions から流す

- **状態**: 採用
- **決定日**: 2026-08-28
- **関係する ADR**: 0002

## 文脈

Vercel に `release_command` 相当が無い（ADR 0002 の「覆る条件」にも、そこが窮屈なら実行環境を見直すと書いてある）。
本番の migration をどこから流すかだけが未決で残っていた。

build command へ混ぜる案は先に落ちている。
ビルドは複数回・並行して走りうるので、走った回数だけ migration も走ることになる。

## 決定

`.github/workflows/migrate.yml` が main への push を起点に `prisma migrate deploy` を流す。

- 本番の直結接続文字列は GitHub の Repository secret `PRODUCTION_DIRECT_URL` だけが持つ
- migration ファイルの有無で job を絞らない
- job が持つ権限は `contents: read` のみ

## 理由

秘密の置き場が GitHub Secrets 一箇所に閉じ、本番の接続文字列が手元へ増えない。
`.github/workflows/check.yml` が既に `DATABASE_URL` と `DIRECT_URL` を env で持つ形なので、綴りをそのまま延長できる。

Vercel のデプロイとは競走するが、`migrate deploy` は秒・`next build` は分なので、順序は構造上ほぼ守られる。

**手元から手で流す案を採らなかった条件**: 本番の接続文字列が手元に増え、流し忘れを防ぐものが何も無い。
`.env*` は Claude が触れない設定になっており、人間の手元に本番の値が増えること自体が事故源になる。

**`workflow_dispatch` だけにする案を採らなかった条件**: 流す順序は握れるが、流し忘れを防ぐものは手実行と同じく無い。
競走が構造上ほぼ解決するなら、順序を握る価値より忘れない価値が勝つ。

**migration ファイルの有無で絞らなかった条件**: `migrate deploy` は流すものが無ければ何もしない。
`paths` の綴りを誤ると migration が黙って流れず、気づくのは本番の 500 になる。
毎回走らせて落ちたら赤が出る方が、失敗が見える。

## 帰結

- `.github/workflows/migrate.yml` が増える。
  起動は push: main のみなので PR には出ず、ruleset の必須チェックは `check` 一本のまま動かない
- **後方非互換な migration（列の削除・改名）は自動経路に載せず二段階へ割る規律が要る**。
  手順は `DEPLOY.md`
- 人間が GitHub へ `PRODUCTION_DIRECT_URL` を入れないと、この job は最初の push で落ちる
- ADR 0002 の覆る条件「migration のデプロイ時フックが無いことが実運用で効いてきたら」に対する、いまの答えになる

## 覆る条件

- 競走が実際に効いたら（`next build` が秒で終わるようになる、migration が分かかるようになる）。
  順序を握る形——`workflow_dispatch`、あるいはデプロイ前に流す二段構え——へ倒す
- 二段階へ割る規律が守られずに本番を壊したら。
  規律で持てないと分かった時点で、機械で止める形か順序を握る形へ移す
- 実行環境を Vercel から動かしたら。
  Railway の Pre-Deploy Command や Fly.io の `release_command` はこの workflow を要らなくする（ADR 0002）
