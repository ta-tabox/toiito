#!/bin/bash
#
# クラウドのセッションで、`scripts/setup.sh` の前にクラウドでだけ要る検査と準備を行う。
# 走らせるのは `.claude/hooks/session-start.sh` で、`CLAUDE_CODE_REMOTE=true` のときにセッションの開始と resume のたびに呼ぶ。
# スナップショットに残る分（mise・依存・chromium・postgres:18 のイメージ）は持たず、`scripts/cloud-snapshot.sh` が持つ。
# ここが持つのはセッションごとに消えるもの（Claude のシェルの PATH・dockerd のプロセス）と、セッションを立てる前に止めるべき検査である。
# 失敗したら `exit 1` で止め、起動フックが `scripts/setup.sh` を呼ばずにセッションを止める。

set -euo pipefail

ROOT=$(git rev-parse --show-toplevel)

# mise の shims の置き場。
# イメージ同梱の node が PATH の後ろにあっても、`mise.toml` の版の node を使わせるために PATH の先頭へ置く。
TOOL_PATH="$HOME/.local/share/mise/shims"

log() {
  echo "[toiito] $1"
}

# author の名義は利用者に固有なので、リポジトリでなくクラウド環境の環境変数が持つ（docs/HARNESS.md「設定の置き場」）。
# ここへ焼くと、他人が fork で立てたセッションのコミットが持ち主名義で積まれる。
#
# GIT_AUTHOR_* は config より優先されるので、リポジトリ側の user.name / user.email は要らない。
# committer にはコンテナの global config（Claude 名義・署名鍵つき）の値が使われるので、こちらも触らない。
#
# 未設定のまま進めると author が Claude になり、
# 「第三者が出したものを承認した」という嘘の外形を誰も気づかないまま履歴へ残すので、止める。
require_git_author() {
  if [ -n "${GIT_AUTHOR_NAME:-}" ] && [ -n "${GIT_AUTHOR_EMAIL:-}" ]; then
    return
  fi

  echo "GIT_AUTHOR_NAME / GIT_AUTHOR_EMAIL がこの環境に無い。クラウド環境の環境変数へ入れ、セッションを立て直す（docs/HARNESS.md「設定の置き場」）" >&2
  exit 1
}

# mise 本体はセットアップスクリプトが、イメージ同梱の npm のグローバルな置き場へ入れる。
# 無いのはセットアップスクリプト欄が空か失敗したときなので、ここで入れ直さず直し方を告げて止める。
require_mise() {
  if command -v mise >/dev/null 2>&1; then
    return
  fi

  echo "mise が無い。クラウド環境のセットアップスクリプト欄と許可ドメインを docs/HARNESS.md「設定の置き場」のとおりにし、/root/toiito-setup.log を確かめる" >&2
  exit 1
}

# Claude のツールのシェルへ PATH を渡す。
# CLAUDE_ENV_FILE は追記専用で resume のたびに起動フックが走るので、同じ行が無いときだけ書く。
# 起動フックのプロセスの PATH は `scripts/setup.sh` が自分で整えるので、ここでは export しない。
export_tool_path() {
  if [ -z "${CLAUDE_ENV_FILE:-}" ]; then
    return
  fi

  local path_line="export PATH=\"$TOOL_PATH:\$PATH\""
  grep -qxF "$path_line" "$CLAUDE_ENV_FILE" 2>/dev/null || echo "$path_line" >>"$CLAUDE_ENV_FILE"
}

# スナップショットが `mise.toml` の版を上げる前のものでも、ここで追いつく。
# 揃っていれば何もしない。
# `scripts/setup.sh` は `mise install` を持たないので、クラウドではここが版を揃える。
install_toolchain() {
  log "mise.toml の版を揃える"
  (cd "$ROOT" && mise trust --quiet mise.toml && mise install --quiet)
}

# dockerd はイメージにあるが、セッションの開始時には動いていない。
start_dockerd() {
  if docker info >/dev/null 2>&1; then
    return
  fi

  log "dockerd を起動する"
  nohup dockerd >/tmp/dockerd.log 2>&1 &

  for _ in $(seq 1 30); do
    docker info >/dev/null 2>&1 && return
    sleep 1
  done

  echo "dockerd が 30 秒で応答しない。/tmp/dockerd.log を確かめる" >&2
  exit 1
}

main() {
  require_git_author
  require_mise
  export_tool_path
  install_toolchain
  start_dockerd

  # 手元との連携に使うファイル（CLAUDE.local.md）は追跡しないので、この環境には存在しない。
  # 無いのが既定だと宣言しておくと、探しに行って止まる形を防げる。
  log "手元専用のファイル（CLAUDE.local.md）はこの環境に無い（既定）"
}

main "$@"
