# TypeScript / JavaScript への写像

核の原則（CODING.md）を TS のイディオムに落とす。toolchain 正典
（pnpm / Biome / mise）は `fermentary/playbooks/toolchain.md` が持つ——ここは書き方のみ。

## 不変を既定に
- `const` を既定。`let` は再代入が本質的なときだけ。`var` は使わない
- プロパティは `readonly`、配列は `ReadonlyArray<T>` / `readonly T[]` を検討
- 更新はスプレッドで新オブジェクト生成を基本とし、局所的な可変は関数内に閉じる

## 不正状態の表現不能化
- 直和型 + 判別子で状態を分ける:
  `type State = { kind: "loading" } | { kind: "loaded"; data: Item[] } | { kind: "error"; error: Error }`
  「loading なのに data がある」を型レベルで排除する
- `null` と `undefined` を混在させない（プロジェクトでどちらかに決める）
- `any` は型システムの放棄。`unknown` + 絞り込みで受ける

## 関数・エラー
- 引数 3 つ以上はオブジェクト引数へ（呼び出し側が自己文書化される）
- 例外で表すか Result 型（`{ ok: true; value } | { ok: false; error }`）で表すかを
  プロジェクトで統一する。混在が一番読めない
- `async` の投げっぱなし（floating promise）を許さない

## 命名
- 型は PascalCase、値は camelCase、定数は用途次第（グローバル定数のみ UPPER_SNAKE）
- 型名に `I` プレフィクスを付けない。実装と区別したいのは設計が滲んでいる兆候

## 余白
- 論理ブロックごとに 1 行空ける。連続 2 行は入れない
- Prettier / Biome は既存の空行を（1 行に丸めて）保存するだけで、足してはくれない。
  整形が通ることと読めることは別
- メソッドチェーンは 1 行に詰めず、段ごとに改行して意図を段落化する

## コメント / JSDoc
- モジュール冒頭は `/** ... */` で責務と境界を書く。ファイル名の言い換えにしない
- 型で表現済みの `@param {string} name` を重複させない。型が語れない制約だけ書く
- Prettier / Biome はコメントの内部を折り返さない（`proseWrap` が効くのは
  Markdown のみ）。改行位置は整形任せにできず、書き手が意味の切れ目で決める

## プロジェクト固有（育てる欄）
- （このプロジェクトで決めた逸脱・追加をここに追記する。理由を一行添える）
