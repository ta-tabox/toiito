# ADR — 決定と経緯の置き場

このリポジトリの決定は、1決定1レコードでここに置く。
`docs/ARCHITECTURE.md` が持つのは**現況**、`docs/ROADMAP.md` が持つのは**順序**、
`docs/HARNESS.md` が持つのは**検証**で、**なぜそう決めたか**を持つのはここだけ。

## 規約

1. **1ファイル1決定**。命名は `<識別子>.md` で、識別子は `YYYYMMDD-<slug>`（例: `20260917-adr-date-slug-identifier`）
   `YYYYMMDD` はヘッダの決定日、`<slug>` は決定を表す英小文字・数字・ハイフンの語句
   識別子を決定日と決定の内容だけから導くので、並行するブランチが互いの ADR を知らずに書いても名前が衝突しない
   同じ日の ADR は slug で区別し、同じ日の中の順序は持たない
   識別子が既存のものと完全に一致したら、後から書く側が slug を変える
   完全に一致した場合は git が同じパスの追加として衝突させるので、重複は黙って入らない
2. **ヘッダ**: `状態`（`採用` / `supersede 済み（→ <識別子>）`）・`決定日`・`関係する ADR`
3. **節は 文脈 / 決定 / 理由（採らなかった案と、それを採らなかった条件）/ 帰結 / 覆る条件**
4. **書き換えない。** 覆すときは新しい ADR を書き、旧 ADR のヘッダに
   `supersede 済み（→ <識別子>）` を足すだけ（**本文は一字も削らない**）
   **意味が変わる変更は、一部だけでも同じ**
   一節だけを直したくなっても、旧 ADR は残したまま新しい ADR を書き、変わらない部分は複写する
   決定は生きていて帰結だけが古くなった場合も、帰結を直した新しい版を書く
   帰結が古くなったとは、決定の波及先（この決定を受けて何が変わるか）が動いたことを指す
   決定時点の例として書いたファイル名・関数名・環境変数名・値の一覧（規約 7）の字面が現況と違うだけなら、決定・理由・帰結・覆る条件のどれも動いていないので、新しい版を書かない
   その現況はコードと現況の文書が持つ
   1 レコードは「その時点で正しかった設計の状態」を全体で一つ示すものなので、部分の書き換えを許すと、どの時点の状態を読んでいるのかが読み手に分からなくなる
   複写の手間より、状態が一つに定まることを優先する
   例外は**意味を変えない語彙の置き換え**（用語の統一・読み手に意味をより明確にする言い換え）
   これはその場で直してよい
   決定・理由・帰結のどれかが動くなら例外に当たらない
5. **ADR にするのは、モジュールの外から見える形を変える決定だけ。**
   外から見える形とは、公開する関数と型・データの形・層の依存の向き・リポジトリ全体に効く選択（ライセンス・配信先・外部サービス・ツールチェーン・検査の連鎖）の四つを指す
   判定は「その選択を知らずに別のモジュールか別の PR を書く人が、コードと git の履歴だけでは気付けずに間違えるか」の一問で、四つのどれにも当たらなければ ADR にしない
   issue や着手の指示が ADR を書くと指定していても、この判定を先に通す
   ADR にしない選択の理由は、コミットの本文と、そのモジュールの冒頭のコメントに書く（規範は `.claude/rules/coding.md`「コメント」節）
   ADR にしなかった事柄は列挙しない（判定が上の一問なので、一覧が無くても次に書く人が同じ答えに至る）
   未決の論点は issue、順序は `docs/ROADMAP.md`、現況は `docs/ARCHITECTURE.md` が持つ
6. **ADR は一度書かれて何度も参照されるので、書く労力より読む労力を減らす方を選ぶ**
   - 全節に当てる
   - 決定そのものが値であるもの（値域・固定する版・上限・案の比較）と状況は表にする
     現況の一覧（環境変数・ファイル・列の一覧）は、規約 7 に従って表にせず現況の文書を指す
   - 理由と採らなかった案は 1 行 1 項目
   - 決定の節は参照する単位で並べる（書いた順でなく、読み手が引く単位で並べる）
   - マージ済みレコードへの適用は規約4に当たる（本文は書き換えず、直すなら新しい ADR で supersede する）
