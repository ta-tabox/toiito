---
paths:
  - "**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}"
---

# TypeScript / JavaScript のうち toiito だけの規則

`typescript.md`（配布元のテンプレートとバイト一致させる配布物）に加えて読み込まれる。
テンプレートからの逸脱と追加だけを持ち、`typescript.md` は書き換えない。

## 機械が見ている分（toiito）

表の全体と各規則を何のために見るかは `typescript.md`「機械が見ている分」が持ち、ここは雛形との違いだけを持つ。
リンタの置き場は `web/scripts/lint-comments.ts` である。

雛形で warn の規則のうち、次の規則を error に上げている。

| 規則 | 道具 |
|---|---|
| コメントの禁止語 | `web/scripts/lint-comments.ts` |
| 関数の JSDoc の有無 | 同上 |
| 宣言に接した `//` | 同上 |
| 言い切った文への `——` の後置き | 同上 |
| 関数の JSDoc の理由が 2 文以内か | 同上 |
| 引数 3 つ超 | biome `complexity/useMaxParams` |

このリポジトリだけの規則は次のとおり。

| 規則 | 道具 | severity | 何のために |
|---|---|---|---|
| `@/lib/auth` を import せず、セッションは `src/lib/auth/current-user.ts` から読む | biome `style/noRestrictedImports` | error | セッションを読む経路を一本に絞る |
| Prisma の生成物（`@/generated/**`）を import するのは `src/lib/db.ts` だけ | 同上 | error | DB への経路を一つのモジュールに閉じる |
| `src/components/**` から `node:*` を import しない | 同上 | error | 部品はクライアントのバンドルに入りうる |
| `src/lib/**` から `src/app/**` を import しない | 同上 | error | 依存を `src/app` から `src/lib` への一方向に保つ |

関数の JSDoc の理由の上限は、その関数の呼び手が実際に踏んだ誤りを挙げられるときに限って外せる。
外すときは JSDoc と宣言の間に `// lint-comments-allow comments/maxReasonSentences: <その誤り>` を置く。
誤りを書かない宣言では上限から外れない。

対象から外すものは `.gitignore` が正で、リンタも Biome も同じ正を見る（`src/generated` の Prisma 生成物はここで落ちる）。
リンタの対象は `web/src` `web/scripts` `web/tests` `web/e2e` と `web/` 直下の `*.ts`。

`style/useNamingConvention` は入れていない。
DB 由来の列名が snake_case のまま型と往復するため、誤検出が数十件になる。
命名は引き続き人間とレビューが見る。

## 逸脱と追加
- **「無い」は `undefined` で返す**
  `null` は DB の NULL 列を写す型（`current_form`・`note`）にだけ現れ、repo 関数は `?? undefined` で `null` を `undefined` へ揃える
- **異常は例外で表す**（雛形の既定どおり。Result 型は使わない）
- **import の `@` の例外は `biome.json` の `overrides` が持つ**
  設定ファイル（`vitest.config.ts`・`next.config.ts`・`prisma.config.ts`。`@` が解決される前に道具が読む）・`tests/setup/**`（`vitest.config.ts` が読む）・`scripts/**`（素の node が読み、tsconfig の `paths` を見ない）
  Biome の `overrides` は `noRestrictedImports` の options を合成せず丸ごと置き換え、一つのファイルに複数当たると後ろのものだけが効くので、各 `overrides` は制限の全体を持ち、広い `includes` を前に置く
- **文字境界の丸めは書記素クラスタで**（`Intl.Segmenter`）
  サロゲートペア判定では、異体字セレクタ（`神︀` = U+795E + U+FE00）・ZWJ 連結・肌色修飾が漏れて字が割れる
