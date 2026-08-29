# 0015. Preview に Neon のブランチを当てた専用の DB を持たせる

- **状態**: 採用
- **決定日**: 2026-08-29
- **関係する ADR**: 0013

## 文脈

#90（本番環境へデプロイする）で環境変数を Production だけに入れると決めたので、**Preview のビルドは以後すべての PR で必ず落ちる**。
`postinstall` の `prisma generate` が `prisma.config.ts` 経由で `DIRECT_URL` を即時解決するため、無いとインストール段階で exit 1 になる。

```
postinstall: PrismaConfigEnvError: Cannot resolve environment variable: DIRECT_URL.
```

いまは「予告どおりの赤」だと分かっているが、**赤が常態になると本物の赤を隠す**。
`.github/workflows/migrate.yml` で「毎回走らせて落ちたら赤で気づく」形を選んだのと、同じ理屈がここでは逆を向いている。

Production だけにしたのには理由がある。
Preview へ入れると preview デプロイが**本番の DB へ書き込む**。
このアプリはデータそのものが自分の問いで、しかも MVP に削除 UI が無いので、掃除は SQL を直に叩くことになる。

## 決定

**Neon のブランチを切って Preview 専用の DB を当て、Preview へ環境変数を 5 本入れる。**

| 変数 | 値 |
|---|---|
| `DATABASE_URL` | Neon の `preview` ブランチのプーラー経由 |
| `DIRECT_URL` | 同ブランチの直結 |
| `TOIITO_FAKE_AI` | `1` |
| `TOIITO_BASIC_AUTH_USER` | Production と同じ値 |
| `TOIITO_BASIC_AUTH_PASSWORD` | 同上 |

接続 2 本の末尾は `sslmode=verify-full` で、本番と揃える（#105）。

**ブランチを切った直後にデータを空へ戻し、`pnpm seed` を入れ直す。**

**Preview の DB へ migration を自動で流す経路は作らない。**

## 理由

運用が進めば、PR の画面で一度見て確かめる流れが要る。
赤を消すだけなら Preview のデプロイを止める方が安いが、それは**確かめる手段ごと捨てる**ことになる。
いまはまだ画面を見て決める場面が少ないものの、#56（メモ UI の見せ方）や #67（既存画面を DESIGN.md へ寄せる）のように**見ないと決まらない issue** が `ROADMAP.md`「MVP 後の第二波」に載っている。

**Preview のデプロイ自体を止める案を採らなかった条件**（`web/vercel.json` の `git.deploymentEnabled`）: 赤は消えるが、PR の画面で確かめる手段も消える。
`git.deploymentEnabled` は minimatch で `*` が区切りをまたがず、このリポジトリのブランチ名は `claude/issue-104-...` とスラッシュを含むので、パターンの検証も要る。
**採る条件**: Preview を見る場面が実際に来ないまま、赤だけが積み続けたとき。

**放っておく案を採らなかった条件**: 赤の意味を人間が覚えている限りは動くが、覚えていられなくなったときに効いてくる。
**採る条件**: 上の二つがどちらも高く付くと分かったとき。

**実キーを採らなかった条件**: 上で挙げた用途——#56 のメモ UI と #67 の画面——はどちらも見た目の判断で、対話の中身を要らない。
`TOIITO_FAKE_AI=1` でも画面と DB までは確かめられる。
PR ごとに費用が乗る側を、要らない用途のために既定へ据えない。
ペルソナの文言を変える回に対話の中身が要るなら、その回だけ差し替える（`web/src/lib/claude.ts` が実行時に見るので、値を入れ替えるだけで切り替わる）。

**アクセス制限の 2 本を落とさなかった条件**: 落とすと Preview が動かない。
`readBasicAuthCredentials` は `NODE_ENV` が production なら投げるので、`proxy.ts` はモジュールの評価時に死に、全リクエストが 500 になる。
`next build` は proxy を実行しないのでビルドは通り、**Vercel のチェックは緑のまま中身だけ壊れる**。
2026-08-29 に手元で実測した（2 本を渡さずに `next start` を立てて叩くと 500 で、ログに `本番では TOIITO_BASIC_AUTH_USER と TOIITO_BASIC_AUTH_PASSWORD が要る` が出る）。

なお #104 の本文は「`NODE_ENV` が production でないので投げずに `null` を返し、Preview が制限なしで開く」と書いていたが、**これは誤りだった**。
`next build` の出力は `NODE_ENV=production` で走るので、素通しへ倒す分岐にはそもそも入らない。
0013 の「設定が無いときに素通しへ倒さない」がそのまま効いており、**掛け忘れた Preview が黙って開くことは構造上できない**。

**Neon のデータをコピーしたまま使わなかった条件**: Neon のブランチは親の HEAD をコピーするので、切っただけでは本番の問いがそのまま Preview に入る。
書き込みは分離されるので本番は汚れないが、自分の問いの置き場が黙って二つになる。
画面を確かめる用途には seed の方が向いてもいる——何が入っているかが決まっているので、見えているものが変更のせいかデータのせいかを切り分けられる。

**Preview へ migration を流す経路を作らなかった条件**: `migrate.yml` と同じ形をもう一本増やすことになり、本番 DB の資格情報を持つ job の隣に Preview 用の分岐が並ぶ。
migration を含む PR で Preview の画面を見たい回だけ、手元から一度流す方を採る（綴りは `DEPLOY.md`「Preview」）。

## 帰結

- **Preview のデプロイが緑になる**。
  赤が本物の赤だけを指すようになる
- Vercel の環境変数が Production 5 本 + Preview 5 本になる（`DEPLOY.md`「秘密の置き場」「Preview」）
- Neon のブランチが 2 本になる。
  無料プランの上限は 10 本で、storage 0.5 GB はプロジェクトで共有する（ブランチは copy-on-write なので、増えるのは seed の分だけ）
- **migration を含む PR では、Preview の画面が落ちる**。
  Preview の DB が新しい列を持たないため。
  手当ては手動で、綴りは `DEPLOY.md`「Preview」が持つ
- Preview はアプリ側の Basic 認証と Vercel Authentication の**二重**になる。
  Vercel Authentication は Preview を守るので（`ssoProtection.deploymentType` は `all_except_custom_domains`）、**素で叩いた 401 はアプリ側の制限が効いている証拠にならない**。
  切り分け方は `DEPLOY.md`「Preview」の確認手順が持つ
- Preview の DB に自分の問いは入らない。
  常用のデータは本番だけが持つ

## 覆る条件

- **#68（ログイン（Google OAuth）とリソースの所有権）が入ったら、Basic 認証の 2 本は消える**（0013 と同じ）。
  接続 2 本と `TOIITO_FAKE_AI` は残る
- Preview を見る場面が実際に来ないまま、ブランチと環境変数 5 本の維持だけが残ったら、`git.deploymentEnabled` で Preview を止める側へ倒す
- 対話の中身を Preview で見ないと決まらない issue が来たら、`TOIITO_FAKE_AI` を実キーへ差し替える
- migration を含む PR が続いて手動の `migrate deploy` が負担になったら、Preview へ流す経路を足す
- Neon の無料プランがブランチか storage の枠を締めたら、Preview の DB を別の場所へ移すか、Preview を止める側へ倒す
