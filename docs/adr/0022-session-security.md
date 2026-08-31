# 0022. セッションの守りを既定に委ねず、明示と実際の応答で持つ

- **状態**: 採用
- **決定日**: 2026-09-01
- **関係する ADR**: 0013, 0015, 0018, 0019

## 文脈

0019 が決めたのは**認証の方式**であって、**セッションの守り方**ではない。
リポジトリを検索しても `CSRF` / `XSS` / `SameSite` / `HttpOnly` / セッション固定に触れた記述は一つも無かった（#149（セッションと認証まわりの守り方を決める）が確認）。

パスワードを持たない決定（0019 決定 2）と OAuth のトークンを保存しない決定（同 決定 8）で、漏れたときに他サービスまで巻き添えにする資産は消えている。
残っているのは**セッションそのものを盗られる・使い回される**経路で、こちらは方式の選択では消えない。

下の決定はどれも #68（ログイン（Google OAuth）とリソースの所有権）の実装の形を変えるので、後から決めると配線をやり直すことになる。

**Better Auth はまだ依存に入っていない**（`web/package.json` に無い）。
だから下の判断は、上流の文書と、npm の配布物（`better-auth@1.7.2` の `dist/`）を読んで確かめた。
版は 0019 が固定した 1.7.2 のままである（2026-09-01 に npm の `latest` で確認。2026-08-26 公開・MIT）。

**確かめる過程で、上流の文書だけに依拠できないことが分かった。**
三つ出ている。

- Cookies ページは「All cookies are `httpOnly` and `secure` when the server is running in production mode.」と書いており、`httpOnly` まで production 条件のように読める。
  実装（`dist/cookies/index.mjs` の `createCookieGetter`）は `httpOnly: true` を無条件で立てており、条件が掛かっているのは `secure` だけである
- Session Management ページは `cookieCache` について、隣り合う段落で逆のことを書いている（下の「決めなかったこと」）
- `rememberMe`（セッションを覚えないという口）は `/sign-in/email` のリクエストボディにしかなく、OAuth の経路からは届かない。
  文書のどこにもその限定は書かれていない

## 決定

1. **cookie の属性を明示する。**
   `advanced.defaultCookieAttributes` に `httpOnly` / `secure` / `sameSite` の三つを書く。
   値は 1.7.2 の既定と同じ `true` / `true` / `lax` から始める。
2. **属性が実際の応答に乗っていることを検査する。**
   決定 4 と同じ層に置く。
3. **セッションの寿命を `expiresIn` 1 日（86400 秒）にし、`disableSessionRefresh: true` を立てる。**
   使い続けても期限は延びない。
   ログインから 1 日で必ず切れる。
4. **CSRF が実際に効いていることを、二つの層で確かめる。**
   `web/e2e/`（退行を機械が捕まえる）と `DEPLOY.md` の curl（本番の実体を見る）。
5. **ログインをまたぐ自前の識別子を作らない**（禁止則）。
   匿名セッション・未ログインの下書きの引き継ぎ・自前の「戻り先」cookie に識別子を載せる綴りを入れない。
6. **Preview の露出を引き受ける。**
   0019 決定 7 のフェイク認証だけにし、Basic 認証は #68 で予定どおり外す。
   **引き受ける条件は「Preview に本番のデータが無いこと」**で、条件が崩れればこの決定も崩れる。

### 決めなかったこと

**`cookieCache` と `deferSessionRefresh` の扱い**、および**許可リストの判定頻度**は、ここでは決めない。
#149 に残す（規約 5——未決の論点は issue が持つ）。

材料だけ置いておく。

- `cookieCache` を有効にすると、**0019 決定 4 の理由が黙って消える**。
  0019 が JWT を採らなかった条件は「発行済みを取り消せないので、#69（管理機能）の停止が次の期限切れまで効かない」だった。
  `cookieCache` は同じ性質を DB セッションへ持ち込む——上流の注意書きは「When `cookieCache` is enabled, revoked sessions may remain active on other devices until the cookie cache expires (`maxAge`).」と書き、理由に「The server cannot directly delete cookies from other devices」を挙げている。
  **同じページの二段落上には「If a session is revoked or expires, the cookie will be invalidated automatically.」と逆のことが書いてある。**
  上流の記述が割れている以上、「上流がそう書いているから安全」という形の根拠はここでは立たない
