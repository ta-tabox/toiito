# セキュリティヘッダは全経路に静的に付け、スクリプトを絞る CSP は入れない

- **状態**: 採用
- **決定日**: 2026-11-14
- **関係する ADR**: 20260828-production-runtime, 20260829-production-basic-auth

## 文脈

アプリの応答には、決定時点でセキュリティヘッダが一つも付いていない。
セキュリティヘッダは、サーバーが応答に付けてブラウザが従う規則で、別のオリジンや途中の経路から読み手のブラウザに意図しない動作をさせる攻撃を防ぐ。

候補と、このアプリでの状況は次のとおり。

| ヘッダ | 防ぐもの | このアプリでの状況 |
|---|---|---|
| CSP の `script-src` | XSS の穴から入ったスクリプトの実行 | Next がインラインのスクリプトを埋め込むので、リクエストごとの nonce が要る |
| CSP の `frame-ancestors` | 他サイトの iframe に埋め込んで押させる攻撃 | 静的な値で付けられる |
| CSP の `object-src` | プラグインの埋め込みによるスクリプトの実行 | 静的な値で付けられる |
| CSP の `base-uri` | 差し込まれた `<base>` による相対 URL の書き換え | 静的な値で付けられる |
| CSP の `form-action` | フォームの送信先の書き換え | Google のサインインがフォームの送信後に Google へリダイレクトする |
| `X-Frame-Options` | 他サイトの iframe に埋め込んで押させる攻撃 | `frame-ancestors` の旧版 |
| `X-Content-Type-Options` | 応答の種類の推測による実行 | 静的な値で付けられる |
| `Referrer-Policy` | 他サイトへ遷移元の経路が漏れること | 問いの経路（`/q/<id>`）が遷移元になる |
| `Cross-Origin-Opener-Policy` | 他オリジンのウィンドウからの `window` の参照 | サインインはポップアップでなくトップレベルの遷移である |
| `Permissions-Policy` | ページが使わないブラウザの機能の利用 | カメラ・マイク・位置情報を使わない |
| HSTS | http への引き下げ | 本番は Vercel の `*.vercel.app` に立っている |

決定時点のアプリのコードは、`dangerouslySetInnerHTML` も iframe も `<object>`・`<embed>`・`<base>` も使っていない。
画面の文字列は React がエスケープして描く。
画面の経路は、決定時点ですべて動的描画（`export const dynamic = "force-dynamic"`）である。

Vercel は `*.vercel.app` の応答に HSTS を付けると文書に書いている。
加えて、Chromium の HSTS preload リストはトップレベルドメインの `app` を下位のドメインごと HTTPS に限っているので、`*.vercel.app` は初回の接続から HTTPS になる。

## 決定

1. **全経路の応答に、次の四つを静的な値で付ける。**
   - CSP は `frame-ancestors 'none'; object-src 'none'; base-uri 'none'` を持ち、他サイトへの埋め込み・プラグインの埋め込み・`<base>` による書き換えを禁じる
   - `X-Content-Type-Options: nosniff`
   - `Referrer-Policy: strict-origin-when-cross-origin`
   - `Cross-Origin-Opener-Policy: same-origin`
2. **ヘッダはリクエストごとの処理を挟まず、アプリの設定で付ける。**
   決定時点の例は Next の設定（`next.config.ts` の `headers`）で、現況はコードが持つ。
3. **スクリプトの出所を絞る CSP（`script-src` と nonce）は入れない。**
4. **HSTS はアプリで付けず、ホスティングが付けていることを実際の応答で確かめる。**
   付いていなければ、アプリの設定で付ける。
5. **付いていることを、設定でなく実際の応答で確かめる検査を持つ。**
   検査は、未サインインのリクエストをログインの画面へ送るリダイレクトの応答も見る。
   決定時点でそのリダイレクトを返すのは Next の proxy（`src/proxy.ts`）で、現況はコードが持つ。
6. **CSP の `form-action` と `Permissions-Policy` は付けない。**

## 理由

- **`frame-ancestors` を `X-Frame-Options` より選ぶ理由**: W3C の CSP Level 3 は `frame-ancestors` が `X-Frame-Options` に優先すると定めており、現行のブラウザは `frame-ancestors` に従う
- **静的な値で付ける理由**: 四つとも値がリクエストに依らないので、`src/proxy.ts` で付けるとリクエストごとの処理だけが増える
- **`object-src` と `base-uri` を足す理由**: nonce なしの静的な値で付けられ、アプリがどちらの要素も使わないので、何も壊さずに XSS の経路を二つ減らせる
- **COOP を足す理由**: サインインはトップレベルの遷移で、他オリジンのウィンドウとの `window` の参照を使わないので、参照を切っても何も壊れない
- **スクリプトを絞る CSP を採らなかった条件**: 画面の経路は既に動的描画なので、nonce で失う静的なキャッシュは無い
  残る費用は、`src/proxy.ts` での nonce の生成と CSP の設定、静的な資源の扱い、E2E の追加である
  決定時点で XSS の入口（`dangerouslySetInnerHTML`）が無く、得られるのは穴ができたときの二段目の防御だけなので、その費用に見合わない
- **`form-action` を採らなかった条件**: Google のサインインはフォームの送信後に Google へリダイレクトし、送信後のリダイレクト先まで照合するブラウザではサインインが止まるおそれがある
- **`Permissions-Policy` を採らなかった条件**: アプリはカメラ・マイク・位置情報を使わず、Baseline でもないので、宣言して得る効果が小さい
- **HSTS をアプリで付けない理由**: ホスティングが HTTPS を強制しているなら、同じヘッダを二か所で持つことになる
- **リダイレクトの応答を検査する理由**: `next.config.ts` の `headers` が `src/proxy.ts` の返す応答にも付くかは、Next.js の文書に書かれていない
- **実際の応答で確かめる理由**: 20260829-production-basic-auth は、設定の上では効いている制限が、実際の応答では通っていたことを経験した

## 帰結

- `next.config.ts` が `headers` を持つ
- 実際の応答のヘッダを見る検査が一本増え、ログインの画面へのリダイレクトの応答も見る
  リダイレクトの応答にヘッダが付かないと分かったら、`src/proxy.ts` の返す応答にも付ける
- アプリを他サイトの iframe に埋め込めなくなる
  埋め込みが要る機能を足すときは、この決定を見直す
- `docs/ARCHITECTURE.md`「意図的にやらないこと」に、スクリプトを絞る CSP を入れないことが理由とともに入る

## 覆る条件

- 利用者の入力や AI の応答を HTML として描く経路（`dangerouslySetInnerHTML`・Markdown の HTML 描画など）を足したら
  スクリプトを絞る CSP を入れる
- 外部のスクリプト（解析・広告・埋め込み）を読み込むようになったら
  CSP で出所を絞る
- アプリを他サイトに埋め込む要求が出たら
  `frame-ancestors` に許すオリジンを足す
- サインインをポップアップ型へ切り替えたら
  COOP を `same-origin-allow-popups` へ変える
- カメラ・マイク・位置情報のどれかを使う機能を足したら
  `Permissions-Policy` で使う機能だけを許す
- 独自ドメインへ移り、ホスティングが HSTS を付けなくなったら
  アプリで HSTS を付ける
  Vercel の独自ドメインの既定値は `includeSubDomains` も preload も持たないので、値を決め直す
