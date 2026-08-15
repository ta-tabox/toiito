# PLAN-rationale — 実装プランの経緯層（退避）

2026-08-02 退避。**この文書は正典ではない**。手順の契約層は `ROADMAP.md`（地図）と
GitHub Issues（実行単位）へ分離した。ここに残すのは、そこへ載せない**経緯**——
完了済みステップの帰結、方針改定の理由、当時の判断材料。
参照するのは「なぜこう決めたか」を掘るときだけで、着手時に読む必要はない。

原文は以下に一行も削らず保持する（要約すると判断材料が変質するため）。

---

# PLAN — MVP 完遂までの実装プラン

2026-07-13 起草。範囲は **MVP 残り + P1 ハーネス**（graph-view / Supabase 移行は
別タスクのまま、ここには含めない）。1 ステップ = 1 セッションで完結する粒度に分割。
上位文書: VISION.md（なぜ）> ARCHITECTURE.md（どう）> HARNESS.md（検証）> 本文書（手順）。
矛盾したら上位が勝つ。

## 進め方の横断規約（全ステップ共通）

- 心拍: 変更 → `web/` で `pnpm check` → 緑ならコミット。赤のままコミットしない
- 作る順: **lib 関数 + テスト → UI 配線**（HARNESS.md 設計制約 4）
- AI を伴う動作確認は `TOIITO_FAKE_AI=1`。実 API は自動テストで叩かない
- コミット: prefix `toiito:`、Claude は
  `git -c user.name=claude -c user.email=claude@local commit`。push は人間のみ
- Cowork サンドボックスの制約: ビルドは `/tmp` コピーで実行（FUSE が unlink 拒否）、
  node_modules は macOS と相互流用不可、コマンド 45 秒制限、実 API 不可
- セッション終了時の儀式: NEXT.md を更新（着手中 → status、完了 → 「済んだもの」へ落とし、
  本文書の該当ステップに ✅ と日付を付ける）→ コミット。
  次セッションへの申し送りが要るなら NEXT.md の当該項目に一行添える

## ステップ一覧（依存順）

| # | 内容 | 担当 | 前提 |
|---|------|------|------|
| S0 | pnpm 移行仕上げ + 実機動作確認 | 人間 | — |
| S0b | 問いの基盤改定（原型/現在の形・状態6値・ペルソナ手筋） | Claude | — |
| S1 | メモ lib 層（repo 関数 + アンカー分割ロジック + テスト） | Claude | なし（S0 と並行可） |
| S2 | メモ UI（文字選択 → メモ、アンダーライン表示） | Claude | S1 |
| S3 | メモ一覧と逆引きページ | Claude | S1（S2 と順不同だが S2 先を推奨） |
| S4 | P1 ハーネス（Playwright E2E + シードスクリプト） | Claude + 人間 | S2, S3 |
| S5 | AI 応答のストリーミング化 | Claude | S4（E2E をストリーミング対応に改修するため） |
| S6 | MVP 到達判定・台帳更新・常用開始 | 人間 + Claude | S1〜S4（S5 は任意） |

---

## S0 [人間] pnpm 移行仕上げ + 実機動作確認 ✅ 2026-07-17

**帰結**: 実対話 OK・一往復の体感は遅くない。
派生要件: 発話送信中のローディング表示 → **S2 に追加**（S5 実施までの繋ぎとして必要）。
S5 は同日中に「実施する」へ改定（理由は S5 節）。

正は NEXT.md 冒頭の 2 項目（本文書には複製しない）。要旨:
`corepack enable` → lock 差し替え → `pnpm install` → lock コミット →
`.env.local` に ANTHROPIC_API_KEY → `pnpm dev` で実対話を一度回す。

**完了条件**: `pnpm check` が macOS で緑。実 API で三者対話が一往復動く。
**判定を持ち帰る**: 二体応答の体感速度。重いと感じたら S5 の実施が確定する
（NEXT.md にその旨を書き残す）。

---

## S0b 問いの基盤改定 ✅ 2026-07-19

**なぜ割り込ませたか**: fermentary で実際に問いを深める蒸留を一回通したところ、
toiito の前提のうち**後から変えると高いもの**に穴が見つかった。スキーマと
システムプロンプトはデータと運用が乗る前に直すのが最も安い。S1 以降の順序は崩さない。

**やったこと**:

