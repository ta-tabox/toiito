# 発話フォームのローディング表示
labels: claude,ui,small

**前提**: なし（独立） ／ **担当**: Claude ／ **参照**: `PLAN-rationale.md` S0 節（この要件が出た経緯）

## 目的
二体の AI 応答を同期で待つ間、UI が無反応に見える状態を解消する。
S0 の実機確認で出た派生要件。**他のどの issue とも技術的な依存がない**ので、
いつ着手してもよい（旧プランでは S2 に相乗りしていたが、同居する理由がなかった）。

## 作るもの
- 発話フォームを client component 化し、`useFormStatus` の `pending` で:
  - 送信ボタンを無効化
  - 「二体が応答中…」の表示
- ロジックは持たない。表示だけ。

## 触らないもの
`actions.ts` の中身、`claude.ts`、DB 層。

## 完了条件（機械判定）
- `pnpm check` 緑

## 人間の判定（別トラック）
`TOIITO_FAKE_AI=1 pnpm dev` で送信中の表示を目視。close を妨げない。
