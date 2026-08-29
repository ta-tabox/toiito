# 0007. Vercel の pnpm は Install Command で版を名指しする

- **状態**: 採用
- **決定日**: 2026-08-28
- **関係する ADR**: 0002

## 文脈

Vercel が install に使う pnpm の版を決める経路は二つで、lockfile からの自動検出か、corepack による pin（`ENABLE_EXPERIMENTAL_COREPACK=1` + `package.json` の `packageManager`）である。
後者は `CLAUDE.md`「開発ハーネス」が禁じている（版管理は mise で、正は `mise.toml`）。

ずれが体裁で済まないことが分かったのが、決める必要が出た理由である。
`web/pnpm-workspace.yaml` の `allowBuilds` は pnpm 11 の `approve-builds` が書いた綴りで、pnpm 10 以前が見るのは `onlyBuiltDependencies` の方になる。
`web/pnpm-lock.yaml` の `lockfileVersion` は pnpm 9 以降ずっと `9.0` なので、自動検出が pnpm 10 を選ぶ余地がある。
そのとき `@prisma/engines` と `prisma` のビルドスクリプトが承認されないまま install が進み、`postinstall` の `prisma generate` が engine 不在で落ちうる。

## 決定

`web/vercel.json` の `installCommand` で版を名指しする。

```json
{
  "installCommand": "npm i -g pnpm@11.21.0 && pnpm install --frozen-lockfile"
}
```

**版の正は `mise.toml` のまま**で、`vercel.json` はそれに追随する側とする。

## 理由

corepack を使わずに版が固定でき、規約に例外を作らずに済む。

**lockfile の自動検出を採らなかった条件**: 上の `allowBuilds` の綴りが pnpm 11 のものなので、版がずれるとビルドの成否が変わる。
綴りが二つの major にまたがって効くなら、この条件は消える。

**corepack を採らなかった条件**: `CLAUDE.md` の禁止に例外を作ることになる。
版の記述先が一つ増えるのは Install Command 案と同じなので、例外を払う対価が無い。

**Vercel のダッシュボードで Install Command を上書きする案を採らなかった条件**: 設定が diff に残らず、`DEPLOY.md` でしか追えなくなる。
ブランチ保護の ruleset は GitHub 側にしか置き場が無いのでそうしているが、こちらはリポジトリへ置ける。

**ビルドの中で mise を走らせて `mise.toml` を読ませる案を採らなかった条件**: 版の記述先が一つに保てる代わりに、mise.run への fetch がビルドの前提になる。
Root Directory が `web/` なので、リポジトリルートの `mise.toml` が見えるかどうかも Vercel 側の設定次第になる。

## 帰結

- `web/vercel.json` が増える。
  Vercel を離れる日は、このファイルを消すだけで済む
- 版の記述先が `mise.toml` と `vercel.json` の二箇所になる。
  `mise.toml` を上げたら `vercel.json` も同じ値へ揃える（揃え忘れると本番だけ古い pnpm で install する）。
  手順は `DEPLOY.md`
- `package.json` に `packageManager` は入らない

## 覆る条件

- `web/pnpm-workspace.yaml` から `allowBuilds` が消えたら。
  ビルドスクリプトの承認が要らなくなれば、版のずれがビルドの成否に効かなくなるので、自動検出へ戻してよい
- Vercel が corepack 以外に `packageManager` 相当を読む経路を持ったら。
  記述先が `package.json` 一箇所へ寄る
- 実行環境を Vercel から動かしたら。
  この決定は Vercel の install の話しかしていないので、環境ごと落ちる