- `deferSessionRefresh` は**性質が違う**。
  DB は毎回引くので失効の即時性は落ちず、落ちるのは期限延長のタイミングだけである。
  同じ理由では禁じられない。
  別の理由（この器の DB は Neon 一本でリードレプリカを持たないので、有効化する理由がそもそも無い）なら立つ
- 許可リスト（0018 決定 3）は**いつ照合するかが決まっていない**。
  サインイン時だけなら `databaseHooks.session.create.before` が使え（上流は「If the hook returns `false`, the operation will be aborted.」と書く）、毎リクエストならアプリ側の `getSession` ラッパに置く。
  後者は `proxy.ts` を触らないので、**0019 決定 5（入口は cookie の有無だけを見る）とは噛まない**

## 理由

**決め手は、この器で同じ型の失敗が二度出ていることだった。**

一度目は 0013（2026-08-29）である。
本番の Vercel Authentication（Standard Protection）が production の domain を守っておらず、同じ ADR がもう一つ拾っている——旧 `middleware` 規約の Edge ランタイムでは `process.env` が空になり、**素通しへ倒す分岐だけが生き残る**形になっていた。

二度目は #152（main の ruleset が enforcement: disabled で、誰にも効いていない）である（2026-08-31）。
規則の中身は `HARNESS.md` の記述どおり正しく揃っていて、**スイッチだけが入っていなかった**。
2026-08-22 から 2026-08-31 まで誰も気付かず、その間に PR を経ない直 push が 2 件 main へ入っている（うち一件は `feat:` で、`package.json` のスクリプトと migration の経路を触っている）。

二度に共通するのは、**書いた内容は正しく、効いているかどうかが差分に残らない場所にあった**ことである。
CSRF はコードの中にあるので設定そのものは diff に残るが、「実際に効いていること」は同じく差分から読めない。
**この形の未確認には前科が二つある**ので、三度目を引き受けない。

**cookie の属性を既定に委ねなかった条件**: 既定に委ねるとは、三つのうち `sameSite` だけが文書に、`secure` が曖昧に、`httpOnly` が実装にしか無い状態に依拠することである（上の文脈）。
版が上がって既定が動いたとき、何に依拠していたかを誰も言えない。
対価は、上流が既定を強める方向へ動いたとき（`sameSite: "strict"` が既定になるなど）にこちらが取り残されることだが、それは決定 2 の検査が属性を読み上げる形で残るので、気付ける側に倒れる。

**`useSecureCookies: true`（`secure` を常に立てる）を採らなかった条件**: 手元の `pnpm dev` は http なので、立てるとログインできなくなる。
1.7.2 は `baseURL` のプロトコルと `isProduction` から `secure` を導き、真なら cookie 名に `__Secure-` を付ける（`dist/cookies/index.mjs`）ので、本番では明示しなくても立つ。
明示するのは値を版から切り離すためで、条件を変えるためではない。

**`expiresIn` を既定の 7 日のままにしなかった条件**: 既定は「最後に使ってから 7 日」であって「ログインしてから 7 日」ではない。
上流は「whenever the session is used and the `updateAge` is reached, the session expiration is updated to the current time plus the `expiresIn` value」と書いており、常用する器では実質的に無期限になる。
問いは私的なので、共有端末に開きっぱなしのブラウザがある状態を無期限では引き受けない。
`ARCHITECTURE.md`「快適さの最適化をしない」の切り分けに照らすと、一日一回のログインは**妨害ではなく摩擦**の側にある。

