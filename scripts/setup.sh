#!/bin/bash
#
# 手元のチェックアウト（リポジトリ本体と worktree）で、`pnpm check` と `pnpm dev` が前置き無しで動くところまで揃える。
# 何度走らせても同じ状態に落ち着く。
#
# 揃えるのは四つ。
#   - git のフックの向き先（`.githooks`）
#   - 依存と Prisma の生成物（`pnpm install`。store は web/pnpm-workspace.yaml の storeDir で本体と worktree が同じ場所を使う）
#   - Postgres（`docker compose up -d`。docker が無ければ飛ばして告げる）
#   - このチェックアウトの開発用データベースと migration（`web/scripts/prepare-checkout-database.ts`）
#
# 版の正は mise.toml、接続先の正は compose.yaml と web/scripts/checkout-database.ts にあり、ここには書かない。
# リモート（Claude Code on the web）の準備は .claude/hooks/session-start.sh が別に持ち、手元ではそのフックがこのスクリプトを呼ぶ。
# 人間が叩くときは、リポジトリのどこからでも `bash scripts/setup.sh`。

set -euo pipefail

ROOT=$(git rev-parse --show-toplevel)
cd "$ROOT"

log() {
  echo "[setup] $1"
}

# mise の shims が PATH に無いプロセス（エディタやフックから起動された場合）でも、mise が入れた pnpm と node を掴む。
if ! command -v pnpm > /dev/null 2>&1; then
  export PATH="$HOME/.local/share/mise/shims:$PATH"
fi

# 相対パスにする。
# 絶対パスだと worktree の .githooks を直しても本体の版が走る。
# worktree ごとの設定（extensions.worktreeConfig）に絶対パスが残っていると共有の設定より優先されるので、先に消す。
if git config --worktree --get core.hooksPath > /dev/null 2>&1; then
  git config --worktree --unset core.hooksPath
fi
git config core.hooksPath .githooks

# postinstall が prisma generate まで走らせる。
# 接続先は web/scripts/checkout-environment.ts が導くので、worktree に .env.local が無くても通る。
log "依存を入れる"
(cd web && pnpm install --reporter=silent)

# --no-recreate は、既に立っているコンテナを作り直さないため。
# 作り直すと本体の pnpm dev が張っている接続が切れる。
if command -v docker > /dev/null 2>&1; then
  log "Postgres を立てる"
  docker compose up -d --wait --no-recreate || {
    log "Postgres を立てられなかった。Docker を起動してから bash scripts/setup.sh を叩き直す"
    exit 1
  }
else
  log "docker が無いので Postgres は立てない。別に立てた Postgres の接続先を DATABASE_URL と DIRECT_URL で渡す"
fi

log "開発用データベースを揃える"
(cd web && pnpm db:prepare)

log "準備完了。web/ で pnpm check と pnpm dev が走る"
