# NEXT — toiito

セッション開始時にここを見る。着手したら status 更新、完了したら下へ落とす。

## いま開いているもの

- **実装プランの正: `PLAN.md`**（2026-07-13 起草。S0〜S6 のセッション分割。
  下記の個別項目は PLAN の S0/S2/S3/S5 に対応——着手時は PLAN の該当ステップを読む）
- [人間側] S0 残り: `.env.local` に ANTHROPIC_API_KEY → `pnpm dev` で実対話を
  一往復（Node 22+ 必須）。**二体応答の体感が重いかを判定して書き残す**
  （重ければ PLAN.md S5 ストリーミング化が確定）。あわせて `pnpm check` の緑を確認
- キーワードメモ機能（文字選択 → メモ、アンダーライン表示）— MVP 残り半分
- メモ一覧からのセッション逆引きページ
- AI 応答のストリーミング化（現状は二体分を同期で待つ。体感が重ければ優先度上げ）

## 別タスク（今はやらない）

- グラフビュー拡張（時系列×グラフの二視点 → メタグラフ）。
  構想と段階プランは `extensions/graph-view.md`。着手はメモ機能完成 + MVP 常用後
- リモート環境構築 + Supabase (Postgres) 移行
  （`web/src/lib/db.ts` の repo 関数シグネチャを保って差し替え。
  スキーマは `web/supabase/migrations/0001_init.sql` に温存済）

## 済んだもの

- 2026-07-17 pnpm 移行仕上げ（S0 前半）。corepack enable → lock 差し替え →
  approve-builds（sharp / unrs-resolver）。コミット 4452c10

- 2026-07-06 ハーネス P0。`HARNESS.md` 起草（検証の層構造 L0〜L5・フェイクモード・
  環境差異・フェーズ）。Vitest + `TOIITO_FAKE_AI` + lib 層テスト 11 本 +
  `npm run check` 入口。CLAUDE.md にコミットゲート規約を追記。
  P1（Playwright E2E + シード）はメモ機能実装と同時に
- 2026-07-06 立ち上げ。VISION.md を土台に `ARCHITECTURE.md` を起草。
  `web/` に Next.js 骨格を生成
- 2026-07-06 ローカル完結化。永続化を SQLite（node:sqlite）に差し替え、
  コア縦一本（問い投入 → 三者対話、固定ペルソナ二体の逐次呼び出し）を実装。
  ビルド・型チェック・DB 層スモークテスト済（AI 呼び出しは API キー未設定のため実機未検証）
