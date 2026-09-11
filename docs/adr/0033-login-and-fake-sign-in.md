# 0033. ログインを入れ、固定の利用者を「Google を経ないサインイン」へ置き換える

- **状態**: 採用
- **決定日**: 2026-09-09
- **関係する ADR**: 0013, 0018, 0022, 0029, 0030, 0031

## 文脈

0029 が認証の方式を、0022 がセッションの守りを、0031 が所有者をデータ層へ入れる順序を決めた。
#68（ログイン（Google OAuth）とリソースの所有権）に残っていたのは配線だけのはずだったが、配線に入ると決まっていなかったことが七つ出た。

| 決まっていなかったこと | 既存の記述 | そのまま進めた場合 |
|---|---|---|
| 固定の利用者のまま完了条件を満たせるか | 0031 の決定 5 は、環境変数が名指しする一人を常にサインイン済みにする。#68 の完了条件は、未サインインの状態と二人分の利用者を E2E で見ることを要求する | E2E が完了条件の 2 項目を検査できない |
| 許可リストの環境変数の名前 | 0018 の決定 3 は「環境変数のメール一覧で持つ」とだけ書く | 名前が決まらない |
| OAuth のトークンを保存しない方法 | 0029 の決定 8 は保存しないと書くが、Better Auth 1.7.2 が持つのは `account.encryptOAuthTokens`（暗号化して保存する）だけ | `dist/oauth2/link-account.mjs` が `accessToken` / `refreshToken` / `idToken` を `account` 表へ書き込む |
| 既定のユーザーと同じ email のサインイン | `accountLinking.enabled: false` の下で、`link-account.mjs` は同じ email の `user` 行を見つけると `account not linked` を返す。`docs/DEPLOY.md` は既定のユーザー（`owner@toiito.invalid`）の email を Google のものへ書き換えるよう指示していた | 指示に従った本番はサインインできない |
| `proxy.ts` を残すか削除するか | #68 の本文は `web/src/proxy.ts` と `web/src/lib/basic-auth.ts` の削除を挙げる。0029 の決定 5 は `proxy.ts` に cookie の有無を見る役割を与えている | 二つの記述のどちらかに反する |
| 未サインインの表し方 | 0022 の決定 9 と 0031 の決定 3 は関数の名前と性質を決めたが、実装は見つからなければ throw する | 通常の状態を例外で表すことになる |
| Basic 認証を外す順序 | 0031 の決定 5 は「ログインを入れる → 本番で確かめる → Basic 認証を外す」を運用の規律で持つ。#68 の本文は `basic-auth.ts` の削除をこの回に含める | コードが消えるので、三段の途中で止まる形が取れない |

## 決定

### サインインの経路

1. **`TOIITO_SINGLE_USER_EMAIL` を廃止し、`POST /api/auth/sign-in/fake` へ置き換える。**
   `TOIITO_FAKE_LOGIN=1` のときだけ有効になる Better Auth のプラグインで、本文の `email` が指す `user` 行に対して Better Auth のセッションを作る。
   利用者は作らない。
2. **許可リストは `TOIITO_ALLOWED_EMAILS`（カンマ区切り）で持ち、Google もフェイクも同じ照合を通る。**
   照合は `databaseHooks.session.create.before` の一箇所だけに置く（0022 の決定 8）。
3. **`TOIITO_FAKE_LOGIN` が `VERCEL_ENV=production` で設定されていたら、設定の読み取りで throw する。**

### 保存しないもの

4. **OAuth のトークンは `databaseHooks.account.create.before` で null にし、`account.updateAccountOnSignIn: false` で更新の経路も閉じる。**

### 入口と現在のユーザー

5. **`proxy.ts` は残し、Basic 認証をやめて cookie の有無だけを見る形へ書き換える。**
   `src/lib/basic-auth.ts` は削除する。
6. **`getCurrentUser` は `User | undefined` を返し、`requireCurrentUser` が未サインインを `/login` へ redirect する。**

### 本番への移行

7. **Basic 認証の撤去とログインの投入を、1 回のデプロイで行う。**
8. **既定のユーザーの email を、Google のサインインより先に書き換えない。**
   Google でサインインして新しい `user` 行ができてから、`questions.user_id` を付け替えて既定のユーザーの行を削除する。

## 理由

### 決定 1 — 固定の利用者をやめ、サインインの経路ごと置き換える

0022 の決定 2・4 は、cookie の属性と CSRF が実際の応答で効いていることを要求している。
固定の利用者のままだと E2E が検査する cookie は Better Auth が発行したものでなくなるので、その要求を満たせない。
`POST /api/auth/sign-in/fake` は `internalAdapter.createSession` と `setSessionCookie` を通るので、cookie の名前・属性・寿命が本物と同じになる。

