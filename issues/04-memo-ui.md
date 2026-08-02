# メモ UI（アンダーライン描画 + 選択 → メモ作成）
labels: claude,ui

**前提**: #1, #3 ／ **担当**: Claude ／ **参照**: `ARCHITECTURE.md`, `HARNESS.md` 設計制約 4

## 目的
対話画面で発話本文を選択するとメモを残せ、メモ付き区間がアンダーラインで見える。
MVP の残り半分の前半。**オフセット演算は #1 で完成済みなので、この issue は
DOM 読み取りと表示に限定される**。

## 作るもの

### 1. `web/src/app/actions.ts`
- `createMemoAction(messageId, anchorStart, anchorEnd, keyword, note)`
  — lib の `addMemo` を呼ぶだけの配線 + `revalidatePath`。ロジックを持たせない

### 2. `web/src/components/MessageBody.tsx`（client component）
- props: `message`, `memos`（当該メッセージ分）, server action
- 描画: `segmentBody` の結果を `<span>` 列で出力。`memoIds` が非空の区間は
  アンダーライン装飾 + hover でメモ内容を覗ける
- 選択: 各 segment の `<span>` に `data-segment-index` を持たせ、
  `window.getSelection()` の Range から `(segmentIndex, offsetInSegment)` を読み、
  **#1 の `resolveOffset` / `clampToCodePoint` に渡して絶対オフセットを得る**。
  換算の数式をこのファイルに書かない。メッセージを跨ぐ選択は無視
- 選択確定でポップオーバー（小フォーム）: `keyword` は選択文字列で自動充填、
  `note` は任意入力。送信 → server action → 再描画でアンダーラインが現れる

### 3. `web/src/app/q/[id]/page.tsx` の配線
- `listMemosForSession` を引き、本文描画を `MessageBody` へ差し替え
- 各メッセージ div に `id={`msg-${m.id}`}` を付与（#5 の逆引き着地点）

## 設計上の注意
- `messages` は immutable なのでオフセットは腐らない。**編集機能を足さないこと**
- コンポーネントに数式を書いたら #1 の意味が消える。DOM 読み取り → 純関数 → 送信、の三段

## 触らないもの
`db.ts`、`anchors.ts`（不足があれば #1 を追加改修する形で、テスト付きで足す）、`personas`。

## 完了条件（機械判定）
- `pnpm check` 緑
- `MessageBody` が `anchors.ts` の純関数経由でのみオフセットを算出している
  （grep で数式のインライン記述がないこと）

## 人間の判定（別トラック）
`pnpm seed` + `TOIITO_FAKE_AI=1 pnpm dev` で、選択 → メモ → アンダーライン表示の
一連を目視。close を妨げない。
