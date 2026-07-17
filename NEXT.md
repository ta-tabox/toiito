# NEXT — toiito

セッション開始時にここを見る。着手したら status 更新、完了したら下へ落とす。

## いま開いているもの

- **実装プランの正: `PLAN.md`**（2026-07-13 起草。S0〜S6 のセッション分割。
  下記の個別項目は PLAN の S0/S2/S3/S5 に対応——着手時は PLAN の該当ステップを読む）
- **次: PLAN.md S1（メモ lib 層）**。以降 S2（メモ UI）→ S3（逆引き）→ S4（E2E）
- S2 に追加要件: **発話送信中のローディング表示**（S0 実機判定より。二体応答を
  同期で待つ間、UI が無反応なのは不可。useFormStatus 等の pending 表示で足りる）
- S5（ストリーミング化）は**見送り**（S0 判定: レスポンスは遅く感じない。
  常用で判定が覆ったら PLAN.md S5 を再開）

## 別タスク（今はやらない）

- グラフビュー拡張（時系列×グラフの二視点 → メタグラフ）。
  構想と段階プランは `extensions/graph-view.md`。着手はメモ機能完成 + MVP 常用後
- リモート環境構築 + Supabase (Postgres) 移行
  （`web/src/lib/db.ts` の repo 関数シグネチャを保って差し替え。
  スキーマは `web/supabase/migrations/0001_init.sql` に温存済）

## 済んだもの

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