| 採らなかった案 | 採らなかった条件 |
|---|---|
| `TOIITO_SINGLE_USER_EMAIL` を二人分に増やす | 常にサインイン済みの形なので、人数を増やしても未サインインの状態を作れない |
| E2E だけサーバーを二本立て、別々の利用者を名指しする | 未サインインの状態を作れないうえ、`next dev` の初回ビルドが二本分かかる |
| `emailAndPassword` を Preview と E2E だけ有効にする | 0029 の決定 2（パスワードは実装しない）に反し、シードの二人にパスワードのハッシュを持たせることになる |
| Google の OAuth を模したサーバーを立てる | 検査できるようになるのは Google との往復だけで、その往復はこのアプリのコードではない |

### 決定 2 — 許可リストは一本で、フェイクも同じ照合を通る

照合を `databaseHooks.session.create.before` に置くと、セッションを作る経路がどれでも同じ述語を通る。
フェイクのエンドポイントも `internalAdapter.createSession` を呼ぶので、許可リストに無い email はセッションを作れない。

| 採らなかった案 | 採らなかった条件 |
|---|---|
| フェイク専用の許可リストを持つ | 照合が二箇所になり、0022 の決定 9 が経路を一本に絞った理由（述語を差し替える場所が一つで済む）が消える |
| 変数名に `INVITE` を使う | 招待を送る機能があると読めるが、このアプリにあるのは許可リストとの照合だけである |

### 決定 3 — 本番でフェイクを禁じるのは設定の読み取りが持つ

#68 が Basic 認証を外すので、本番の外周はログインだけになる。
フェイクのエンドポイントが本番で有効だと、許可リストに載った email を名乗るだけで他人のリソースへ到達できる。
0031 の決定 5 が本番で固定の利用者を許した根拠（外周は Basic 認証が持つ）も、ここで消える。

| 採らなかった案 | 採らなかった条件 |
|---|---|
| 運用の規律で持つ | `TOIITO_FAKE_LOGIN` は Preview へ入れる手順の中で Production へも入りうるので、繰り返しうる間違いを人の注意に任せることになる |
| `NODE_ENV` で本番を見分ける | Vercel の Preview も `NODE_ENV=production` で走るので、Preview のフェイクまで止まる |

### 決定 4 — トークンは書き込む直前に取り除く

`dist/db/with-hooks.mjs` は `databaseHooks.account.create.before` が返した `data` を元のデータへ重ねてからアダプタへ渡すので、null を明示すると `account` 表にも null が入る。
`create.before` は作成時にしか走らないので、2 回目以降のサインインで `link-account.mjs` が呼ぶ `updateAccount` の経路は、`updateAccountOnSignIn: false` で別に閉じる。

| 採らなかった案 | 採らなかった条件 |
|---|---|
| `encryptOAuthTokens` を有効にする | 暗号化しても保存はするが、このアプリは Google の API を呼ばず、要るのは同一性だけである |
| `account` 表から列ごと削除する | 0031 の決定 1（四表は `getAuthTables` の定義のまま置く）に反し、Better Auth の版を上げるたびに差分が出る |

### 決定 5 — `proxy.ts` は役割を替えて残す

#68 の本文が削除を挙げたのは Basic 認証の判定で、0013 の覆る条件（#68 が入ったら外す）が指すのも Basic 認証である。
0029 の決定 5 は `proxy.ts` に cookie の有無だけを見る楽観的な判定という役割を与えているので、判定の実体（`src/lib/basic-auth.ts`）だけを削除し、`proxy.ts` は書き換えて残す。

| 採らなかった案 | 採らなかった条件 |
|---|---|
| `proxy.ts` を削除し、ページ側の redirect だけで済ませる | 0029 の決定 5 が決めた入口の役割（未サインインを `/login` へ送る）が無くなり、未サインインのリクエストが RSC の描画まで進んで DB を 1 往復する |
| 入口で DB を照合する | 0029 が採らなかった案で、条件は変わっていない。0013 が matcher を書かないと決めているので、全リクエストに DB の往復が加わる |

### 決定 6 — 未サインインは undefined で表す

ログインが入ると未サインインは通常の状態になるので、throw で表すと通常フローの分岐に例外を使うことになる。

| 採らなかった案 | 採らなかった条件 |
|---|---|
| `getCurrentUser` の中で redirect する | `/login` の画面は「サインイン済みなら `/` へ送る」ために現在のユーザーを取得する必要があり、redirect を中に持つとその画面から呼べない |

### 決定 7 — 二重認証の期間を作らない

0031 の決定 5 の三段は、Basic 認証の判定がコードに残っていることを前提にしている。
#68 の本文は `basic-auth.ts` の削除をこの回に含め、0013 の覆る条件も #68 で外すと書いているので、コードを残す判断はその両方に反する。

ログインが本番で動かなかったときの形は、次の二つで決まる。

| 場所 | 振る舞い |
|---|---|
| `proxy.ts` | cookie が無ければ `/login` へ送る |
| `lib/auth/index.ts` | 設定が欠けていれば最初のリクエストで throw する |

どちらも検証なしで通す形へフォールバックしないので、失敗の形は「誰でも入れる」でなく「誰も入れない」になる。
戻し方は Vercel の Instant Rollback で、ルーティング層の切り替えなので秒で終わる（`DEPLOY.md`「切り戻し」）。

