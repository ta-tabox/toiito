# ストリーミング実装（SSE）
labels: claude,post-mvp

**前提**: #9 ／ **担当**: Claude ／ **参照**: `extensions/streaming.md`（#9 の成果物）

## 目的
#9 で確定した設計どおりに実装する。**設計を書き直しながら実装しない**——
迷いが出たら #9 へ差し戻す。

## 作るもの
`extensions/streaming.md` の各節に対応する実装。要点のみ再掲:
- `api/speak/route.ts`（SSE）
- `callPersonaStream` + フェイクモードのチャンク分割
- フォームの client component 化と逐次描画
- #6 のシナリオ 1 をストリーミング対応へ改修

## 不変条件（破ったら差し戻し）
- 逐次性（`ai_a` → `ai_b`）を並列化しない
- `messages` は immutable。途中経過を DB に書かない

## 完了条件（機械判定）
- macOS で `pnpm check:full` 緑（改修後の e2e 含む）

## 人間の判定（別トラック）
実機で体感が改善したか。close を妨げない（機械判定が本体）。
