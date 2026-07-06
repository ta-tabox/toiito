# NEXT — toiito

セッション開始時にここを見る。着手したら status 更新、完了したら下へ落とす。

## いま開いているもの

- [人間側] 動作確認: `web/` で `rm -rf node_modules && npm install`
  （node_modules はサンドボックス(Linux)で入れたため macOS では入れ直し必須）
  → `.env.local` に ANTHROPIC_API_KEY → `npm run dev`。Node 22+ 必須（node:sqlite）
- キーワードメモ機能（文字選択 → メモ、アンダーライン表示）— MVP 残り半分
- メモ一覧からのセッション逆引きページ
- AI 応答のストリーミング化（現状は二体分を同期で待つ。体感が重ければ優先度上げ）

## 別タスク（今はやらない）

- リモート環境構築 + Supabase (Postgres) 移行
  （`web/src/lib/db.ts` の repo 関数シグネチャを保って差し替え。
  スキーマは `web/supabase/migrations/0001_init.sql` に温存済）

## 済んだもの

- 2026-07-06 立ち上げ。VISION.md を土台に `ARCHITECTURE.md` を起草。
  `web/` に Next.js 骨格を生成
- 2026-07-06 ローカル完結化。永続化を SQLite（node:sqlite）に差し替え、
  コア縦一本（問い投入 → 三者対話、固定ペルソナ二体の逐次呼び出し）を実装。
  ビルド・型チェック・DB 層スモークテスト済（AI 呼び出しは API キー未設定のため実機未検証）