| 採らなかった案 | 採らなかった条件 |
|---|---|
| `basic-auth.ts` を 1 回分だけ残す | 残す回と外す回の 2 回のデプロイになり、2 回目を促す仕組みが無い。0013 が記録したのは、設定したつもりの制限が差分に現れない場所で放置される失敗である |

### 決定 8 — 既定のユーザーの行は、サインインより後に片付ける

`accountLinking.enabled: false` の下では、同じ email の行が先に在るとサインインそのものが拒否される。
既定のユーザーに Google の email を入れた状態は、問いが見えなくなる状態でなく、サインインできなくなる状態である。

| 採らなかった案 | 採らなかった条件 |
|---|---|
| `accountLinking.enabled: true` で紐づける | 0029 の決定 6 が無効と決めている。1.7.2 は `requireLocalEmailVerified` が既定で true なので、有効にしても `emailVerified` が false の既定のユーザーには紐づかず、紐づけるには検証していない email を検証済みとして書き込むことになる |
| 既定のユーザーの行を先に削除する | `questions.user_id` が NOT NULL の外部キーなので、付け替える前には削除できない |

## 帰結

環境変数は次のように変わる。
変数の意味の正は `web/README.md`「環境変数」、置き場の正は `docs/DEPLOY.md`「秘密の置き場」と「Preview」の表。

| 変数 | 変化 | 決定 |
|---|---|---|
| `TOIITO_SINGLE_USER_EMAIL` | 削除 | 1 |
| `TOIITO_FAKE_LOGIN` | 追加（Preview と E2E だけ） | 1・3 |
| `TOIITO_ALLOWED_EMAILS` | 追加 | 2 |
| `BETTER_AUTH_SECRET` / `BETTER_AUTH_URL` | 追加 | — |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | 追加 | — |
| `TOIITO_BASIC_AUTH_USER` / `TOIITO_BASIC_AUTH_PASSWORD` | 本番と Preview から削除 | 7 |

他の ADR には次の影響がある。

| ADR | 影響 |
|---|---|
| 0013 | 覆る条件（#68 が入ったら外す）が発火する |
| 0022 の決定 8 | 移行の順序（停止フラグを足してから許可リストを外す 4 段）は変わらない |
| 0031 の決定 5 | 覆る条件（#68 が入ったら）が発火し、単一ユーザーの運用が終わる。三段の外し方は決定 7 で 2 段になる |
| 0031 の帰結 | `src/lib/current-user.ts` は `src/lib/auth/current-user.ts` を指す |

コードと文書には次の影響がある。

- `docs/DEPLOY.md`「唯一のユーザーの行を入れる」は「既存の問いを、ログインした自分へ移す」へ置き換わる。
  既定のユーザーの email を Google のものへ書き換える指示は、決定 8 で逆になる
- `db.ts` が Prisma のクライアントを 1 つ export する（`authDatabaseClient`）。
  Better Auth のアダプタがクライアントそのものを要求するためで、`docs/ARCHITECTURE.md`「技術スタック」の禁止則（Prisma を repo 層の外へ出さない）の唯一の例外になる。
  アプリと同じクライアントを返すので、接続プールは 1 本のままである
- `auth()` は関数で、最初の呼び出しまで環境変数を読まない。
  `next build` がルートハンドラのモジュールを評価して設定を集めるので、モジュールの評価時に読むと、認証の環境変数を持たない CI でビルドが失敗する
- 認証のモジュールは `src/lib/auth/` へまとまる（`index.ts` / `config.ts` / `fake-login.ts` / `current-user.ts` / `protected-paths.ts`）。
  `@/lib/auth` の解決先が `auth.ts` から `auth/index.ts` へ移るだけなので、import する側の指定は変わらない
- `biome.json` の `noRestrictedImports` の除外は 4 ファイルになる（`lib/auth/index.ts` / `lib/auth/fake-login.ts` / `lib/auth/current-user.ts` / `app/api/auth/[...all]/route.ts`）

## 覆る条件

| 起きたこと | 見直す決定 | 見直す内容 |
|---|---|---|
| Preview で本物の Google OAuth を通せるようになった | 1 | フェイクが要る理由のうち Preview の分が消える。E2E の分（二人分の利用者と未サインインの状態）は残るので、フェイクは自動では消えない |
| 本番が Vercel 以外へ移った | 3 | `VERCEL_ENV` に代わる本番の見分け方を選ぶ |
| Google 以外のプロバイダを足す（#133（捨てアカウント枠）） | 8 | 0029 の決定 6 と一緒に、同じ email の行が先に在る場合の扱いを決める |
| 許可リストをやめてアカウント登録制へ移る | 2 | 0022 の決定 8 の移行の順序に従い、`TOIITO_ALLOWED_EMAILS` を削除する |
| Better Auth が 1.8 系へ上がった | 4・8 | 1.7.2 の `dist/` で読んだ `oauth2/link-account.mjs` の紐づけの条件と `db/with-hooks.mjs` の重ね方を読み直す |
| 未サインインでも読めるページを作る | 5・6 | 保護されていないページが無いという前提を見直す |
