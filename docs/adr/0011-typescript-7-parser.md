# 0011. TypeScript は 7 へ上げ、コメント検査器のパーサだけ 6 系を別名で持つ

- **状態**: 採用
- **決定日**: 2026-08-29
- **関係する ADR**: なし

## 文脈

TypeScript 7.0.2 が stable として `latest` に出た。
7.0 は Go 移植で、`typescript` の既定 export から旧 JS コンパイラ API が外れている（既定 export は `version` と `versionMajorMinor` の 2 キーだけ）。

`web/scripts/lint-comments.ts` はコメント規約のうち Biome が構造的に検出できない分を見る検査器で、判定を `ts.createSourceFile` に渡している。
行単位の正規表現では文字列リテラル中の記号と本物のコメントを区別できず、規約の検査器自身が嘘をつくので、パーサは手放せない。

つまり `typescript` を 7 へ上げると、検査器が TypeError で即落ちる。

## 決定

`typescript` を `^7` へ上げる。

検査器のパーサだけ `@typescript/typescript6` を devDependency へ足し、import をそちらへ向ける。

## 理由

**型検査の速さと将来の追随が、検査器の依存 1 つより重い。**
検査器が必要としているのは 6 系の JS API という一点なので、そこだけを名前で切り出せば器全体を 6 系に縛らずに済む。
この綴りは fermentary の雛形が既に採っており、この器はむしろ逸脱していた側である。

**`typescript` を 6 系へエイリアスし、7 系を `@typescript/native` へ逃がす案を採らなかった条件**: Microsoft の移行案内はこちらを勧めるが、Next.js 16.3 は `experimental.useTypeScriptCli` の既定が `true` で、型検査を `typescript/bin/tsc` というファイル名で叩く。
6 系が出すバイナリは `tsc6` なので、ビルドが落ちる（実測 2026-08-26）。
Next.js がこの既定を外すか、6 系が `tsc` の名前も出すようになれば、この条件は消える。

**6 系に留まる案を採らなかった条件**: 7 が stable で出た以上、留まる側が追随の負債を溜める。
7 が実挙動で壊れることが分かれば、この条件は復活する。

## 帰結

- 検査器は fermentary の雛形と**完全に一致する**。
  器固有の逸脱がゼロになったので、次の配り直しは `cp` 一回で済む
- devDependency が 1 つ増える。
  用途は検査器のパーサだけで、`src/` からは引かない
- 型検査が速くなる。
  `next build` の TypeScript 段が 958ms から 204ms になった（手元・2026-08-29）

## 覆る条件

- TypeScript 7.1 が旧 JS コンパイラ API の代替を出し、検査器の収集層をそちらへ移せたら。
  `@typescript/typescript6` を落とせる（fermentary に条件付き保留のスレッドがある）
- Next.js が `useTypeScriptCli` の既定を変えたら。
  採らなかったエイリアス案が成立するようになるので、どちらが素直かを選び直す
