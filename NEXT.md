# NEXT — toiito

セッション開始時にここを見る。
**タスクの台帳ではない**——作業単位と状態の正は GitHub Issues、順序と規約の正は `ROADMAP.md`。
ここに書くのは、 issue に載らない申し送りと、fermentary との受け渡しだけ。

## いま開いているもの

- **#11（Prisma 導入 + Postgres 一本化）は実装済み・未 push**。
  ブランチ `claude/prisma-postgres-migration-11` に `pnpm check` 緑でコミット済み。
  S0 の実データ（問い2・発話12）も Postgres へ移送済みで、UI から読めることをフェイクモードで確認した。
  **人間の担当**: 下の `.env.local` 追記 → push → PR（本文に `closes #11`）→ マージ
- **次に着手する issue**: #4 / #5（メモ UI と逆引き）。
  土台の入れ替えが終わったので割り込みは解消した。
  #2（ローディング表示）は独立なのでいつでも並行可

## 申し送り

- **[人間・必須] `web/.env.local` に接続先を二本追記する**。
  権限設定で Claude が `.env*` を触れないため、ここだけ手作業で残っている。
  これが無いと `pnpm dev` も `pnpm check` も落ちる（`DATABASE_URL が未設定` で止まる）。
  `web/.env.example` にも同じ二行を控えておくとよい。

  ```
  DATABASE_URL=postgresql://toiito:toiito@localhost:5433/toiito
  DIRECT_URL=postgresql://toiito:toiito@localhost:5433/toiito
  ```

- **[人間・任意] 移送の目視確認**。
  `docker compose up -d` のうえ `pnpm dev` で、S0 の対話二件が時刻付きで読めること。
  時刻表示は JST 固定にした（SQLite 時代は UTC の生文字列が出ていた）

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
