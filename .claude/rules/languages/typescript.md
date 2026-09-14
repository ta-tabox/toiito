---
paths:
  - "**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}"
---

# TypeScript / JavaScript への写像

核の原則（`coding.md`）を TS のイディオムへ対応付ける。
上の `paths` に当たるファイルを Read した時点で読み込まれる。
toolchain（pnpm / Biome / mise）の設定はここでは扱わない。
ここは書き方のみ。

## 不変を既定に
- `const` で宣言し、再代入が本質的なときだけ `let` にする
- プロパティは `readonly`、配列は `ReadonlyArray<T>` / `readonly T[]` を検討
- 更新はスプレッドで新オブジェクト生成を基本とし、局所的な可変は関数内に閉じる

## 不正状態の表現不能化
- 直和型 + 判別子で状態を分ける:
  `type State = { kind: "loading" } | { kind: "loaded"; data: Item[] } | { kind: "error"; error: Error }`
  「loading なのに data がある」を型レベルで排除する
- 「無い」の表し方を `undefined` か `null` のどちらかに決め、リポジトリの中で揃える。
  決めた側と、外部の値（DB の NULL 列・JSON の `null`）を写す型だけに現れる例外は「プロジェクト固有」欄に書く
- 外から来た値は `unknown` で受け、絞り込んでから使う
- 値域は `as const` の並びから型を導く（`(typeof VALUES)[number]`）。
  値域ごとの表は `Record<値域の型, …>` で受け、値を足したときに型検査で止まる形にする
- 検証を通った値はブランド型（`string & { readonly __brand: "OwnerId" }`）で表し、その型を作るのは検証した関数だけにする

## 関数・エラー
- 引数 3 つ以上はオブジェクト引数へ（呼び出し側が自己文書化される）
- 異常は例外で表す。
  Result 型（`{ ok: true; value } | { ok: false; error }`）を採るリポジトリは「プロジェクト固有」欄にそう書き、混在させない
- `async` の結果は `await` するか、待たない意図を `void` で明示する

## 式と制御
- `await` は文の先頭か代入の右辺に置く。
  引数の中で `await` した値は、先に変数へ受けてから渡す
- 配列から配列を作るときは `map` と `filter` を使い、添字が要るときも `map` の第二引数で受ける。
  `for` を使うのは、途中で return するか、`await` を直列に待つときに限る
- 一つの意味を持つコメントとその対象は空行で区切り、どの文に付くコメントかを見て分かるようにする

## import
- パスエイリアス（`@/...`）で書く。
  相対パスの登り（`../`）は位置を語らない
- **例外は `@` を定義する側だけ**。
  エイリアスが解決される前に読まれる設定ファイルと、素の node が読むスクリプトは相対パスで書く

## 命名
- 型は PascalCase、値は camelCase、定数は用途次第（グローバル定数のみ UPPER_SNAKE）
- 型名は PascalCase の名詞にし、実装と同じ語で呼ぶ。
  `I` プレフィクスで実装と区別したくなるのは設計が滲んでいる兆候

## 余白
- 論理ブロックごとに 1 行空ける。
  空けるのは 1 行で、連続 2 行はトップレベルの区切りにも使わない
- Prettier / Biome は既存の空行を（1 行に丸めて）保存するだけで、足してはくれない。
  整形が通ることと読めることは別
- メソッドチェーンは段ごとに改行して意図を段落化する

## コメント / JSDoc
- モジュール冒頭は `/** ... */` で責務と境界を書く
- **関数には例外なく JSDoc を付ける**（export の有無・行数を問わない）。
  自明に見える関数ほど、書こうとして初めて「何を保証するか」が言えないことに気付く
- **1 行 1 文**。
  1 行完結の JSDoc も対象で、2 文あるならブロックへ展開する
- **1 行目は what を完全な文で書く**。
  動詞・対象・キー・戻り値の形を、引数名をそのまま使って一文にする（「`id` で問いを 1 件取得する。所有者が `owner` でなければ undefined」）。
  シグネチャを見なくても呼べる一文が目標で、理由・制約・失敗の仕方は空行を挟んで下へ置く。
  要約に条件や経緯を詰めると、補完のポップアップで最初に出る一行が読めなくなる
- 2 行目以降に書くのは**シグネチャが語らないこと**。
  順序の保証、失敗の仕方、呼んではいけない場面、前提にしている不変条件。
  重ねないのは `@param` / `@returns` の型注釈であって、要約から引数名を省くことではない
- **要約の語彙は関数名に合わせる**。
  名前と違う語で呼び始めると読み手は別のものを探し始めるので、`createQuestion` の説明を「問いの投入」で始めない。
  ドメインの言葉で呼びたいなら、寄せるのは説明でなく名前の方
