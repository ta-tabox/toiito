# 文章とコミットの規約（常時）

`paths` を持たないので毎セッション起動時に読み込まれる。
コードに触らないセッション（PR 本文・レビュー返信・md の執筆・コミットだけの作業）でも効かせるために、コードの規約（`coding.md`）から切り出してある。
コードのコメントにも同じ四規律が当たる（`coding.md`「コメント」節が本書を指す）。

## 文章の四規律
- 改行は句点でのみ入れる。
  読点や節の境界では折らない。
  日本語としては意味の切れ目でも、桁で折った跡と見分けが付かない。
  折りたくなったら、それは折る合図ではなく文を割る合図
- 1 行 1 文。
  一文直したときの diff が 1 行で済み、レビューで「この文」を指せる状態が、桁で折らない理由そのもの
- 桁で折らない理由は diff の粒度と語間の空白。
  一語足すだけで段落まるごとが流れ直し、日本語は語間に空白が無いので改行が無かった境界を新しく挿入する（英語の折り返しは既にある空白へ乗るだけ）
- 理由は結論の前に置く。
  日本語は述語が末尾に来るので、「B なので A」と書けば一文で閉じる。
  「A。B」と倒置すると文が一度閉じてしまい、理由を継ぎ足す場所が文の外にしか無くなる。
  倒置してよいのは、結論を先に立てること自体が目的のときだけ（走査して拾わせたい禁止則など）
- 言い切った文の末尾へ `——` で補足を継ぎ足さない。
  読み手は文が閉じたと思って読み下した後に、もう一度戻される。
  補足は次の行の独立した文にする（括弧の内側は文が閉じていないので、この限りでない）。
  ただしこれは症状への対処で、原因は上の倒置。
  `——` を禁じても倒置が残れば、継ぎ足しが二文目に化けるだけ
- 箇条・例示・図示の行は句点で閉じなくてよい。
  散文ではないので、そもそも折れた文ではない

## コミットの粒度
- **1コミット＝1つの変更**。
  「セッションの区切りだから」「レビュー対応を一度にやったから」でまとめると読み手は差分から意図を復元できないので、時間やパスで区切らない
- 判定は書き手でなく**読み手**に置く: そのコミットを指されたとき、指摘と変更の対応が一目で付くか。
  レビュー指摘への対応は **1指摘＝1コミット**が既定
- まとめてよいのは**同じ一つの理由で一緒に変わるとき**だけ。
  同じ箇所を触る複数の指摘、変更とそれが壊したテストの追随など、分けると片方だけでは不完全になるもの
- **各コミット時点で検査が緑**であること。
  途中で落ちる分け方は、分け方の方が誤り（制約の移設とその参照の追加を割ると、前者だけでは制約が消える）
- `git add -A` の一括ステージは粒度の判断を消す。
  何をこのコミットに入れるかを決めてから staging する
- 実装でも同じ。
  「機能を作った」で1つにせず、検証できる単位で割る（lib 関数 + テスト → UI 配線）

## 文章（コミット本文・PR・レビュー返信・md）
- 改行はコメントと同じ規律で入れる。
  句点でのみ折り、桁では折らない。
  md はビューアが折り返すので、桁合わせ自体が意味を持たない
- 人間が読む文（PR 本文・レビュー返信・md）は だ・である調
- コミットを指すときは**ハッシュだけで一行**、本文は次の行から書く。
  バッククォートで囲むと自動リンクが効かず、文中に埋めてもリンクにならないことがある
- 番号・記号で事物を指すときは、人間が分かる名前を添える。
  issue 番号・ADR 番号・脚注記号は機械には一意だが読み手には中身が空なので、番号だけで進む文は書き手にしか復元できない。
  `#9（検索の絞り込み UI）` のように、その記号が何を指すかを本文の中へ置く。
  コミットの**ハッシュだけで一行**はこの限りでない——何のコミットかは次の行の本文が言う
- 返信の投稿は push の後（commit → push → 返信）。
  未 push のハッシュはリンクにならない


## 語彙と読み手（2026-09-08 追加）
比喩と婉曲は特定の語を禁じても残るので、規律は判定手順が付く形で書く。
各項に英語の対を付けてある。英語で書くときも同じ規律に従う。

- 比喩で言えることは直叙で言う。
  言い換えが存在する比喩は装飾なので使わない。
  / Say it literally if a literal phrase exists; a metaphor with an available literal equivalent is decoration
- 用語集を持つプロジェクトでは、その一覧にある語だけ独自用語として使う。
  一覧を持たないプロジェクトでは独自用語を使わない。
  どちらでも初出で一行定義し、語を一般的でない意味へ転用しない。
  用語集の場所はそのプロジェクトの `CLAUDE.md` が指す
  / Use a house term only if the project's glossary lists it; if there is no glossary, use none. Define it on first use either way
- 読み手はこのセッションを見ていない、を既定にする。
  コメント・コミット本文・PR・質問文は、その文と対象のコードや差分だけで意味が取れること。
  会話を指す語（「上の議論のとおり」「例の件」）を書かない
  / Assume the reader has not seen this session; a comment, commit, PR, or question must be understandable from itself and the code it sits on
- 各文の主語と目的語を名詞で書く。
  指示語（これ・それ・例の・上の）で対象を指さない。
  概念を主語にして人の判断を隠さない
  / Every sentence names its subject and object with a noun; no demonstratives for the referent; do not hide a human decision behind an abstract subject
- 結論は動詞で言い切る。
  含意・反語・皮肉で結論を代替しない。
  皮肉を載せた文の直後に、同じ内容を直叙で一文書く
  / State the conclusion with a verb; do not replace it with implication, rhetorical question, or irony; after an ironic sentence, restate it literally
- 質問は「何を決めるか」を一文目に置き、選択肢は名詞で書く。
  選択肢の説明には「選ぶと何が起きるか」だけを書く
  / A question states the decision in its first sentence; options are nouns; option descriptions say what happens if chosen
- 残る文章を書く直前に、指示語・比喩・会話参照の3種を走査して置換する
  / Before writing persistent text, scan for demonstratives, metaphors, and references to the conversation, and replace all three

| 悪例 | 良例 |
|---|---|
| 器の側で判じる | このリポジトリの担当者が決める |
| 上の議論のとおり、口を一本にする | 入力手段を `dispatch-capture` の1本に限る |
| 超えたら封緘（正典 membrane.md） | 800 字を超えたら本文を `memory/parcels/` のファイルへ移し、ここには要約1行と参照を残す |
| 検査が緑であることは、意図した条件下で緑であることを保証しない、というのが答えになる | 検査が通っても、固定した版で走ったとは限らない。版も検査で確かめる |
| Handled the edge case per our earlier discussion | Return an empty list when `items` is `None` (previously raised `TypeError`) |
| This is where the membrane earns its keep | This check stops kb-only facts from being copied into `memory/notes/` |

## プロジェクト固有（育てる欄）
- 「箇条・例示・図示の行は句点で閉じなくてよい」を四規律に足し、雛形の「緩めてよいのは箇条の 1 項目の内側だけ」を落としている。
  理由は、このリポジトリの md が箇条中心で、閉じない行の方が多数派だから。
  雛形はこの緩和条項を保つ判断なので（2026-08-25 の逆流で棄却）、ここはこのリポジトリの逸脱として残す
