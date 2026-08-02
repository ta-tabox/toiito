# メモ一覧と逆引きページ
labels: claude,ui

**前提**: #1（#4 と順不同） ／ **担当**: Claude ／ **参照**: `VISION.md` 設計原理 4

## 目的
メモ一覧から「どの問いの・どのセッションの・どの発話か」へ遡れる。
MVP の残り半分の後半。**対話が資産として堆積する**（VISION 設計原理 4）の実装。

## 作るもの
1. `web/src/app/memos/page.tsx`（server component のみ・クライアント不要）
   - `listMemosWithContext()` を新しい順に一覧
   - 各行: `keyword`（太字）/ `note` / 引用（`excerpt` で前後を少し添える）/ 問い本文
   - 各行から `/q/${question_id}#msg-${message_id}` へリンク
2. トップページ（問い一覧）から `/memos` への導線を一行追加
3. 着地したメッセージが分かるよう `:target` の CSS を当てる。**JS を足さない**

## 触らないもの
`db.ts` / `anchors.ts`（`excerpt` は #1 で実装済。不足があればテスト付きで追加）。

## 完了条件（機械判定）
- `pnpm check` 緑
- `/memos` のレンダリングに対するテスト（または `listMemosWithContext` の
  結果を整形する純関数のテスト）がある

## 人間の判定（別トラック）
`pnpm seed` 後、メモ → 一覧 → 逆引きジャンプが一巡すること。close を妨げない。
