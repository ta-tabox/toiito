# 0032. ログインを入れ、固定の利用者を「Google を経ないサインイン」へ置き換える

- **状態**: 採用
- **決定日**: 2026-09-09
- **関係する ADR**: 0013, 0018, 0022, 0029, 0030, 0031

## 文脈

0029 が認証の方式を、0022 がセッションの守りを、0031 が所有者をデータ層へ入れる順序を決めた。
#68（ログイン（Google OAuth）とリソースの所有権）に残っていたのは配線だけのはずだった。

**配線に入ると、決まっていなかったことが六つ出た。**

- **`TOIITO_SINGLE_USER_EMAIL` では #68 の完了条件を満たせない。**
  0031 の決定 5 は、環境変数が名指しする一人として常にサインイン済みにする形である。
  #68 の完了条件は「未ログインで保護されたルートを開くとログインへ送られることを E2E で見る」と「他人のリソースへ到達できないことを E2E で見る」の二つを要求しており、前者には未サインインの状態が、後者には二人分の利用者が要る。
  常にサインイン済みの形では、どちらも作れない
- **許可リストの環境変数の名前が決まっていない。**
  0018 の決定 3 は「環境変数のメール一覧で持つ」とだけ書いている
- **Better Auth 1.7.2 に「トークンを保存しない」設定が無い。**
  0029 の決定 8 は「OAuth のトークンは保存しない」と書いているが、`account.encryptOAuthTokens` は暗号化して保存する設定であって、保存しない設定ではない。
  `dist/oauth2/link-account.mjs` は `accessToken` / `refreshToken` / `idToken` を `createAccount` へ渡す
- **`accountLinking.enabled: false` は、既存の行と同じ email のサインインを拒否する。**
  `dist/oauth2/link-account.mjs` は email が一致する `user` 行を見つけると、その行に Google の `account` が紐づいていない場合に `accountLinking.enabled === false` を見て `account not linked` を返す。
  0031 の決定 6 が作った受け皿の行（`owner@toiito.invalid`）の email を、`docs/DEPLOY.md` は「ログインに使う Google アカウントのものにしておく」と指示している。
  **その指示に従った本番は、#68 が入った瞬間にサインインできなくなる**
- **`proxy.ts` を残すのか削除するのかが食い違っている。**
  #68 の本文は「`web/src/proxy.ts` と `web/src/lib/basic-auth.ts` を落とす」と書き、0029 の決定 5 は「`proxy.ts` は cookie の有無だけを見る楽観的な判定に留める」と書いている
- **`getCurrentUser` が未サインインをどう表すかが決まっていない。**
  0022 の決定 9 と 0031 の決定 3 は関数の名前と性質を決めたが、いまの実装は「見つからなければ throw する」形である。
  ログインが入ると、未サインインは異常でなく通常の状態になる

## 決定

1. **`TOIITO_SINGLE_USER_EMAIL` を廃止し、`POST /api/auth/sign-in/fake` へ置き換える。**
   `TOIITO_FAKE_LOGIN=1` のときだけ有効になる Better Auth のプラグインで、本文の `email` が指す `user` 行に対して Better Auth のセッションを作る。
   利用者は作らない。
2. **許可リストは `TOIITO_ALLOWED_EMAILS`（カンマ区切り）で持ち、Google もフェイクも同じ照合を通る。**
   照合は `databaseHooks.session.create.before` の一箇所だけに置く（0022 の決定 8）。
3. **`TOIITO_FAKE_LOGIN` が `VERCEL_ENV=production` で設定されていたら、設定の読み取りで throw する。**
4. **OAuth のトークンは `databaseHooks.account.create.before` で null にし、`account.updateAccountOnSignIn: false` で更新の経路も閉じる。**
5. **`proxy.ts` は残し、Basic 認証をやめて cookie の有無だけを見る形へ書き換える。**
   `src/lib/basic-auth.ts` は削除する。
6. **本番の受け皿の行の email を、Google のサインインより先に差し替えない。**
   Google でサインインして新しい `user` 行ができてから、`questions.user_id` を付け替えて受け皿の行を削除する。
7. **`getCurrentUser` は `User | undefined` を返し、`requireCurrentUser` が未サインインを `/login` へ redirect する。**

## 理由

### 決定 1 — 固定の利用者をやめ、サインインの経路そのものを置き換える

**決め手は、E2E が見るものが本物でなくなることだった。**

固定の利用者を残したまま E2E を書くと、cookie の属性も CSRF も、Better Auth が実際に発行したセッションではなく環境変数の読み取りを見ることになる。
0022 の決定 2 と決定 4 が要求しているのは「属性が実際の応答に乗っていること」なので、フェイクの側が Better Auth を通らない形だと、要求が空を打つ。
`POST /api/auth/sign-in/fake` は `internalAdapter.createSession` と `setSessionCookie` を通るので、cookie の名前も属性も寿命も本物と同じものが出る。

