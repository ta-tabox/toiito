# NEXT — toiito

セッション開始時にここを見る。着手したら status 更新、完了したら下へ落とす。

## いま開いているもの

- 問い投入 → 三者対話のコア UI を実装する
  （`ARCHITECTURE.md` が正。ペルソナは `web/src/personas/`、
  スキーマは `web/supabase/migrations/0001_init.sql` に既存）
- [人間側] Supabase プロジェクトを作成し、`web/.env.example` を元に
  `web/.env.local` を用意。マイグレーション SQL を適用
- Claude API 接続層（`web/src/lib/`）— 二体逐次呼び出し + ストリーミング

## 済んだもの

- 2026-07-06 立ち上げ。VISION.md を土台に `ARCHITECTURE.md` を起草
  （スタック: Next.js + TS / Supabase / 固定ペルソナ二体）。
  `web/` に Next.js 骨格を生成（ビルド確認済）。
  持ち越した開いた問いは ARCHITECTURE.md 末尾に記載
