# 0027. コーディング規約は `.claude/rules/` に置き、`CODING.md` はルートから消す

- **状態**: 採用
- **決定日**: 2026-09-06
- **関係する ADR**: なし

## 文脈

規約の核 `CODING.md` がルートにあり、`CLAUDE.md` が `@CODING.md` で起動時に無条件で読み込んでいた。
言語固有の作法は skill の `languages/typescript.md` に沈んでいて、「書き始める前に開く」という散文の指示で発火を担保していた。
この器の `languages/typescript.md` は Prisma のコメント規約や機械層の一覧まで抱えて 115 行あり、開き忘れの被害がそのぶん大きい。

fermentary の雛形が 2026-09-06 に配布先を `.claude/rules/` へ改めた（`fermentary/playbooks/coding-standards.md` 二層構造節。経緯は同 `coding-standards-rationale.md` #9）。
coten-atlas と book-atlas は同日に揃えている（coten-atlas ADR-0033、book-atlas ADR-0002）。

## 決定

- 従わせる規則は `.claude/rules/` に置く。
  `writing.md` は frontmatter の `paths` を持たず起動時に読み込まれ、`coding.md` と `languages/typescript.md` は `paths` の glob に当たるファイルを Read した時点で読み込まれる
- `CODING.md` は消す。
  本文はこの器の版のまま `writing.md`（文章の四規律・コミットの粒度・PR 本文）と `coding.md`（命名〜テスト）に分ける。
  雛形の現行版へは揃えない。
  この器の版は句点ごとの改行と緩和条項（箇条・例示の行は句点で閉じなくてよい）を持ち、どちらも記録された逸脱である
- skill の `languages/typescript.md` は `.claude/rules/languages/` へ移す。
  `paths` には `*.prisma` も入れる。
  Prisma スキーマのコメント規約がそのファイルにあるので、`.prisma` を Read したときにも読み込まれる必要がある
- `CLAUDE.md` は規範本文を `@` でインポートしない。
  入口には規約の所在と、隣接ファイルを読まずに新規ファイルを書くときは先に rules を Read する旨だけを置く
- `DESIGN.md` と、ルートの他の文書（`VISION.md`・`ARCHITECTURE.md`・`HARNESS.md`・`ROADMAP.md`・`DEPLOY.md`）の置き場は本レコードでは決めない。
  雛形の側は「ルートに置くのは道具がそのパスを決め打ちで読むファイルだけ」（`fermentary/playbooks/terrarium.md` 原則節）へ改まっているが、この器は参照が ADR の外に 126 箇所あり、移動は別の作業単位になる

## 理由

`.claude/rules/` の `paths` は glob 一致で読み込みを決めるので、散文の「開け」より発火が確実で、コードに触らないセッションでは `coding.md` と言語別の分の文脈を払わずに済む。
`@` インポートは起動時に無条件で展開されるので、`CODING.md` を `docs/` へ動かして `@docs/CODING.md` で読む案は位置が変わるだけで機構が変わらず、採らなかった。

skill `coding-standards` 本体（判断基準集）は rules に載せない。
rules は一度注入されると以後の全ターンに残るので、コードに触るたびに固定費になる。

`writing.md` を切り出したのは、文章の四規律とコミットの粒度が PR 本文やレビュー返信にも効く規律で、`paths` でコードに縛ると落ちるからである。

## 帰結

- `.claude/rules/{writing,coding}.md` と `.claude/rules/languages/typescript.md` が増え、`CODING.md` と `.claude/skills/coding-standards/languages/` が消える
- `CLAUDE.md`「コーディング規約」節と git 節の「粒度の正」、`HARNESS.md`「機械が見ている分」の一覧の所在、`README.md`「文書」節、`DESIGN.md` の YAGNI への参照、`web/biome.json` のメッセージ、`web/scripts/lint-comments.ts` のコメントは `.claude/rules/` を指す
- 0026 までのレコードが名指しする `CODING.md` は `.claude/rules/coding.md`（コード）か `writing.md`（文章・コミット）と読む
- 雛形の `design.md`（UI 規約の骨格）は配っていない。
  この器は `DESIGN.md` を既に 297 行持っており、規範と記述の切り分けを先に決める必要がある

## 覆る条件

Cowork のクラウド実行で project の `.claude/rules/` の `paths` が効かないと実測されたとき。
その場合は `paths` を外して無条件読み込みに落とし、ファイル構成は変えない。
判定は `web/src/lib/question.ts` を Read した直後の `/context` に `coding.md` と `languages/typescript.md` が載るかで行う。

Claude Code が `.claude/rules/` の機構を廃止したとき。
