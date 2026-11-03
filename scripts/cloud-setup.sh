#!/bin/bash
#
# クラウド（Claude Code on the web）の環境のセットアップスクリプト欄が呼ぶ本体。
# 欄には `bash /home/user/toiito/scripts/cloud-setup.sh` の一行だけを置き、中身はこのファイルが持つ。
#
# 揃えるもの。
#   - mise と、`mise.toml` の版の node と pnpm
#   - pnpm の store（`pnpm install --frozen-lockfile`）
#   - Playwright の chromium（`/opt/pw-browsers` の同梱版は `@playwright/test` の要求する版と一致しない）
#   - `compose.yaml` が使う postgres:18 のイメージ
#
# 欄の結果はファイルシステムのスナップショットとして残り、セッションごとには走らない。
# セッションごとの準備（PATH・dockerd の起動・Postgres・開発用 DB）は `.claude/hooks/session-start.sh` が持つ。
# 欄は root で、クラウド環境の環境変数が入る前に走る。
# 失敗しても止めずに exit 0 で終える。
# 欄が失敗すると環境そのものが立たず、このスクリプトが失敗した段は起動フックの `mise install` と compose の取得が補う。
# 各段の所要秒と成否は `/root/toiito-setup.log` に残す。

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG=/root/toiito-setup.log

export PATH="$HOME/.local/share/mise/shims:$HOME/.local/bin:$PATH"
export MISE_YES=1

# 段の名前と所要秒と成否を `LOG` に一行で書く。
# 段の失敗で全体を止めないので、終了コードは返さない。
run_step() {
  local name="$1"
  shift

  local started=$SECONDS

  if "$@" >>"$LOG" 2>&1; then
    echo "[cloud-setup] $name: ok ($((SECONDS - started))s)" | tee -a "$LOG"
  else
    echo "[cloud-setup] $name: failed ($((SECONDS - started))s)" | tee -a "$LOG"
  fi
}

install_mise() {
  if command -v mise >/dev/null 2>&1; then
    return
  fi

  curl -fsSL https://mise.run | sh
}

install_toolchain() {
  mise trust "$ROOT/mise.toml"
  (cd "$ROOT" && mise install)
}

install_dependencies() {
  (cd "$ROOT/web" && pnpm install --frozen-lockfile)
}

install_chromium() {
  (cd "$ROOT/web" && pnpm exec playwright install chromium)
}

# dockerd は欄の時点で動いていないので、取得の間だけ起動する。
# 取得の後に止めるのは、書き込みの途中の `/var/lib/docker` をスナップショットに残さないため。
pull_postgres_image() {
  dockerd >/tmp/dockerd-setup.log 2>&1 &
  local pid=$!

  for _ in $(seq 1 30); do
    docker info >/dev/null 2>&1 && break
    sleep 1
  done

  local status=0
  docker pull postgres:18 || status=$?

  kill "$pid"
  wait "$pid" 2>/dev/null

  return "$status"
}

main() {
  local started=$SECONDS

  echo "[cloud-setup] start $(date -u +%FT%TZ)" >>"$LOG"
  run_step mise install_mise
  run_step toolchain install_toolchain
  run_step dependencies install_dependencies
  run_step chromium install_chromium
  run_step postgres-image pull_postgres_image
  echo "[cloud-setup] total: $((SECONDS - started))s" | tee -a "$LOG"
}

main "$@"
exit 0