**`rememberMe` で窓を縮める案を採らなかった条件**: 採れないことが分かった。
`rememberMe` は `/sign-in/email` のリクエストボディにしかなく（`dist/api/routes/sign-in.mjs`）、OAuth の経路は `createSession(user.id, void 0, ...)` と第二引数を渡さない（`dist/oauth2/link-account.mjs`）。
callback 側も `setSessionCookie(c, { session, user })` で `dontRememberMe` を渡さないので、cookie は `maxAge = expiresIn` の永続 cookie になる。
**0019 決定 3 が Google OAuth 一本と決めた以上、窓を縮めるレバーは `expiresIn` だけである。**

**`freshAge`（機微な操作の再認証の閾値・既定 1 日）を触らなかった条件**: いまこの器に「機微な操作」に当たる口が無い。
加えて `expiresIn` を 1 日にしたので、セッションは常に `freshAge` の内側に収まり、閾値そのものが発火しない。
#69（管理機能）が機微な操作を作る回に戻る。

**セッション ID を回すという決定を置かなかった条件**: 回すも回さないも無かった。
`dist/db/internal-adapter.mjs` の `createSession` は毎回 `token: generateId(32)` を新規に発行し、既存の cookie の値を引き継ぐ経路が無い。
OAuth の callback も同じ `createSession` を通る。
**ログインの前に攻撃者が仕込める識別子がそもそも存在しない**ので、古典的なセッション固定は構造上成立しない。
決定として書けるのは、その性質をこちらが壊さないという禁止則の側だけである（決定 5）。
0018 が anonymous を採らなかった条件（招待は宛先を要求し、anonymous は識別子を持たない）に、これで理由が一本増える——Better Auth の `anonymous` プラグインは匿名セッションをログイン後の利用者へ引き継ぐことが役目なので、決定 5 と正面から噛む。

**CSRF の検査を `web/tests/`（単体）に置かなかった条件**: 置く対象が無い。
判定を持っているのは Next と Better Auth であって、この器のコードではない。
守っているのは二つの別の機構である——Better Auth の口（`/api/auth/*`）は Origin 検証・`SameSite=Lax`・Fetch Metadata が守り、Server Actions は Next が守る（16.3.3 の文書は「Next.js compares the origin of a Server Action request with the host domain, ensuring they match to prevent CSRF attacks.」と書く）。
どちらも純関数として切り出せないので、**実際のリクエストでしか見えない**。

**`web/e2e/` だけに置かなかった条件**: 0013 が同じ判断を Basic 認証で通っている。
e2e は退行を捕まえるが、**Vercel のランタイム差を再現しない**——0013 の一度目（Edge の `process.env`）はまさにそこから見えない場所にあった。
本番の URL を直接叩く curl だけがそれを捕まえられるので、デプロイの手順に組み込む。

**Preview の露出を引き受けなかった側に倒さなかった条件**: 露出の中身が、Preview に本番のデータが無いという構造で既に限定されている。
#111（Preview の Basic 認証がブランチごとに手入力を要求する）の実測（2026-08-29）はこうである——Preview は二重に守られており、外側の Vercel Authentication は `?_vercel_share=<トークン>` 付きの共有リンク一本で抜ける（有効 23 時間）。
実際にこの経路で外側を抜け、内側の Basic 認証が 401 を返すことまで確かめてある。
だから内側を外すと、漏れた共有リンクがそのままアプリの中身に届く。
届いた先にあるのは、`pnpm seed` の内容と Preview ブランチで作った実験データだけである（0015 が `Branch schema only` で切ると決めている）。
書き込みもできるが、`TOIITO_FAKE_AI=1` なので AI の費用は走らない（`DEPLOY.md`「Preview」）。
**0019 決定 7 はこれを引き受けるとは書いていなかった**ので、ここで書く。

**Basic 認証を Preview だけ併存させる案を採らなかった条件**: 露出は塞げるが、#111 の摩擦（ブランチごとに一度の手入力）がそのまま残る。
Basic 認証のダイアログはブラウザのクロムでページの DOM ではないので、パスワードマネージャは原理的に埋められない（#111 が 2026-08-29 に実機で確認）。
加えて 0013 の覆る条件「#68 が入ったら外す」に、Preview だけの例外を作ることになる。
**採る条件**: Preview に本番のデータが載る形へ変わったとき。

