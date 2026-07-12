# NEXT — toiito

セッション開始時にここを見る。着手したら status 更新、完了したら下へ落とす。

## いま開いているもの

- **実装プランの正: `PLAN.md`**（2026-07-13 起草。S0〜S6 のセッション分割。
  下記の個別項目は PLAN の S0/S2/S3/S5 に対応——着手時は PLAN の該当ステップを読む）
- [人間側] pnpm 移行の仕上げ（macOS 側でのみ可能。サンドボックスは FUSE が
  unlink 拒否で lock 削除・install 不可）: `web/` で `corepack enable` →
  `rm package-lock.json` → `rm -rf node_modules && pnpm install`（pnpm-lock.yaml 生成）
  → 生成された `pnpm-lock.yaml` をコミット、`package-lock.json` の削除もコミット。
  pnpm 11 は postinstall スクリプトを既定でブロックするので、`pnpm check` が
  ビルドで転けたら `pnpm approve-builds` で必要な依存だけ許可する
- [人間側] 動作確認: 上記 install 後 → `.env.local` に ANTHROPIC_API_KEY →
  `pnpm dev`。Node 22+ 必須（node:sqlite）
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

- 2026-07-06 ハーネス P0。`HARNESS.md` 起草（検証の層構造 L0〜L5・フェイクモード・
  環境差異・フェーズ）。Vitest + `TOIITO_FAKE_AI` + lib 層テスト 11 本 +
  `npm run check` 入口。CLAUDE.md にコミットゲート規約を追記。
  P1（Playwright E2E + シード）はメモ機能実装と同時に
- 2026-07-06 立ち上げ。VISION.md を土台に `ARCHITECTURE.md` を起草。
  `web/` に Next.js 骨格を生成
- 2026-07-06 ローカル完結化。永続化を SQLite（node:sqlite）に差し替え、
  コア縦一本（問い投入 → 三者対話、固定ペルソナ二体の逐次呼び出し）を実装。
  ビルド・型チェック・DB 層スモークテスト済（AI 呼び出しは API キー未設定のため実機未検証）
