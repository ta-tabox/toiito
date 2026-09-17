---
paths:
  - "**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}"
---

# TypeScript / JavaScript のうち toiito だけの規則

`typescript.md`（配布元のテンプレートとバイト一致させる配布物）に加えて読み込まれる。
テンプレートからの逸脱と追加だけを持ち、`typescript.md` は書き換えない。

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
**この節に無い作法は、書く前に `typescript.md` を読むこと以外に守る手段が無い。**

## 逸脱と追加
- **「無い」は `undefined` で返す**
  `null` は DB の NULL 列を写す型（`current_form`・`note`）にだけ現れ、repo 関数は `?? undefined` で `null` を `undefined` へ揃える
- **異常は例外で表す**（雛形の既定どおり。Result 型は使わない）
- **import の `@` の例外は 4 箇所**で、`biome.json` の `overrides` が持つ
  設定ファイル（`vitest.config.ts`・`next.config.ts`・`prisma.config.ts`。`@` が解決される前に道具が読む）・`tests/setup/**`（`vitest.config.ts` が読む）・`scripts/**`（素の node が読み、tsconfig の `paths` を見ない）
- **文字境界の丸めは書記素クラスタで**（`Intl.Segmenter`）
  サロゲートペア判定では、異体字セレクタ（`神︀` = U+795E + U+FE00）・ZWJ 連結・肌色修飾が漏れて字が割れる