1. `questions.body` を**原型（不変）**と定め、`current_form`（対話で言い直された
   焦点）を追加。表示は `questionText()` が現在の形→原型の順で解決。
   二体 AI には両方渡す（`callPersona` の第2引数を `QuestionRef` に変更）
2. `status` を3値→**6値**（composting / fermented / promoted / open /
   **perennial** / discarded）。`closed` は「結晶した」と「棄却」を潰していた。
   値域の正は `db.ts` の `QUESTION_STATUSES`
3. `migrate()` を新設。`create table if not exists` では既存 DB に列も check も
   届かないため、questions のみ作り直して移送（`closed` → `promoted`）。
   人間の手元の S0 実機データを落とさない
4. ペルソナ両体に **手筋のカタログ**と**材料の供給規律**を追加。
   「答えを与えない」を「一方向に閉じた材料を出さない」として実装可能な形に落とした
5. ARCHITECTURE.md に上記の設計判断を反映（スキーマとオーケストレーションの正）

**残した設計判断**: 培地（cultures）・問いの分割（question_links）・昇格は
`extensions/fermentation-and-outlets.md` に構想として凍結。MVP 常用後に解凍する。

**完了条件**: `pnpm check` 緑（tsc / eslint / vitest 27本 / next build）。
サンドボックスの `/tmp` コピー + linux 版 node_modules で検証 → **macOS でも緑を確認済み**
（2026-07-20、人間実行。27本パス）。ペルソナ改定の体感確認は L5 の領分として
NEXT.md へ任意項目で残す。

---

## S1 メモ lib 層

**目的**: memos テーブル（スキーマは db.ts に定義済・未使用）を repo 関数と
純関数ロジックで使える状態にする。UI は触らない。

**作るもの**:

1. `web/src/lib/db.ts` に追記（既存シグネチャ規約に従い同期関数・戻り値は行型）:
   - `type Memo = { id, message_id, anchor_start, anchor_end, keyword, note, created_at }`
   - `addMemo(messageId, anchorStart, anchorEnd, keyword, note?): Memo`
     — 挿入前に **本文長との整合を lib 側で検査**する
     （DB の check は `start >= 0 && end > start` しか守らない。
     `anchor_end <= 対象メッセージ body の長さ` は lib の責務）
   - `listMemosForSession(sessionId): Memo[]` — 対話画面のアンダーライン描画用
   - `listMemosWithContext(): MemoWithContext[]` — 逆引き用。
     `memos → messages → sessions → questions` の join 一本
     （ARCHITECTURE.md の移行容易性契約どおり、Postgres でも成立する素の SQL で書く）。
     `type MemoWithContext = Memo & { session_id, question_id, question_body, speaker, message_body }`
2. `web/src/lib/anchors.ts` を新設（純関数のみ・DB 非依存）:
   - `segmentBody(body: string, memos: {id, anchor_start, anchor_end}[]): Segment[]`
     — 本文をアンダーライン区間で分割。
     `type Segment = { text: string; memoIds: string[] }`（重複区間は memoIds が複数）
   - **オフセットの正は JS の string index（UTF-16 code unit）**とここで確定させる。
     選択 UI（S2）・DB 保存・描画のすべてが同じ単位を使う。
     サロゲートペア（絵文字等）を跨ぐ選択の丸め処理もこの関数群の責務
3. `web/tests/anchors.test.ts` + `db.test.ts` への追記:
   - addMemo: 正常系 / end > body 長で拒否 / note 省略可 / 外部キー不整合で失敗
   - segmentBody: メモなし / 単一 / 隣接 / 重複（overlap）/ 境界（先頭・末尾）/
     マルチバイト・絵文字を含む本文

**触らないもの**: actions.ts、page.tsx、personas。
**完了条件**: `pnpm check` 緑。新規テストが上記ケースを網羅。コミット済。

---

## S2 メモ UI（文字選択 → メモ、アンダーライン表示)

**目的**: 対話画面で AI・人間の発話本文を選択するとメモを残せ、
メモ付き区間がアンダーライン（リンク風）で見える。MVP の残り半分の前半。

**作るもの**:

1. `web/src/app/actions.ts` に `createMemoAction(messageId, anchorStart, anchorEnd, keyword, note)`
   — lib の `addMemo` を呼ぶだけの配線 + `revalidatePath`