- **宣言に付く説明は JSDoc ブロックで書き、`//` は関数本体の中だけに使う**。
  関数・クラス・型・定数の直上に `//` を置くと、エディタのホバーにも型定義の参照にも出ない。
  書いた説明が呼び出し側へ届かなくなる
- `@param` と `@returns` には、型が語れない制約だけを書く。
  `@param {string} name` の型注釈は TS の型と重複する
- 構文から意図が読めない一行（`.min(1)`、`path.resolve(root, \`.${relative}\`)`）には、その行の理由を `//` で添える
- コメントで名指した識別子とファイル名は、改名した回に一緒に直す
- Prettier / Biome はコメントの内部を折り返さない。
  `proseWrap` が効くのは Markdown だけで、`lineWidth` はコードの整形幅にしか効かない。
  折り返さない以上、改行位置は書き手が**句点でのみ**入れる

## 機械が見ている分（toiito）

以下は `pnpm check` が見る。
error は赤にし、warn は報告だけにする。
**記憶で守るのではなく、赤くなってから直してよい**。

| 規約 | 見ている道具 | severity |
|---|---|---|
| モジュール冒頭コメントの有無・`/** */`・直後の空行 | `web/scripts/lint-comments.ts` | error |
| `@param {string}` のような型注釈の重複 | 同上 | error |
| コメントの改行が句点に乗っているか（箇条・例示の行は除く） | 同上 | error |
| コメント 1 行に 2 文以上置いていないか（括弧の内側の句点は除く） | 同上 | error |
| コメントの禁止語（表は `writing.md`「語彙と読み手」節。雛形は warn） | 同上 | error |
| 関数の JSDoc の有無（雛形は warn） | 同上 | error |
| 宣言に接した `//`（雛形は warn） | 同上 | error |
| 言い切った文への `——` の後置き（雛形は warn） | 同上 | error |
| 関数の JSDoc の理由が 2 文以内か（雛形は warn） | 同上 | error |
| バッククォートで名指した識別子・ファイルの実在 | 同上 | warn |
| import は `@` 起点（`.css` と、下の例外の 3 箇所は除外） | biome `style/noRestrictedImports` | error |
| 1 行 if を分ける | biome `style/useBlockStatements` | error |
| 三項の多重ネスト・複数代入・多重宣言 | biome `noNestedTernary` / `noMultiAssign` / `useSingleVarDeclarator` | error |
| floating promise | biome `nursery/noFloatingPromises` | error |
| 関数の認知的複雑度（分割の合図） | biome `noExcessiveCognitiveComplexity` | error |
| 引数 3 つ超 | biome `complexity/useMaxParams` | error |

関数の JSDoc の理由の上限は、その関数の呼び手が実際に踏んだ誤りを挙げられるときに限って外せる。
外すときは JSDoc と宣言の間に `// lint-comments-allow comments/maxReasonSentences: <その誤り>` を置く。
誤りを書かない宣言では上限から外れない。

対象から外すものは `.gitignore` が正で、リンタも Biome も同じ正を見る（`src/generated` の Prisma 生成物はここで落ちる）。
リンタの対象は `web/src` `web/scripts` `web/tests` `web/e2e` と `web/` 直下の `*.ts`。

`style/useNamingConvention` は入れていない。
DB 由来の列名が snake_case のまま型と往復するため、誤検出が数十件になる。
命名は引き続き人間とレビューが見る。

**機械が見ていない規約の方が多い**。
「1 行目は要約だけ」「要約の語彙は関数名に合わせる」「冒頭コメントが責務と境界を語れているか」「削除テストに耐えるか」は、どれも上の表に無い。
**この節に無い作法は、書く前にこのファイルを読むこと以外に守る手段が無い。**

## プロジェクト固有（育てる欄）
- （このプロジェクトで決めた逸脱・追加をここに追記する。理由を一行添える）
- **「無い」は `undefined` で返す**。
  `null` は DB の NULL 列を写す型（`current_form`・`note`）にだけ現れ、repo 関数は `?? undefined` で `null` を `undefined` へ揃える
- **異常は例外で表す**（雛形の既定どおり。Result 型は使わない）
- **import の `@` の例外は 3 箇所**で、`biome.json` の `overrides` が持つ。
  `vitest.config.ts`（`@` を定義する側）・`tests/setup/**`（`vitest.config.ts` が読む）・`scripts/**`（素の node が読み、tsconfig の `paths` を見ない）
- **文字境界の丸めは書記素クラスタで**（`Intl.Segmenter`）。
  サロゲートペア判定では、異体字セレクタ（`神︀` = U+795E + U+FE00）・ZWJ 連結・肌色修飾が漏れて字が割れる
