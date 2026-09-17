# toiito

目的: 問いを仕込んで発酵させる Web アプリ「トイット（Toiito）」を設計・実装する。
AI をスピードアップではなくスローダウン（自分の問いを深め、安易な答えに逃げない）のために使うという問題意識の具体化。
全体像は `docs/VISION.md`（立ち上げ時に意味構築した正）。
見た目と使用感は、規則の正が `.claude/rules/design.md`、値と現況の正が `docs/DESIGN.md`（色・書体・余白・状態の見せ方・残す摩擦）。
完了条件: MVP（問い投入 → 二視点AIとの対話 → キーワードメモ → メモからのセッション逆引き、の一連）が動き、自分の問いで実際に常用できている状態。
このプロジェクトは有期で、完了条件を満たしたら**終わる**。

## 正はどこにあるか
**作業単位と状態の正は GitHub Issues**、順序と横断規約の正は `docs/ROADMAP.md`、決定の正は `docs/adr/`（1決定1レコード・追記のみ・覆すときは supersede。規約は `docs/adr/README.md`）。
**この三つの外に申し送りの層を持たない**（理由は ADR-20260901-retire-next-md（`NEXT.md` の廃止））。
続きは open の issue から拾う。
現在地の一枚が要るときは、写しを保守するのでなく三つから取り直して作る。

## 開発ハーネス（本文は `docs/HARNESS.md`）
ローカル Postgres を立ててから作業する（ルートで `docker compose up -d`。接続は `web/.env.local` に `DATABASE_URL` と `DIRECT_URL` の二本）。
手元と worktree の準備（フックの向き先・依存・Postgres・開発用 DB）は `scripts/setup.sh` 一本で、セッション起動フックが呼ぶ。
変更 → `web/` で `pnpm check`（型→lint→テスト→ビルド）→ 緑ならコミット。
**check が赤のままコミットしない**。
道具は pnpm・mise（`mise.toml` が正）・Biome（`biome.json` が正。書式は `pnpm format` で機械的に直す）の一本ずつで、npm/yarn・corepack・ESLint/Prettier は使わない。
AI 呼び出しを伴う動作確認は `TOIITO_FAKE_AI=1` で（実 API を自動テストで叩かない）。
ロジックは lib 層へ寄せ、「lib 関数 + テスト → UI 配線」の順で作る。

## 規約の入口
- 規約は `.claude/rules/`
  `writing.md` は常時、残り（`coding.md`・`layers.md`・`design.md`・`languages/*.md`）は frontmatter の `paths` に当たるファイルを Read した時点で読み込まれる
- **コードを書く前に** skill `coding-standards`（判断の例）と `karpathy-guidelines`（過剰実装と巻き込み変更の抑制）を開く
  実装・テスト追加・バグ修正・レビュー・リファクタのすべてが対象
- 隣接ファイルを読まずに新規ファイルを書くときは、先に `.claude/rules/coding.md` と該当言語の `languages/<lang>.md`（画面へ触るなら `design.md` も）を Read する
- 書き終えたら、PR の前に skill `coding-standards`「レビューで繰り返し指摘される型」の表を、変更した各コメント・名前・ファイルへ当てる
- `karpathy-guidelines` は外部由来（https://github.com/multica-ai/andrej-karpathy-skills の 2c60614、MIT）で、リモートの空のコンテナでも初回から効くよう本体を `.claude/skills/` へ同梱してある
  上流の更新は手で取り込む

## 環境変数（`.env*`）
**秘密を含む `.env*` は Claude が読めず、`.env*` はどれも Claude が書けない**（`.claude/settings.json` の `deny`。決定と経緯は ADR-20260902-env-file-scope（`.env*` を Claude が触ってよい範囲））。
書いて漏れうるのは追跡対象の `.env.example` だけなので書き側に例外を置かず、読んで漏れるのは秘密を持つ側だけなので `.env.example` は読める。
- **env に足すものが出たら、自分で書かず人間へ渡す**（変数の一覧と意味は `web/README.md`）
  `web/.env.example` の更新も人間の手に入る
- **worktree に `.env.local` を作らない**
  本体と同じ `DATABASE_URL` を持つコピーは、worktree の migration を本体の開発用 DB へ積む（`.worktreeinclude` が同じ理由でこのファイルを対象から外している）
  worktree の接続先とサインイン・AI の既定は `web/scripts/checkout-environment.ts` が導くので、`pnpm dev`・`pnpm seed`・Prisma CLI に前置きは要らない
- **deny に当たったら、別経路を探さずそこで止める**
  機械層が塞ぐのはツールの読み書き・`cat` や `sed`・リダイレクトの書き込み先までで、`python` や `node` のスクリプトが自分でファイルを開く経路には届かない
  届かない分をこの規約が持つ

## git
このリポジトリは**公開する**前提で、コミットは時間でなく関心で区切る（粒度と文体の正は `.claude/rules/writing.md`）。
- **author は人間名義**
  Claude も `-c` を付けず素の `git commit` を使う
  リモートは committer だけ Claude 名義で、直さない（名義の置き場は `docs/HARNESS.md`「設定の置き場」）
- **Co-authored-by は、Claude がそのコミットの中身を書いたときに付ける**（文言は `.claude/settings.json` の `attribution`）
  衝突なしのマージには付けず、衝突を解いたマージ・`revert`・`cherry-pick` には自分で足す
- **Actions 経由の Claude はコメントまで**
  差分を作るのは人間かローカル／リモートのセッションで、`.github/workflows/claude.yml` の `contents: read` がこれを機械で満たす（決め直すときは issue #19（Actions 経由の Claude の権限）の三案に戻る）
- **prefix は変更の型**（`feat:` `fix:` `docs:` `refactor:` `chore:` `test:`）
  スコープもプロジェクト名も添えない
- **push・issue と PR の起票・コメント・close は Claude が叩いてよい**（どれも追記か、reopen で戻る）
- **戻せない操作（force push・履歴の書き換え・ブランチやタグの削除）と PR のマージは、その都度人間に諾否を訊く**
  マージは main への push が本番デプロイと migration を起こすので、戻る操作に入れない
- 機械の判定は `.claude/settings.json` の `permissions` と、コマンド全文を見る `.claude/hooks/guard-force-push.sh`・`guard-gh-api.sh` が持つ
  機械は保険で、正はこの節
- **PR も author は人間**
  Claude の関与は本文の「判断したこと」節に判断の中身だけを書く（書式は `.github/pull_request_template.md`）
