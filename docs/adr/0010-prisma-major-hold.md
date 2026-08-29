# 0010. Prisma は 7 系で止め、三つのパッケージの版を明示で指定する

- **状態**: 採用
- **決定日**: 2026-08-29
- **関係する ADR**: 0003

## 文脈

`prisma`（CLI）の `latest` タグが `8.0.0-rc.12` を指している（2026-08-29 実測）。
一方で `@prisma/client` と `@prisma/adapter-pg` の `latest` は `7.10.0`（stable）のままである。

タグが割れているので、`pnpm update --latest` を素で叩くと **CLI だけが 8 の RC になる**。
Prisma は CLI と client の版一致を要求するので、意図せず片肺の組み合わせが lockfile へ入る。

CLI は実行のたびに `Update available 7.10.0 -> 8.0.0-rc.12` を出し、`npm i --save-dev prisma@latest` を勧めてくる。
放っておくと、この案内に従った誰かが同じ穴に落ちる。

## 決定

Prisma は 7 系で止め、上げ先を `7.10.0` とする。

`prisma` / `@prisma/client` / `@prisma/adapter-pg` の三つは、**常に版を明示して同時に動かす**。
`pnpm update --latest` は Prisma に対して使わない。

## 理由

**本番 DB を持とうとしている段で、prerelease の ORM には乗らない。**
永続化の層が RC だと、不具合を踏んだときに切り分けが「自分のコードか・RC の既知バグか」の二択になり、上流の修正を待つしか手が無くなる。

**8.0 の RC へ三つとも揃えて乗る案を採らなかった条件**: client と adapter の `latest` が stable の 7 を指しているので、8 へ行くには三つとも RC を名指しすることになる。
三つの `latest` が 8 で揃えば、この条件は消える。

**CLI だけ 8 にする案は、そもそも成立しない**。
Prisma が版の一致を要求するので選択肢ではない。

## 帰結

- `web/package.json` の三つは `^7.10.0` で揃う
- CLI の更新案内は緑のまま出続ける。
  これは無視してよく、従うと版が割れる
- `pnpm outdated` に `prisma 7.10.0 → 8.0.0-rc.12` が残る。
  据え置きの意図がここに書いてあるので、残っていること自体は異常ではない

## 覆る条件

- `@prisma/client` と `@prisma/adapter-pg` の `latest` が 8 系の stable を指したら。
  三つが揃うので、明示指定のまま 8 へ上げてよい
- 7 系がセキュリティ修正を受けなくなったら。
  据え置きの対価が上回るので、RC でも上げる側へ倒れる
