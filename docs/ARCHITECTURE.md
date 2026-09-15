# ARCHITECTURE — トイット（Toiito）

`VISION.md` を土台に起こしたシステムアーキテクチャ。
VISION の設計原理が上位。
ここが持つのは「どう作るか」の現況で、「なぜ作るか」は `VISION.md`、「なぜそう決めたか」は `adr/` が持つ。

## 技術スタック（確定事項）

- **Next.js (App Router) + TypeScript** — UI と API を一体で持つ。
  `web/` 配下
- **Vercel（Hobby）** — 本番の実行環境。
  Hobby は非商用限定なので、他人へ開いて収益化する段になったら必ず一度決め直す（選定の経緯は `adr/0002-production-runtime.md`）
- **Postgres + Prisma** — 永続化。
  開発も本番も同じ方言に揃える。
  ローカルは `compose.yaml` の Postgres、本番は Neon（手順は `DEPLOY.md`）
- **Claude API（Anthropic）** — 二体 AI の対話生成。
  Server Actions（サーバー側）からのみ叩く。
  呼び出し規約は `lib/ai/` がプロバイダ非依存の形で持ち、固有の値域と API の作法は `lib/ai/anthropic.ts` に閉じる（経緯は `adr/0021-ai-provider-scope.md`）
- **Better Auth（自前ホスト）** — 認証。
  Google OAuth 一本で、パスワードも OAuth のトークンも持たない。
  入れるのは `TOIITO_ALLOWED_EMAILS` に載ったメールアドレスだけ（経緯は `adr/0036-auth-better-auth.md`）。
  セッションはログインから 1 日で必ず切れ、使っても延びない
- **固定ペルソナ二体** — 定義は `web/src/personas/` の二枚

境界の禁止則（Prisma を触るモジュール・`process.env` を読むモジュール・所有者の判定・セッションの設定・実行環境に依存しない道具）の正は `.claude/rules/layers.md`。
理由と経緯は `adr/0003-persistence-prisma-postgres.md`（永続化）・`adr/0022-session-security.md`（セッション）・`adr/0030-ownership-granularity.md`（所有権）が持つ。
起動に外部プロセス（Postgres）が要ることは引き受けた前提で、ローカル完結性は捨てている。

## システム全体像

```
ブラウザ (Next.js UI)
   │  Server Actions
   ▼
Next.js サーバー層 ──── Claude API（二体のシステムプロンプトを切替えて逐次呼出）
   │
   ▼
Postgres（questions / sessions / messages / pending_messages / memos / memo_links ＋ Better Auth の四表）
```

単一 Web アプリ。
マイクロサービス的分割はしない（個人用の発酵槽に分散は過剰）。
AI 呼び出しは Server Action の中で二体分を同期で待つ（ストリーミングは `adr/0026-defer-streaming.md` で見送り、設計は `extensions/streaming.md`）。

### DB への書き込み経路

書き込みはアプリのロジック（`web/src/lib/db.ts` の repo 関数）を通す。
UI からの経路も、Next の外から走るもの（開発用シード `web/scripts/seed/` など）も、同じ関数を使う。
経路を分けると、アプリで起きること（検証・付随する行の作成・順序）が投入したデータでは起きず、画面で確かめている状態が実際の状態とずれる。

例外は、通常の経路では作れない状態を作るとき（壊れたデータの再現、移行前の形）。
そのときは Prisma を直に触ってよいが、repo 関数と混ぜず、その用途だと分かる別のモジュールへ置く。
`db.ts` の「この層の外へ Prisma を出さない」は混ぜないための境界であって、直に触ること自体の禁止ではない。
その用途のモジュールはいま無い。

## データモデル（発酵の地層構造）

VISION の「対話は堆積して振り返れるもの」をそのままスキーマにする。

```
user           ユーザー。Better Auth が持つ表
  id, email, name, is_admin(管理者か。既定は偽。立てるのは DB への直接の更新だけ)

questions      問い。発酵槽への仕込み単位
  id, user_id, body(原型・不変), current_form(現在の形・可変), status, created_at

sessions       一つの問いに対する対話セッション（複数回ありうる＝再訪）
  id, question_id, started_at

messages       発話。人間 + AI二体の三者
  id, session_id, speaker(human/ai_a/ai_b), body, created_at

pending_messages  送信されたが一往復が完了していない人間の発話。1 セッションに 1 行
  session_id(主キー), body, created_at

memos          キーワードメモ。文字選択で残す
  id, message_id, anchor_start, anchor_end, keyword, note, created_at

memo_links     （将来）メモ間・問い間のリンキング辺
  id, from_memo_id, to_memo_id, kind

materials      問いに付随する材料で、誰の発話でもない。二体 AI へは渡さず、人間だけが読む（画面の語では培地）
  id, question_id, kind(internal/external/isomorph), topic(論点。同じ値の行が立場の違う材料の組), body, source_url, created_by(auto/human), created_at
```