**変数を二人分に増やす案を採らなかった条件**: 未サインインの状態が作れない。
`TOIITO_SINGLE_USER_EMAIL` の形は「サインインという行為が無い」ことが本体なので、名指しする人数を増やしても未サインインは表せない。

**E2E だけサーバーを二本立てて別々の利用者を名指しする案を採らなかった条件**: 同じ理由で未サインインが作れないうえ、`next dev` の初回ビルドが二本走る費用を、Basic 認証を外して不要になった直後にもう一度負うことになる。

**Better Auth の `emailAndPassword` を Preview と E2E だけ有効にする案を採らなかった条件**: 0029 の決定 2 が「パスワードは実装しない」と決めている。
シードの二人にパスワードのハッシュを持たせることになり、持たないと決めた資産が開発用の経路にだけ生える。

**Google の OAuth をモックするサーバーを立てる案を採らなかった条件**: 見えるようになるのは Google との往復だけで、その往復はこのアプリのコードではない。
アプリ側の関心（誰としてサインインしたか・cookie に何が乗るか・他人のリソースが見えないか）は、フェイクのエンドポイントで全部見える。

### 決定 2 — 許可リストは一本で、フェイクも同じ照合を通る

照合を `databaseHooks.session.create.before` に置くと、セッションを作る経路がどれであっても同じ述語を通る。
フェイクのエンドポイントも `internalAdapter.createSession` を呼ぶので、載っていない email はセッションを作れない。

**フェイクに専用の許可リストを持たせる案を採らなかった条件**: 照合が二箇所になると、0022 の決定 9 が「経路を一本に絞る」と決めた理由（述語を後から差し替える場所が一つで済む）がそこで消える。

**変数名に `INVITE` を使わなかった条件**: 招待という語は「招待を送る」という機能があることを含意する。
0018 は招待制と決めたが、送る機能は無く、あるのは載っているかどうかの照合だけである。

### 決定 3 — 本番でフェイクを禁じるのは機械が持つ

**0031 の決定 5 が本番でも固定の利用者を許した条件は、この決定で消える。**
あちらの根拠は「外周は Basic 認証が持っているので、禁じても二重の守りにならない」だった。
#68 が Basic 認証を外すので、外周を持つのはログインだけになる。
フェイクのエンドポイントが本番で開いていれば、許可リストに載った email を名乗るだけで他人のリソースへ到達できる。

**運用の規律で持つ案を採らなかった条件**: 0031 が規律で持つと決めたのは Basic 認証を外す順序で、あれは一度きりの手順である。
`TOIITO_FAKE_LOGIN` は環境変数なので、Preview へ入れるついでに Production へも入る形の間違いが繰り返し起こりうる。
繰り返す間違いは機械が止める。

**`NODE_ENV` で見分けなかった条件**: Vercel の Preview も `NODE_ENV=production` で走る。
Preview はフェイクを使う側なので、`NODE_ENV` で止めると Preview が動かなくなる。

### 決定 4 — トークンは書き込む直前に取り除く

`databaseHooks.account.create.before` が返した `data` は、`dist/db/with-hooks.mjs` が元のデータへ重ねてからアダプタへ渡す。
だから null を明示すると、`account` 表へ入るのは null になる。

**`updateAccountOnSignIn` も同時に false にする条件**: 既定の true のままだと、二回目以降のサインインで `dist/oauth2/link-account.mjs` が `updateAccount` を呼び、そこで新しいトークンが入る。
`create.before` は作成時にしか走らないので、片方だけでは塞げない。

**`encryptOAuthTokens` を有効にする案を採らなかった条件**: 暗号化しても保存はする。
このアプリは Google の API を呼ばないので要るのは同一性だけで、使わない資産を暗号化して持つ理由が無い。

**`account` 表から列ごと消す案を採らなかった条件**: 0031 の決定 1 が「四表は `getAuthTables` が返す定義のまま置く」と決めている。
列を消すと Better Auth が版を上げるたびに差分が出る。

### 決定 5 — `proxy.ts` は役割を替えて残す

0029 の決定 5 は `proxy.ts` に役割を与えている。
#68 の本文が「落とす」と書いたのは Basic 認証のことで、0013 の覆る条件（「#68 が入ったら外す」）が指しているのも Basic 認証である。
判定の実体（`src/lib/basic-auth.ts`）は削除し、`proxy.ts` は cookie の有無を見る形へ書き換える。

**ページ側の redirect だけで済ませて `proxy.ts` を削除する案を採らなかった条件**: 0029 の決定 5 が「入口は導線であって関門ではない」という役割分担を決めており、その導線が消える。
未サインインのリクエストが RSC の描画まで進んでから redirect すると、DB への往復が一回入る。

**入口で DB を照合する案を採らなかった条件**: 0029 が既に落としており、条件は動いていない。
0013 が matcher を書かないと決めているので、全リクエストに DB の往復が乗る。