7. **決定はアーキテクチャの水準で書き、個別の実装に関与しない。**
   決定の本体（決定の節で言い切る文）に置くのは、責務の切り方・層の境界・採る方式・満たす条件である
   ファイル名・関数名・環境変数名・値の一覧は決定の本体にせず、決定時点の例として書き、「現況は X が持つ」と現況の置き場を添える
   現況を持つのはコードと現況の文書（`docs/ARCHITECTURE.md`・`docs/DEPLOY.md`・`.claude/rules/`）で、ADR ではない
   実装の詳細を決定の本体に置くと、実装が動くたびに ADR が古くなり、決定が動いていないのに規約 4 の改訂版が要ることになるので、決定の本体を実装の詳細から切り離す

`関係する ADR` に入れるのは ADR の識別子だけで、`, ` で区切る。
他の文書を指したいときは本文中で参照する（欄の意味を一意に保つと、supersede の連鎖を
機械的に辿れる）。

ADR の本文とヘッダでは、他の ADR を識別子だけで指す。
ADR の外（コード・現況の文書・issue・PR）から指すときは、識別子だけでは中身が読めないので `ADR-<識別子>（決定の名前）` と書く。
ファイルのパスで指すときは `docs/adr/<識別子>.md` と書く。

**`覆る条件` を空にしない。**
ここが書けない決定は、覆るときに誰も気付かないので、採用のまま永久に残る。
書こうとして書けないなら、それは決定ではなく既定の踏襲なので、規約5 に従って ADR にしない。

## 雛形

```markdown
# 決定を一行で

- **状態**: 採用
- **決定日**: YYYY-MM-DD
- **関係する ADR**: なし

## 文脈

何が問題で、なぜ今決める必要があるのか。

## 決定

何を決めたか。

## 理由

なぜそれを選んだか。
**採らなかった案と、それを採らなかった条件**を併記する
（条件が変われば覆るので、下の「覆る条件」と対になる）。

## 帰結

この決定を受けて何が変わるか。波及先。

## 覆る条件

何が起きたらこの決定を見直すか。
```

## 一覧