### 所有権

`user_id` を持つのは**所有のルートだけ**で、いまは `questions` 一つである。
`sessions` / `messages` / `memos` は持たず、所有者は親から辿る。
下位にも持たせない理由と、却下した案は `adr/0030-ownership-granularity.md`。

**絞り込みは `db.ts` の repo 関数が行う**。
UI 側でやらない。
入口の `proxy.ts` は cookie の有無しか見ない楽観的な判定なので、**他人のリソースを弾く最後の層は repo 関数になる**。

**現在のユーザーを返すエントリポイントは `lib/auth/current-user.ts` の `getCurrentUser` 一つ**で、RSC と Server Action は `requireCurrentUser` を通ってから repo 関数を呼ぶ。
戻り値の `id` には印（`OwnerId`）が付いており、repo 関数は所有者としてその型しか受け取らない。
中身は Better Auth のセッションが指す `user` 行で、未サインインなら `getCurrentUser` が undefined を返し、`requireCurrentUser` が `/login` へ送る。
入れるのは `TOIITO_ALLOWED_EMAILS` に載った email だけで、照合はサインインのときに一度だけ走る（理由は `adr/0022-session-security.md`）。
Google を経ないサインイン（`TOIITO_FAKE_LOGIN=1`）は Preview と E2E だけが使い、本番に設定されていればビルドが失敗する。

認証まわりの四表（`user` / `session` / `account` / `verification`）は Better Auth が持ち、モデル名も列名も生成されたままにする。
**Better Auth の `session` は対話の `sessions` と別物である**——前者はログイン、後者は問いへの再訪。
Prisma のモデル名が一意でなければならないので、`Session` を名乗るのは Better Auth の側で、対話の側は `DialogueSession` と綴る（表も列もドメイン型も動いていない）。

### 原型と現在の形

`questions.body` は**原型**で、投入された生の問いを以後書き換えない。
言い直し・分割後の焦点は `current_form` に持つ。
表示は現在の形が勝ち、無ければ原型に落ちる（`questionText()`）。
二体 AI には両方を渡す。
原型を失うと元の問いが検証不能になるので一本にまとめない（経緯は `adr/0034-original-form-and-current-form.md`）。

### 問いの状態機械

7 値。
比喩は選び直しうるが enum の変更は本番の DB を動かすので、**値は比喩を持たない一般語で持ち、比喩は UI のラベルだけが持つ**。
ラベルの正は `VISION.md`「語彙」節で、比喩が動いてもそちらの列だけが動く。

| status | 意味 |
|--------|------|
| `new` | 仕込んだが、まだ材料が付いていない |
| `stocked` | 材料が付き、蒸留に入れる |
| `resolved` | 答えが出て閉じた。別の置き場へは書き出していない |
| `exported` | 答えが出て、別の置き場へ書き出した |
| `holding` | 持ち続ける問い。答えが出ないことは欠陥ではない |
| `permanent` | **閉じないことが正しい問い**。閉じ候補として催促しない |
| `discarded` | 棄却。積極的に追わないという判断だけを指す |

値域は二箇所で表明する。
DB 側の正は `prisma/schema.prisma` の enum `QuestionStatus`、アプリ側の正は `web/src/lib/question.ts` の `QUESTION_STATUSES`（型と UI ラベルがここから派生する）。
両者がずれると repo 関数の戻り値がドメイン型へ代入できなくなり `tsc` が落ちるので、**ずれは L0 で捕まる**。

| 遷移 | 動かす主体 | 契機 |
|------|-----------|------|
| `new` → `stocked` | 機械（`db.ts` の `addMaterials`） | `status` が `new` の問いに、`materials` の行が 1 件以上入ったとき |

人間が選んだ値を材料の有無だけで書き換えないので、`new` 以外の問いに材料が付いても `status` は変わらない（理由は `adr/0038-question-status-transitions.md`）。

### メモとアンカー

- **逆引き**は `memos → messages → sessions → questions` の join 一本（`listMemosWithContext`）。
  メモ一覧はメモの数だけ問いを引きに戻る形になりやすいので、N+1 に割らない
- アンカーはメッセージ本文内の文字オフセット（`anchor_start/end`）。
  メッセージは immutable（追記のみ・編集しない）なのでオフセットが腐らない
- `memo_links` はテーブルだけ切ってあり、実装は無い（構想は `extensions/graph-view.md`）

### 再訪と、過去セッションの読み方

再訪は「そういえばあの件についてまた話したい」であって、前の対話の続きではない。
文脈のリセットという機械的な操作でもない。
**忘却は起きるが、痕跡は見える**というのがこのアプリの温度で、実装はそれを次の四つに割る。