**Preview で本物のログイン画面を出す案を採らなかった条件**: 0019 が既に落としており、却下の条件が今も生きている。
Google の redirect URI は事前登録が要りワイルドカードを受け付けないので、PR ごとに変わる Preview の URL に追いつかない。
加えて #68 の E2E 要求（二人分の利用者で他人のリソースが見えないことを見る）を、実 OAuth では自動化できない。

**共有リンクを発行しない運用にする案を採らなかった条件**: 発行しなければ漏れないが、これは運用の約束であって機械が守らない。
0013 が学んだのは、設定でなく約束に頼った状態が「掛けたつもり」を作ることだった。
単独では採らない。
決定 6 に足す注意としてなら成り立つので、`DEPLOY.md` の側で扱う。

## 帰結

- `ARCHITECTURE.md` に「セッションについて今も効く禁止則」が入る（決定 5）
- **#111 は、この ADR の決定 6 で閉じる。**
  #111 の三候補（引き受ける / 明示のオプトアウト / cookie 形へ差し替え）はいずれも Basic 認証の話で、#68 が入れば 0013 の覆る条件が発火して対象ごと消える。
  つまり #111 は #68 の到着で自動的に閉じる issue だった
- **0013 は覆らない。**
  覆る条件の一つ目（#68 が入ったら外す）が変わっておらず、決定 6 はその予定を Preview にも適用すると確認しただけである
- **0019 は supersede しない。**
  決定 7（Preview と E2E はフェイク認証）は動いておらず、書かれていなかった引き受けの条件をこの ADR が足している
- **#68 の「作るもの」が増える。**
  cookie 属性の明示（決定 1）・`expiresIn` と `disableSessionRefresh`（決定 3）・`web/e2e/` の検査（決定 2・4）・`DEPLOY.md` の curl（決定 4）
- `web/e2e/` に認証の検査が入る。
  資格情報を持つサーバーを別に立てる形は `web/e2e/basic-auth.spec.ts` が先例を持っている
- **#150（器の外周の守りを決める）の決定 5（`revokeOtherSessions`）は、#149 に残した `cookieCache` の扱いに従属する。**
  有効なまま切る口だけ出しても、`maxAge` の間は切れない
- **#149 は開いたまま残る。**
  `cookieCache` / `deferSessionRefresh` の扱いと、許可リストの判定頻度がまだ決まっていない

## 覆る条件

- **Preview に本番のデータが載ったら。**
  決定 6 の引き受ける条件がそこで崩れる。
  0015 の `Branch schema only` を変える判断は、この決定を同時に動かす
- **`expiresIn` 1 日の摩擦が常用を妨げたら。**
  判断は L5 の官能で、実際に一日一回入り直してから決める。
  そのとき伸ばす側へ戻すが、無期限（`disableSessionRefresh` を外す）へは戻さない
- Better Auth の既定が動いて、決定 1 で明示した値と食い違ったら。
  明示している以上こちらの値が勝つが、上流が既定を強めたのなら追随を検討する
- **未ログインの状態で何かを書けるようにしたくなったら。**
  決定 5 の禁止則がそこで代償になる。
  そのとき禁止則を外すのではなく、ログインをまたがない形（下書きをサーバーへ持たない）で解けるかを先に見る
- CSRF の検査が、実装してみて Next と Better Auth のどちらの機構も再現できないと分かったら。
  決定 4 の層をどこへ動かすかを決め直す
- **#149 に残した二つが決まったら。**
  `cookieCache` を禁じるなら禁止則が一本増え、許可リストを毎リクエスト見るなら `getSession` の経路を一本に絞る規律が要る。
  どちらもこの ADR の決定を覆さないが、`ARCHITECTURE.md` の禁止則は増える
