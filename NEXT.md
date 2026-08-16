# NEXT — toiito

セッション開始時にここを見る。
**タスクの台帳ではない**——作業単位と状態の正は GitHub Issues、順序と規約の正は `ROADMAP.md`。
ここに書くのは、 issue に載らない申し送りと、fermentary との受け渡しだけ。

## いま開いているもの

- **#1（メモ lib 層）は実装済み・未 push**。
  ブランチ `claude/next-memo-implementation-83910e` に `pnpm check` 緑でコミット済み。
  **人間の担当**: push → PR（本文に `closes #1`）→ CI 緑でマージ
- **次に着手する issue**: #11（Prisma 導入 + Postgres 一本化）。
  **#3〜#5 への割り込み** （2026-08-15 決定）。
  repo 関数が `async` になるので、メモ UI が乗る前に土台を替える。
  #2（ローディング表示）は独立なのでいつでも並行可

## 申し送り

- **[人間・任意] ペルソナ改定の体感確認**。
  S0b で二体に手筋のカタログと材料の供給規律を入れたが、効きは L5（人間の官能）でしか測れない。
  `pnpm dev` で自分の問いを一件投げてみて、手応えが薄ければ `web/src/personas/*.md` を直接編集してよい（プロンプトは文書として管理する方針。
  コード変更は不要）。
  どの issue の前提でもない

## fermentary との受け渡し

- セッション開始時に fermentary `NEXT.md` の自分宛（`[→toiito]`）搬送メモを確認し、拾ったら消す。
  宛先が自分でないメモは実行も削除も編集もしない
- 常用中に出た違和感は膜の一行判定で振り分ける（アプリ改善ネタ → issue、概念的な学び → fermentary の inbox/questions）

## 文書の地図

| 文書 | 役割 |
|---|---|
| `VISION.md` | なぜ作るか（最上位） |
| `ARCHITECTURE.md` | どう作るか（スキーマ・オーケストレーションの正） |
| `HARNESS.md` | どう検証するか（L0〜L5・フェイクモード） |
| `ROADMAP.md` | どの順で作るか（依存グラフ・横断規約・MVP 完了条件） |
| GitHub Issues | 何を作るか + 状態（実行単位の正） |
| `PLAN-rationale.md` | なぜそう決めたか（経緯層。着手時に読む必要はない） |
| `extensions/` | MVP 後に解凍する構想（graph-view / fermentation-and-outlets） |