- **AI は前のセッションを見ない**。
  `callPersona` へ渡すのは `listMessages(session_id)` だけ。
  引き継ぎたい対話は、新しいセッションを始めずにそのまま続ける方が要求に合っている
- **画面が一度に描くセッションは一つ**。
  既定は最新で、`/q/<question_id>?s=<session_id>` が過去セッションを指す
- **過去のセッションは読み取り専用**。
  発話フォームを出さず、最新へ戻る導線だけを残す。
  過去へ発話を足せると、どのセッションの話なのかが読み返しの側から復元できなくなる
- **切り替えの一覧はメモのキーワードを手掛かりに添える**（`listSessionsWithKeywords`）。
  日付だけの一覧では、どのセッションだったかを思い出せない

メモからの逆引きは `?s=` でセッションを名指しする。
無いと問いの画面へは飛ぶが、最新セッションが描かれて着地先の発話が DOM に無い。

## 二体 AI のオーケストレーション（超相対性理論モデル）

- ペルソナは **具体派（ai_a）** と **抽象派（ai_b）** の固定二体。
  定義は `web/src/personas/` にシステムプロンプトとして置く（コードでなく文書として管理）
- 発話順は「人間 → ai_a → ai_b」を基本としつつ、直前の流れを両体のプロンプトに全量渡す（三者が同じ場を見ている状態を作る）
- **最重要制約の実装位置**: 「答えを与えない」はモデル任せにせず、ペルソナのシステムプロンプトに否定形制約として明記する。
  破られたら人間が観察できる（メモを残せる）ことが検知機構を兼ねる
- **「答えを与えない」の検査できる形**は「**一方向に閉じた材料を出さない**」で、対立を必ず添える / 出典を添える / 一度に最大 3 件 / 未検証なら明示する、の 4 項。
  ペルソナ両体の「材料の供給規律」節がこれで、節の有無は `tests/personas.test.ts` が検証する（経緯は `adr/0035-no-one-sided-material.md`）
- **手筋のカタログ**。
  性格（具体派 / 抽象派）だけでは同じ角度からしか掘れないので、問いを動かす操作を型として両体に持たせる。
  ai_a = 出自の具体を聞く / 判定基準を要求する / 反例と境界事例。
  ai_b = 語の同一性を疑う / 変数を分解する / 前提を名指す / 別領域の同型。
  重複させない（分業が崩れると二体である意味が消える）
- 一回の人間発話につき AI 呼び出しは二回（ai_a → その出力込みで ai_b）。
  ai_b は ai_a への応答であることに意味がある（衝突と転位）ので、並列にしない

## ディレクトリ構造

```
toiito/
├── CLAUDE.md          プロジェクト規約
├── docs/              このリポジトリの文書と adr/
├── extensions/        MVP の外の構想
└── web/               Next.js アプリ本体
    ├── src/
    │   ├── app/           ルーティング（/ 問い一覧・/q/[id] 対話・/memos 逆引き・/login・/admin 管理者だけが開くユーザーの一覧）と Server Actions
    │   ├── components/    UI 部品（共通部品は ui/）
    │   ├── lib/           db.ts（Prisma repo 層）・auth/（認証と現在のユーザー）・ai/（AI 呼び出し）・personas.ts・anchors.ts・question.ts・turn.ts
    │   ├── personas/      二体のシステムプロンプト（.md で管理）
    │   ├── proxy.ts       全リクエストの入口。cookie が無ければ /login へ送る
    │   └── generated/     Prisma クライアント（生成物・gitignore）
    ├── scripts/           node が直接読む開発用スクリプト（pnpm seed・コメント検査・migration）
    ├── tests/             Vitest
    ├── e2e/               Playwright
    └── prisma/            schema.prisma（スキーマの正）と migrations/
```

## 意図的にやらないこと

- **快適さの最適化**。
  このアプリは少し使い心地が悪くないと機能しない類型に属し、快適にした瞬間に快適さが目的化してスローダウンという効果が死ぬ。
  体験改善の要求が出たら、**摩擦の除去**（疑う）と **妨害の除去**（直す）を毎回切り分ける。
  線引きは `DESIGN.md`「残す摩擦」、理由は `extensions/fermentation-and-outlets.md`「設計上の自己言及: 反快適性」
- KPI・利用統計・ゲーミフィケーション（速度を最適化しない）
  問いの熟成を速度で測らないという不作為なので、ユーザーに見せず管理者だけが見る運用の記録（`/admin` のユーザーごとの数と利用量）はこれに当たらない
- 問いの「解決済み」クローズフロー（チケットではない）
- **公開登録**。
  入れるのは許可リストに載ったメールアドレスだけで、誰でも登録できる形は開けない（経緯は `adr/0018-invite-only-multi-user.md`）
- **パスワード認証**。
  パスワードハッシュは漏れたら他サービスまで巻き添えにするので、守るのではなく資産ごと持たない。
  入口は Google OAuth 一本