| ADR | 旧番号 | 決定 | 決定日 | 状態 |
|---|---|---|---|---|
| [20260719-no-one-sided-material](20260719-no-one-sided-material.md) | 0035 | 「答えを与えない」を「一方向に閉じた材料を出さない」として検査可能にする | 2026-07-19 | 採用 |
| [20260719-original-form-and-current-form](20260719-original-form-and-current-form.md) | 0034 | 問いの原型を不変に持ち、言い直しは `current_form` に持つ | 2026-07-19 | supersede 済み（→ 20260914-question-form-history） |
| [20260815-drop-cowork-sandbox](20260815-drop-cowork-sandbox.md) | 0006 | Cowork サンドボックスを副環境として扱う前提を落とす | 2026-08-15 | 採用 |
| [20260815-local-postgres-docker-compose](20260815-local-postgres-docker-compose.md) | 0004 | ローカルの Postgres は Docker Compose で立てる | 2026-08-15 | 採用 |
| [20260815-persistence-prisma-postgres](20260815-persistence-prisma-postgres.md) | 0003 | 永続化を `node:sqlite` から Prisma + Postgres へ移す | 2026-08-15 | 採用 |
| [20260816-drop-data-migration](20260816-drop-data-migration.md) | 0005 | 既存データの移送を取りやめる | 2026-08-16 | 採用 |
| [20260827-license](20260827-license.md) | 0001 | コードも文書も MIT で覆い、範囲の限定は README が持つ | 2026-08-27 | 採用 |
| [20260828-production-migration-path](20260828-production-migration-path.md) | 0008 | 本番の migration は main への push を起点に GitHub Actions から流す | 2026-08-28 | 採用 |
| [20260828-production-pnpm-version](20260828-production-pnpm-version.md) | 0007 | Vercel の pnpm は Install Command で版を名指しする | 2026-08-28 | 採用 |
| [20260828-production-runtime](20260828-production-runtime.md) | 0002 | 本番の実行環境を Vercel（Hobby）にし、移植性は禁止則で持つ | 2026-08-28 | 採用 |
| [20260829-local-vocabulary-split](20260829-local-vocabulary-split.md) | 0014 | 手元の環境に固有の語彙と接続を、追跡しない CLAUDE.local.md へ分離する | 2026-08-29 | 採用 |
| [20260829-neon-outside-vercel-marketplace](20260829-neon-outside-vercel-marketplace.md) | 0012 | Neon は Vercel Marketplace 経由で作らず、自分の組織の下に置く | 2026-08-29 | 採用 |
| [20260829-postgres-18](20260829-postgres-18.md) | 0009 | Postgres のメジャーを、本番を立てる前に 18 で揃える | 2026-08-29 | 採用 |
| [20260829-preview-neon-branch](20260829-preview-neon-branch.md) | 0015 | Preview に Neon のブランチを当てた専用の DB を持たせる | 2026-08-29 | 採用 |
| [20260829-prisma-major-hold](20260829-prisma-major-hold.md) | 0010 | Prisma は 7 系で止め、三つのパッケージの版を明示で指定する | 2026-08-29 | 採用 |
| [20260829-production-basic-auth](20260829-production-basic-auth.md) | 0013 | 本番へのアクセス制限を、ホスティングでなくアプリ側の Basic 認証で持つ | 2026-08-29 | supersede 済み（→ 20260909-login-and-fake-sign-in） |
| [20260829-typescript-7-parser](20260829-typescript-7-parser.md) | 0011 | TypeScript は 7 へ上げ、コメント検査器のパーサだけ 6 系を別名で持つ | 2026-08-29 | 採用 |
| [20260830-auth-better-auth](20260830-auth-better-auth.md) | 0019 | 認証基盤を Better Auth の自前ホストにし、Google OAuth 一本で始める | 2026-08-30 | supersede 済み（→ 20260906-auth-better-auth） |
| [20260830-central-metaphor-brewing](20260830-central-metaphor-brewing.md) | 0016 | 中心メタファーをコンポスターから醸造（発酵槽）へ移す | 2026-08-30 | 採用 |
| [20260830-invite-only-multi-user](20260830-invite-only-multi-user.md) | 0018 | 自分専用という運用前提を改め、招待制で他人へ開く | 2026-08-30 | 採用 |
| [20260830-ownership-granularity](20260830-ownership-granularity.md) | 0020 | 所有権を、所有のルートにだけ持たせる | 2026-08-30 | supersede 済み（→ 20260906-ownership-granularity） |
| [20260830-status-value-set](20260830-status-value-set.md) | 0017 | `status` の値域を、比喩を外して組み直す | 2026-08-30 | 採用 |
| [20260831-ai-provider-scope](20260831-ai-provider-scope.md) | 0021 | AI を呼び出すコードをプロバイダ単位で切り、深さをプロバイダの設定にまとめる | 2026-08-31 | supersede 済み（→ 20260915-ai-provider-per-user） |
| [20260901-retire-next-md](20260901-retire-next-md.md) | 0023 | 申し送りの層（`NEXT.md`）を畳む | 2026-09-01 | 採用 |
| [20260901-session-security](20260901-session-security.md) | 0022 | セッションの守りを既定に委ねず、明示と実際の応答で持つ | 2026-09-01 | 採用 |
| [20260902-env-file-scope](20260902-env-file-scope.md) | 0024 | `.env*` を Claude が触ってよい範囲を、読みと書きで別々に引く | 2026-09-02 | 採用 |
| [20260902-ownership-before-auth](20260902-ownership-before-auth.md) | 0031 | 所有者を認証より先にデータ層へ入れ、Better Auth の四表はモデル名も列名も生成されたまま同居させる | 2026-09-02 | supersede 済み（→ 20260909-ownership-before-auth） |
| [20260902-turn-atomicity-and-pending-utterance](20260902-turn-atomicity-and-pending-utterance.md) | 0025 | 一往復は三行が揃ってから messages へ入れ、失敗した発話は pending_messages へ残す | 2026-09-02 | 採用 |
| [20260903-defer-streaming](20260903-defer-streaming.md) | 0026 | AI 応答のストリーミング化を、残す摩擦の側に立って見送る | 2026-09-03 | 採用 |
| [20260906-auth-better-auth](20260906-auth-better-auth.md) | 0029 | 認証基盤を Better Auth の自前ホストにし、Google OAuth 一本で始める（20260830-auth-better-auth の改訂） | 2026-09-06 | supersede 済み（→ 20260909-auth-better-auth） |
| [20260906-docs-under-docs](20260906-docs-under-docs.md) | 0028 | 器自身の文書を `docs/` へ寄せ、`DESIGN.md` を規範と記述に分ける | 2026-09-06 | 採用 |
| [20260906-ownership-granularity](20260906-ownership-granularity.md) | 0030 | 所有権を、所有のルートにだけ持たせる（20260830-ownership-granularity の改訂） | 2026-09-06 | 採用 |
| [20260906-rules-under-claude](20260906-rules-under-claude.md) | 0027 | コーディング規約は `.claude/rules/` に置き、`CODING.md` はルートから消す | 2026-09-06 | 採用 |
| [20260909-auth-better-auth](20260909-auth-better-auth.md) | 0036 | 認証基盤を Better Auth の自前ホストにし、Google OAuth 一本で始める（20260906-auth-better-auth の改訂） | 2026-09-09 | 採用 |
| [20260909-login-and-fake-sign-in](20260909-login-and-fake-sign-in.md) | 0033 | ログインを入れ、固定のユーザーを「Google を経ないサインイン」へ置き換える | 2026-09-09 | supersede 済み（→ 20260915-login-and-fake-sign-in） |
| [20260909-ownership-before-auth](20260909-ownership-before-auth.md) | 0037 | 所有者を認証より先にデータ層へ入れ、Better Auth の四表はモデル名も列名も生成されたまま同居させる（20260902-ownership-before-auth の改訂） | 2026-09-09 | 採用 |
| [20260909-persona-as-records](20260909-persona-as-records.md) | 0032 | ペルソナをテーブルにし、当時の設定を発話が指す | 2026-09-09 | supersede 済み（→ 20260915-persona-as-records） |
| [20260914-current-form-input-and-display](20260914-current-form-input-and-display.md) | 0039 | 問いの言い直しは対話画面の見出しで人間が書き、履歴は対話画面に並べ、`/memos` も一覧・対話画面と同じ解決で問いの文を出す | 2026-09-14 | 採用 |
| [20260914-memo-edit-and-soft-delete](20260914-memo-edit-and-soft-delete.md) | 0041 | メモはキーワードとノートを直せるようにし、削除は論理削除にする | 2026-09-14 | 採用 |
| [20260914-question-form-history](20260914-question-form-history.md) | 0040 | 問いの原型を不変に持ち、言い直しは履歴の表へ追記する（20260719-original-form-and-current-form の改訂） | 2026-09-14 | 採用 |
| [20260914-question-status-transitions](20260914-question-status-transitions.md) | 0038 | `status` は培地が付いたときに機械が `new` から `stocked` へ上げ、残る 5 値は人間が対話画面で選ぶ | 2026-09-14 | 採用 |
| [20260915-admin-flag-on-user-row](20260915-admin-flag-on-user-row.md) | 0046 | 管理者を利用者の行のフラグで見分ける | 2026-09-15 | 採用 |
| [20260915-ai-provider-per-user](20260915-ai-provider-per-user.md) | 0043 | AI を呼び出すコードをプロバイダ単位で切り、モデルとキーを利用者ごとに解決する（20260831-ai-provider-scope の改訂） | 2026-09-15 | 採用 |
| [20260915-culture-explicit-sync-trigger](20260915-culture-explicit-sync-trigger.md) | 0049 | 培地の付与は利用者の明示の操作で始め、その場で待つ | 2026-09-15 | 採用 |
| [20260915-culture-paired-sourced-material](20260915-culture-paired-sourced-material.md) | 0050 | 一回の付与は論点ごとに立場の違う材料を対にし、外部材料は検索結果の URL を出典に持ち、件数・対・出典を検査して通らない付与を保存しない | 2026-09-15 | 採用 |
| [20260915-login-and-fake-sign-in](20260915-login-and-fake-sign-in.md) | 0051 | ログインを入れ、固定のユーザーを「Google を経ないサインイン」へ置き換え、開発用の環境変数は本番のビルドの最初で一律に拒否する（20260909-login-and-fake-sign-in の改訂） | 2026-09-15 | 採用 |
| [20260915-operator-key-for-keyless-users](20260915-operator-key-for-keyless-users.md) | 0045 | キーを登録していない利用者は、運営のキーでアプリの既定モデルを使う | 2026-09-15 | 採用 |
| [20260915-persona-as-records](20260915-persona-as-records.md) | 0042 | ペルソナをテーブルにし、当時の設定を発話が指す（20260909-persona-as-records の改訂） | 2026-09-15 | 採用 |
| [20260915-suspend-on-user-row](20260915-suspend-on-user-row.md) | 0048 | 停止を利用者の行に持ち、現在の利用者を返す入口で判定して、停止中の操作をすべて断つ | 2026-09-15 | 採用 |
| [20260915-usage-log-in-db](20260915-usage-log-in-db.md) | 0047 | AI の呼び出しごとの利用量を DB の表に記録し、本文を残さない | 2026-09-15 | 採用 |
| [20260915-user-api-key-encryption](20260915-user-api-key-encryption.md) | 0044 | 利用者の API キーを暗号化して DB に置き、鍵を環境変数に置いて鍵 ID で回転する | 2026-09-15 | 採用 |
| [20260917-adr-date-slug-identifier](20260917-adr-date-slug-identifier.md) | — | ADR の識別子を、連番から決定日と slug の組にする | 2026-09-17 | 採用 |