2. `web/src/components/MessageBody.tsx`（**client component**。初のクライアント部品）:
   - props: `message`, `memos`（当該メッセージ分）, server action
   - 描画: `segmentBody` の結果を `<span>` 列で出力。`memoIds` が非空の区間は
     アンダーライン装飾 + `title` か hover でメモ内容を覗ける
   - 選択: 各 segment の `<span>` に累積オフセットを `data-offset` で持たせ、
     `window.getSelection()` の Range（anchorNode / offset）から
     **本文先頭基準のオフセットに換算**する。メッセージを跨ぐ選択は無視
   - 選択確定でポップオーバー（小フォーム）: keyword は選択文字列で自動充填、
     note は任意入力。送信で server action → 再描画でアンダーラインが現れる
   - **発話フォームのローディング表示**（S0 派生要件）: `useFormStatus` の
     pending で送信ボタンを無効化 + 「二体が応答中…」表示。二体分の同期待ちの間、
     UI が無反応に見える状態を解消する
3. `web/src/app/q/[id]/page.tsx` の配線変更:
   - `listMemosForSession` を引き、各メッセージの本文描画を `MessageBody` に差し替え
   - 各メッセージ div に `id={`msg-${m.id}`}` を付与（S3 の逆引きアンカー先）

**設計上の注意**:
- ロジック（オフセット換算の数式部分）は可能な限り `anchors.ts` 側の純関数へ寄せ、
  コンポーネントは DOM 読み取りと表示に限定する（テスト可能性の維持）
- messages は immutable なのでオフセットは腐らない（編集機能を足さないこと）

**完了条件**: `pnpm check` 緑。`TOIITO_FAKE_AI=1 pnpm dev` で
選択 → メモ → アンダーライン表示の一連が手動確認できる
（サンドボックスでは dev 起動不可のため、Claude 単独セッションの場合は
 check 緑 + 換算ロジックのユニットテストまでを完了条件とし、
 手動確認は NEXT.md で人間に引き渡す）。コミット済。

---

## S3 メモ一覧と逆引きページ

**目的**: メモ一覧から「どの問いの・どのセッションの・どの発話か」へ遡れる。
MVP の残り半分の後半。対話が資産として堆積する（VISION 設計原理 4）の実装。

**作るもの**:

1. `web/src/app/memos/page.tsx`（server component のみ・クライアント不要）:
   - `listMemosWithContext()` を新しい順に一覧。各行: keyword（太字）/ note /
     引用（message_body から anchor 区間を抜粋、前後を少し添える）/ 問い本文
   - 各行から `/q/${question_id}#msg-${message_id}` へリンク
2. 抜粋生成は `anchors.ts` に純関数 `excerpt(body, start, end, margin): string` を
   追加してテスト付きで（境界・マルチバイトは S1 と同じ扱い）
3. トップページ（問い一覧）から `/memos` への導線を一行追加
4. 遷移先の対話画面で対象メッセージが分かるよう、`#msg-` アンカーで飛ぶ
   （ハイライト演出は任意。やるなら `:target` CSS だけで済ませ、JS を足さない）

**完了条件**: `pnpm check` 緑。フェイクモードでメモ → 一覧 → 逆引きジャンプが
一巡する（手動確認の扱いは S2 と同じ）。コミット済。

---

## S4 P1 ハーネス（Playwright E2E + シードスクリプト）

**目的**: 縦一本（投入 → 対話 → メモ → 逆引き）をブラウザ実挙動で機械検証する
L4 層を設置（HARNESS.md P1）。以後の変更の退行検知網になる。

**作るもの**:

1. `web/scripts/seed.ts` — 開発用データ投入（問い 2〜3 件、各に対話とメモ数件）。
   `TOIITO_DB_PATH` を差し替えて任意の DB に投入可能に。
   repo 関数だけで書く（生 SQL 禁止 = スキーマ変更に追従させる）。
   `pnpm seed` スクリプトとして登録
2. Playwright 導入（`@playwright/test`）。`web/e2e/` にスペック:
   - シナリオ 1: 問い投入 → 発話 → フェイク応答二体が「ai_a → ai_b」の順で
     表示される（fakeResponse のペルソナ行をアサート）
   - シナリオ 2: 発話本文を選択 → メモ作成 → アンダーライン出現
     （選択は `page.evaluate` で Range を組む）
   - シナリオ 3: /memos に現れる → リンクで対話画面の該当メッセージへ着地
   - webServer 設定で `TOIITO_FAKE_AI=1` + テスト専用 `TOIITO_DB_PATH`（毎回捨てる）