### 決定 6 — 受け皿の行は、サインインより後に片付ける

`accountLinking.enabled: false` の下では、同じ email の行が先に在るとサインインそのものが拒否される。
だから受け皿の行に Google の email を入れた状態は、**問いが見えなくなる状態ではなく、入れなくなる状態**である。

**`accountLinking.enabled: true` にして紐づける案を採らなかった条件**: 0029 の決定 6 が無効と決めている。
加えて 1.7.2 は `accountLinking.requireLocalEmailVerified` が既定で true なので、有効にしても受け皿の行（`emailVerified` が false）には紐づかない。
紐づけるには行の `emailVerified` も true にすることになり、外部で検証していない値を検証済みとして書き込むことになる。

**受け皿の行を先に削除する案を採らなかった条件**: `questions.user_id` は NOT NULL の外部キーなので、問いの持ち主が居なくなる。
付け替えてから削除する順序でしか消せない。

### 決定 7 — 未サインインは undefined で表す

ログインが入ると、未サインインは異常ではなく通常の状態になる。
throw で表すと、呼び出し側は例外を捕まえて redirect することになり、通常フローの分岐に例外を使う形になる。

**`getCurrentUser` が直接 redirect する案を採らなかった条件**: `/login` の画面自身が「既にサインインしていれば `/` へ送る」ために現在の利用者を知る必要がある。
redirect が中に入っていると、その画面から呼べない。

## 帰結

- **`TOIITO_SINGLE_USER_EMAIL` が消え、`TOIITO_ALLOWED_EMAILS` と `TOIITO_FAKE_LOGIN` が入る。**
  Google の 2 本（`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`）と Better Auth の 2 本（`BETTER_AUTH_SECRET` / `BETTER_AUTH_URL`）も足される。
  `web/README.md` の表と `docs/DEPLOY.md` の 2 つの表が動く
- **0031 の決定 5 が終わる**。
  覆る条件の「#68 が入ったら」が発火した。
  `TOIITO_SINGLE_USER_EMAIL` は Preview と E2E に残ると書かれていたが、決定 1 で名前ごと置き換わる
- **0013 の覆る条件が発火する**。
  Basic 認証は外れ、`TOIITO_BASIC_AUTH_USER` と `TOIITO_BASIC_AUTH_PASSWORD` が本番と Preview の両方から消える
- **`docs/DEPLOY.md`「唯一のユーザーの行を入れる」が「サインインしてから問いを付け替える」へ変わる**。
  同じ節の「email はログインに使う Google アカウントのものにしておく」は、決定 6 で逆になる
- **`db.ts` が Prisma のクライアントを一つ export する**（`authDatabaseClient`）。
  Better Auth のアダプタがクライアントそのものを要求するためで、`docs/ARCHITECTURE.md`「技術スタック」の禁止則（Prisma を repo 層の外へ出さない）に対する唯一の例外になる。
  アプリと同じクライアントを返すので接続プールは 1 本のままである
- **`auth()` は関数で、最初の呼び出しまで環境変数を読まない**。
  `next build` がルートハンドラのモジュールを評価して設定を集めるので、モジュールの評価時に読むと認証の環境変数を持たない CI でビルドが失敗する
- `biome.json` の `noRestrictedImports` の除外が 4 ファイルになる（`auth.ts` / `auth-fake-login.ts` / `current-user.ts` / `app/api/auth/[...all]/route.ts`）
- **0022 の決定 8 の「移行の順序」は動かない**。
  述語が `TOIITO_ALLOWED_EMAILS` の配列から DB のフラグへ移るときの 4 段は、そのまま効く

## 覆る条件

- **Preview で本物の Google OAuth を通せるようになったら。**
  決定 1 のフェイクが要る理由の半分（Preview の URL が PR ごとに変わる）が消える。
  もう半分（E2E で二人分の利用者と未サインインを作る）は残るので、自動的にフェイクが消えるわけではない
- **本番が Vercel 以外へ移ったら。**
  決定 3 は `VERCEL_ENV` を見ているので、見分ける材料を選び直す
- **Google 以外のプロバイダを足すとき**（#133（捨てアカウント枠））。
  0029 の決定 6 と一緒に、決定 6 の「同じ email の行が先に在ると拒否される」も見直す
- **許可リストを廃止してアカウント登録制へ移すとき。**
  0022 の決定 8 の有効期限がそこで来る。
  決定 2 の変数はそのとき消える
- **Better Auth が 1.8 系へ上がったら。**
  決定 4 と決定 6 が読んだのは 1.7.2 の `dist/` である。
  `oauth2/link-account.mjs` の紐づけの条件と `db/with-hooks.mjs` の重ね方を読み直す
- **未サインインでも読めるページを作りたくなったら。**
  決定 5 と決定 7 が「保護されていないページが無い」ことを前提にしている
