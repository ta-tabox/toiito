# メモ lib 層（repo 関数 + anchors 純関数 + テスト）
labels: claude,lib

**前提**: なし ／ **担当**: Claude ／ **参照**: `ARCHITECTURE.md`（スキーマ節）, `HARNESS.md` 設計制約 4, `ROADMAP.md`（横断規約）

## 目的
`memos` テーブル（スキーマは `db.ts` に定義済・未使用）を repo 関数と純関数ロジックで
使える状態にする。**オフセット演算の正をここで確定させる**——選択 UI・DB 保存・描画の
すべてが同じ単位を使うため、DOM に依存しない部分をすべてこの issue に集める。UI は触らない。

## 作るもの

### 1. `web/src/lib/db.ts` に追記
既存シグネチャ規約に従う（同期関数・戻り値は行型）。

- `type Memo = { id, message_id, anchor_start, anchor_end, keyword, note, created_at }`
- `addMemo(messageId, anchorStart, anchorEnd, keyword, note?): Memo`
  - 挿入前に**本文長との整合を lib 側で検査**する。DB の check は
    `start >= 0 && end > start` しか守らない。`anchor_end <= 対象メッセージ body の長さ`
    は lib の責務
- `listMemosForSession(sessionId): Memo[]` — 対話画面のアンダーライン描画用
- `listMemosWithContext(): MemoWithContext[]` — 逆引き用。
  `memos → messages → sessions → questions` の join 一本。
  ARCHITECTURE の移行容易性契約どおり **Postgres でも成立する素の SQL** で書く
  - `type MemoWithContext = Memo & { session_id, question_id, question_body, speaker, message_body }`

### 2. `web/src/lib/anchors.ts` を新設（純関数のみ・DB 非依存・DOM 非依存）
- `segmentBody(body, memos: {id, anchor_start, anchor_end}[]): Segment[]`
  — 本文をアンダーライン区間で分割。`type Segment = { text: string; memoIds: string[] }`
  （重複区間は `memoIds` が複数）
- `resolveOffset(segments: Segment[], segmentIndex: number, offsetInSegment: number): number`
  — セグメント内オフセットを**本文先頭基準の絶対オフセット**へ換算。
  UI（#4）はこの関数に DOM から読んだ数値を渡すだけにする
- `clampToCodePoint(body: string, index: number): number`
  — サロゲートペア（絵文字等）の途中を指すインデックスを、コードポイント境界へ丸める
- `excerpt(body, start, end, margin): string` — 逆引き一覧（#5）の引用生成
- **オフセットの正は JS の string index（UTF-16 code unit）**とここで宣言し、
  ファイル冒頭のコメントに明記する

### 3. テスト
`web/tests/anchors.test.ts` を新設、`db.test.ts` に追記。

- `addMemo`: 正常系 / `end > body 長`で拒否 / `note` 省略可 / 外部キー不整合で失敗
- `segmentBody`: メモなし / 単一 / 隣接 / 重複（overlap）/ 境界（先頭・末尾）/
  マルチバイト・絵文字を含む本文
- `resolveOffset`: 先頭セグメント / 中間 / 末尾 / セグメント境界ちょうど
- `clampToCodePoint`: ペアの前後 / ペアの途中（丸められること）
- `excerpt`: margin が本文外へはみ出す場合 / マルチバイト境界

## 触らないもの
`actions.ts`、`page.tsx`、`personas`、UI 一切。

## 完了条件（機械判定）
- `pnpm check` 緑
- 上記テストケースが網羅されている
- `anchors.ts` が `db` / `next` / DOM API のいずれも import していない

## 人間の判定（別トラック）
なし。