3. スクリプト整理: `pnpm e2e`（Playwright 単体）と `pnpm check:full`（check + e2e）。
   **`pnpm check` は今の速さのまま**（心拍を遅くしない）
4. HARNESS.md の P1 節を実装済みに更新

**環境の注意**: Playwright のブラウザ実行はサンドボックスでは不可能性が高い。
Claude はスペックとシードを書き切り、**実走は macOS 側（人間 or Claude Code）**。
初回は `pnpm exec playwright install chromium` が人間側で必要。

**完了条件**: macOS で `pnpm check:full` 緑（e2e 3 シナリオ含む）。コミット済。

---

## S5 AI 応答のストリーミング化（実施する）

**実施理由**（2026-07-17 改定。当初は S0 判定次第の条件付き → 実施確定へ）:
1. S0 の「遅くない」は一往復・浅い文脈での観測。transcript は全量渡しの設計なので
   対話が育つほど同期待ちは伸びる——常用が進むほど確実に重くなる
2. このプロジェクトは**転職用ポートフォリオを兼ねる**。SSE / 逐次描画は
   技術的な評価ポイントであり、見せ場として実装する価値がある

**位置づけ**: S1〜S4（MVP + E2E）完了後。MVP の完了条件には含めない
（ストリーミングなしでも縦一本は成立する。順序を崩してまで先行させない）。

**方針スケッチ**（着手セッションの冒頭で詳細化してから書く）:

- `web/src/app/api/speak/route.ts` を新設し、SSE で
  `ai_a 開始 → チャンク列 → ai_a 確定 → ai_b 開始 → …` を流す
  （Server Action の同期往復から置き換え。逐次性の契約は維持——並列化しない）
- `claude.ts` に `callPersonaStream`（AsyncIterable<string>）を追加。
  フェイクモードも数チャンクに割って流す（E2E がストリーミングを検証できるように）
- DB 書き込みは**確定時に一括**（messages immutable を崩さない。途中経過は保存しない）
- フォームは client component 化し、逐次描画。楽観的更新は人間発話のみ
- S4 のシナリオ 1 をストリーミング対応に改修

**完了条件**: `pnpm check:full` 緑。実機で体感が改善。コミット済。

---

## S6 MVP 到達判定・台帳更新・常用開始

**目的**: プロジェクト完了条件「MVP が動き、自分の問いで実際に常用できている」の
前半を締め、後半（常用）を開始する。

**作業**:

1. [人間] 実キーで自分の本物の問いを 1 件投入し、対話 → メモ → 逆引きを実運用で一巡
2. [Claude] fermentary の `ATLAS.md`（terrarium 節）の toiito 行を
   MVP 到達の status に更新（CLAUDE.md セッション開始時手順 3 の節目に該当）
3. [Claude] NEXT.md を整理: 完了項目を落とし、「別タスク」（graph-view / Supabase）と
   S5 の帰結（実施 or 見送り）を明記。本文書の全ステップに ✅ を確認
4. 常用中に出た違和感・問いは膜の一行判定で fermentary へ
   （アプリ改善ネタはこの NEXT.md、概念的な学びは inbox/questions）

**完了条件**: ATLAS 更新済。常用が始まっている。
以後は常用からのフィードバック駆動（このプランはここで役目を終える。
手仕舞いは `~/vivarium/fermentary/playbooks/terrarium.md` が正典）。

## 方針改定（2026-08-15）実行環境のステージ交代

Cowork サンドボックスを副環境として扱う前提が失効した。あれは Cowork で
プランを作っていた時期の制約であり、ローカルに環境を作れること自体が
Claude Code の存在意義である以上、もう足場の説明になっていない。
`CLAUDE.md` / `ROADMAP.md` / `HARNESS.md` から該当記述を削除した。
`HARNESS.md` から落とした表を**要約せず原文のまま**残す:

```
| | Claude Code（主） | Cowork サンドボックス（副） |
|--|--|--|
| OS / 制限 | macOS・制限なし | Linux・コマンド 45 秒制限 |
| ネットワーク | 自由（実キー可） | 許可リスト制（Claude API 不可） |
| ビルド | リポジトリ内で可 | FUSE が unlink 拒否 → `/tmp` にコピーして実行 |
| node_modules | macOS ネイティブ | Linux ネイティブ（**相互流用不可**） |

サンドボックスで作業した後は macOS 側で `rm -rf node_modules && pnpm install`。
この非対称は消せないので、ハーネスは「どちらでも `pnpm check` が
同じ意味を持つ」ことだけを保証する。
```

同日、永続化を Prisma + Postgres へ転換（issue #11）。理由は
`ARCHITECTURE.md` の技術スタック節が持つ（方言の二重管理・型の手書きキャスト・
`rowid` による移行契約の漏れ）。ネイティブ依存ゼロという旧方針の価値基準そのものが、
メンテナンスコストと釣り合わなくなったという判断。

---

# 付録: 旧 NEXT.md（2026-08-02 の issue 台帳移行で落とした部分）

NEXT.md をセッション申し送り専用へ痩せさせた際、タスク台帳としての記述を
issue 草稿（`issues/`）へ移した。以下は移行直前の原文のうち、issue へ載せずに
落ちる部分——完了記録と、診断の経緯。**要約せず原文のまま**。

## 別タスク（当時の記述。#8 として issue 化した診断の原文）

- **具体／抽象のバランス（発話周期の固定）**。2026-07-20 の体感: 掘られすぎて
  進みが薄い局面がある。診断——ペルソナの文言ではなく**発話順の固定**が原因。
  毎ターン必ず `ai_a → ai_b` で二体ともフルスイングするので、人間が既に具体で
  語っているターンでも必ず具体から掘られる。往復の周期も振幅も定数になっている。
  対策案は二段（着手は S1〜S3 の後。理由は下記）:
  - **強度可変**（安い・ファイル2本）: 役割は固定のまま「場の重心が自分側に
    寄っているなら引く」を両ペルソナへ。ai_a は人間が既に具体なら短く受けて渡す、
    ai_b は人間が既に抽象ならさらに積まない
  - **オーケストレーション改修**（構造側）: 発話順を可変にする・片方が黙れる
    ようにする。**S5（ストリーミング化）と衝突する**ので順序の整理が要る
  **先に S1〜S3 を通す理由**: 「適切さ」は L5（人間の官能）でしか測れず、
  今の材料は一回の体感しかない。勘でプロンプトを詰めると次の違和感でまた勘で直す
  ことになる。メモ機能が入れば「これは掘りすぎ」と感じた発話にメモを残せ、
  不均衡そのものが逆引きできるデータになる（ARCHITECTURE「破られたら人間が
  観察できることが検知機構を兼ねる」の実体化）。観測器を先に立てる。
  概念側の問いは fermentary questions 2026-07-20 へ搬送済み

- リモート環境構築 + Supabase (Postgres) 移行
  （`web/src/lib/db.ts` の repo 関数シグネチャを保って差し替え。
  スキーマは `web/supabase/migrations/0001_init.sql` に温存済）
  → issue 化していない。MVP 常用後の判断事項として保留

## 済んだもの（当時の完了記録）

- 2026-07-17 **S0 完了**。pnpm 移行仕上げ（corepack enable → lock 差し替え →
  approve-builds、コミット 4452c10）+ 実キーで初回対話 OK。
  体感判定: 遅くない → S5 見送り、ローディング表示を S2 へ相乗り

- 2026-07-06 ハーネス P0。`HARNESS.md` 起草（検証の層構造 L0〜L5・フェイクモード・
  環境差異・フェーズ）。Vitest + `TOIITO_FAKE_AI` + lib 層テスト 11 本 +
  `npm run check` 入口。CLAUDE.md にコミットゲート規約を追記。
  P1（Playwright E2E + シード）はメモ機能実装と同時に
- 2026-07-06 立ち上げ。VISION.md を土台に `ARCHITECTURE.md` を起草。
  `web/` に Next.js 骨格を生成
- 2026-07-06 ローカル完結化。永続化を SQLite（node:sqlite）に差し替え、
  コア縦一本（問い投入 → 三者対話、固定ペルソナ二体の逐次呼び出し）を実装。
  ビルド・型チェック・DB 層スモークテスト済（AI 呼び出しは API キー未設定のため実機未検証）
