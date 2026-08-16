# NEXT — toiito

セッション開始時にここを見る。
**タスクの台帳ではない**——作業単位と状態の正は GitHub Issues、順序と規約の正は `ROADMAP.md`。
ここに書くのは、 issue に載らない申し送りと、fermentary との受け渡しだけ。

## いま開いているもの

- **#11（Prisma 導入 + Postgres 一本化）は PR #14 でレビュー待ち**。
  `pnpm check` 緑、main も取り込み済み。
  レビュー指摘に対応し、SQLite からのデータ移送は取りやめた（2026-08-16 決定。開発初期で作り直せる段階なので、移送のために持ち込む複雑さの方が高くつく）。
  migration は init 一本、DB は空から立ち上がる。
  **人間の担当**: レビュー → マージ
- **次に着手する issue**: #4 / #5（メモ UI と逆引き）。
  土台の入れ替えが終わったので割り込みは解消した。
  #2（ローディング表示）は独立なのでいつでも並行可

## 申し送り

- **[Claude 向け] `.env*` は権限設定で Claude が触れない**。
  接続先の追記は済んでいる（2026-08-16 に人間が実施）。
  以後 env に何か足す必要が出たら、自分で書かず人間へ渡すこと。
  変数の一覧と意味は `web/README.md`。
  リモート（Claude Code on the web）だけは例外で、`.env.local` はセッション起動フックが書く（手元には存在しないファイルなので、上書きの心配は無い）

- **[Claude 向け] リモートは docker 無しで動く**。
  `.claude/hooks/session-start.sh` が Postgres・toolchain・依存・migration を用意するので、`docker compose up -d` を探しに行かない。
  非対称（Postgres 16・mise 直置き）は `HARNESS.md`「リモート」が正

- **[人間・任意] 空の DB からの手触り確認**。
  `docker compose up -d` のうえ `pnpm dev` で、問いを一件投げて二体が応答するところまで。
  S0 の対話は移送しないと決めたので一覧は空から始まる。
  旧 SQLite の実体は `web/data/`（git 管理外）に残してあるので、後から読み返したくなったら手はある

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