並びは識別子の辞書順で、`docs/adr/` のファイルの並びと一致する。
`旧番号` は、識別子を決定日と slug の組へ改める前の 4 桁の連番で、書いた順を表す。
open な issue と PR の本文、適用済みの migration のコメントは旧番号で ADR を指しているので、この列から探す。

決定日は元の決定日で、旧番号の順とは揃わない。
旧番号 0003〜0006 は #92（`PLAN-rationale.md` の決定を ADR へ割り直す）で、ADR の置き場を作る前の散文から後から割ったものなので、20260827-license より前の日付を持つ。
旧番号 0034〜0035 も #198（docs の md を持ち場で照合する）で `docs/ARCHITECTURE.md` の散文から後から割ったもので、同じく前の日付を持つ。
20260909-auth-better-auth と 20260909-ownership-before-auth は、20260909-login-and-fake-sign-in が動かした決定を規約 4 に従って複写した版なので、同じ日付を持つ。

**旧番号 0026 までのレコードは `CODING.md` をルートの一枚として指している。**
[20260906-rules-under-claude](20260906-rules-under-claude.md) で `.claude/rules/` へ分けたので、それより前のレコードにある `CODING.md` は `coding.md`（コード）か `writing.md`（文章・コミット）と読む。

**旧番号 0027 までのレコードは `VISION.md`・`ARCHITECTURE.md`・`HARNESS.md`・`ROADMAP.md`・`DEPLOY.md`・`DESIGN.md` をルート直下の一枚として指している。**
[20260906-docs-under-docs](20260906-docs-under-docs.md) で `docs/` へ寄せたので、それより前のレコードにある 6 本は `docs/` 直下と読む。
`DESIGN.md` はさらに規範と記述へ分かれ、守らせる規則は `.claude/rules/design.md` が持つ。

**旧番号 0037 までのレコードは、ファイル名・関数名・環境変数名・値の一覧を決定の本体に持つ。**
規約 7（決定はアーキテクチャの水準で書き、個別の実装に関与しない）より前に書かれたので、それらは決定時点の例と読み、現況はコードと現況の文書で確かめる。
字面が現況と違っても決定が動いていなければ、規約 4 に従って改訂版は書かない。
