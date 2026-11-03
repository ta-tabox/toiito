#!/bin/bash
#
# セッション起動フック。
# 責務は一点——どの環境でも `pnpm check` と `pnpm dev` が同じ意味を持つところまで組む。
# 準備の本体は手元でもクラウド（Claude Code on the web）でも scripts/setup.sh で、このファイルはその前にクラウドでだけ要る分を持つ。
# クラウドのスナップショットに残る分（mise・依存・chromium・postgres:18 のイメージ）は scripts/cloud-setup.sh が持ち、ここが持つのはセッションごとに消えるもの（PATH・dockerd のプロセス）である。

set -euo pipefail

REPO_ROOT="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"

# mise の shims を先に置く。
# イメージ同梱の node が PATH の後ろにあっても、`mise.toml` の版の node を使う。
TOOL_PATH="$HOME/.local/share/mise/shims:$HOME/.local/bin"

log() {
  echo "[toiito] $1"
}

# author の名義は利用者に固有なので、リポジトリでなくクラウド環境の環境変数が持つ（docs/HARNESS.md「設定の置き場」）。
# ここへ焼くと、他人が fork で立てたセッションのコミットが持ち主名義で積まれる。
#
# GIT_AUTHOR_* は config より優先されるので、リポジトリ側の user.name / user.email は要らない。
# committer はコンテナの global config（Claude 名義・署名鍵つき）から落ちるので、こちらも触らない。
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

# mise 本体はセットアップスクリプトが入れる。
# 無いのはセットアップスクリプト欄が空か失敗したときなので、ここで入れ直さず直し方を告げて止める。
require_mise() {
  if [ -x "$HOME/.local/bin/mise" ]; then
    return
  fi

  echo "mise が無い。クラウド環境のセットアップスクリプト欄と許可ドメインを docs/HARNESS.md「設定の置き場」のとおりにし、/root/toiito-setup.log を確かめる" >&2
  exit 1
}

# Claude のツールのシェルへ PATH を渡す。
# CLAUDE_ENV_FILE は追記専用で resume のたびにこのフックが走るので、同じ行が無いときだけ書く。
export_tool_path() {
  export PATH="$TOOL_PATH:$PATH"

  if [ -z "${CLAUDE_ENV_FILE:-}" ]; then
    return
  fi

  local path_line="export PATH=\"$TOOL_PATH:\$PATH\""
  grep -qxF "$path_line" "$CLAUDE_ENV_FILE" 2>/dev/null || echo "$path_line" >>"$CLAUDE_ENV_FILE"
}

# スナップショットが `mise.toml` の版を上げる前のものでも、ここで追いつく。
# 揃っていれば何もしない。
install_toolchain() {
  log "mise.toml の版を揃える"
  (cd "$REPO_ROOT" && mise trust --quiet mise.toml && mise install --quiet)
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
  if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
    # 手元では止めない。
    # 準備が途中で止まってもセッションは立ち、足りない分は pnpm check が同じ相手で落ちて言う。
    bash "$REPO_ROOT/scripts/setup.sh" || echo "[toiito] 手元の準備が途中で止まった。bash scripts/setup.sh を叩き直す" >&2
    exit 0
  fi

  require_git_author
  require_mise
  export_tool_path
  install_toolchain
  start_dockerd
  bash "$REPO_ROOT/scripts/setup.sh"

  # 手元との連携に使うファイル（CLAUDE.local.md）は追跡しないので、この環境には存在しない。
  # 無いのが既定だと宣言しておくと、探しに行って止まる形を防げる。
  log "手元専用のファイル（CLAUDE.local.md）はこの環境に無い（既定）"
}

main "$@"
