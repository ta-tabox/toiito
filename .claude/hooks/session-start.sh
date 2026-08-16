#!/bin/bash
#
# リモート環境（Claude Code on the web）のセッション起動フック。
# 責務は一点——docker の無いコンテナで `pnpm check` と `pnpm dev` がローカルと同じ意味を持つところまで組む。
# 手元の環境は docker compose + mise が正典なので、このフックはリモートでしか走らない。
#
# リモート特有の非対称は二つ。どちらも外向きの通信が許可制で塞げないもの（HARNESS.md「実行環境」）:
#   - Postgres は 17 でなく、イメージに同梱の 16（apt.postgresql.org へ出られない）
#   - mise は使わず、node と pnpm を mise.toml の版に合わせて直接置く（mise.run へ出られない）
# 版の正は mise.toml のままにして、ここは読む側に徹する。

set -euo pipefail

REPO_ROOT="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"

# compose.yaml と同じ口。接続文字列を環境ごとに書き分けずに済ませるため。
PG_PORT=5433

# PATH の先頭にあるディレクトリ。ここへ置けば、PATH を組み直して起動する子プロセス
# （.claude/launch.json の dev サーバー）も同じ版を掴む。
BIN_DIR="$HOME/.local/bin"

# mise.toml の値を正として読む。二重管理にしないため、ここには版を書かない。
NODE_MAJOR="$(sed -n 's/^node *= *"\(.*\)"/\1/p' "$REPO_ROOT/mise.toml")"
PNPM_VERSION="$(sed -n 's/^"npm:pnpm" *= *"\(.*\)"/\1/p' "$REPO_ROOT/mise.toml")"
NODE_PREFIX="/opt/node-$NODE_MAJOR"

# 読めなければ止める。空のまま進むと `pnpm@` が latest を掴み、ピンを外したことに誰も気づかない。
if [ -z "$NODE_MAJOR" ] || [ -z "$PNPM_VERSION" ]; then
  echo "mise.toml から node / pnpm の版を読めなかった。書式が変わっていないか確認する" >&2
  exit 1
fi

log() {
  echo "[toiito] $1"
}

# 手元では local config に焼いてある名義が、リモートではクローンのたびに空になる。
# 焼き直さないと、コンテナの global config（Claude 名義）でコミットが積まれる。
configure_git_identity() {
  git -C "$REPO_ROOT" config --local user.name "ta-tabox"
  git -C "$REPO_ROOT" config --local user.email "tanktabox@gmail.com"
}

# nodejs.org のアーカイブ名に使う表記。uname の綴りとは違う。
node_arch() {
  case "$(uname -m)" in
    x86_64) echo "x64" ;;
    aarch64 | arm64) echo "arm64" ;;
    *) echo "unsupported arch: $(uname -m)" >&2; return 1 ;;
  esac
}

# イメージの node は 22 で mise.toml の指定と違うので、指定の版を別に置く。
install_node() {
  if [ -x "$NODE_PREFIX/bin/node" ]; then
    return
  fi

  # マイナー版は固定しない（mise.toml が持つのはメジャーまで）。最新を引く。
  #
  # 失敗は下の診断で伝えるので、パイプラインの終了状態はここで捨てる。
  # 捨てないと set -e がこの代入で抜け、診断へ到達しない。
  # head が途中でパイプを閉じるため、成功時も上流が非ゼロで終わりうる。
  local version archive tarball
  version="$(curl -fsSL https://nodejs.org/dist/index.json \
    | grep -o "\"version\":\"v${NODE_MAJOR}\.[0-9]\+\.[0-9]\+\"" \
    | head -1 | cut -d'"' -f4 || true)"

  if [ -z "$version" ]; then
    echo "nodejs.org から node $NODE_MAJOR 系の版を引けなかった" >&2
    return 1
  fi

  archive="node-$version-linux-$(node_arch)"
  tarball="$(mktemp)"

  log "node $version を入れる"
  curl -fsSL "https://nodejs.org/dist/$version/$archive.tar.xz" -o "$tarball"
  mkdir -p "$NODE_PREFIX"
  tar -xJf "$tarball" -C "$NODE_PREFIX" --strip-components=1
  rm -f "$tarball"
}

# corepack は使わない方針（CLAUDE.md 開発ハーネス）なので、npm でグローバルに置く。
#
# node を明示して呼ぶ。npm の shebang は `env node` で、PATH 先頭にイメージ同梱の node があると
# そちらが実行側になり、グローバルの置き場所もそちらの prefix になってしまう。
install_pnpm() {
  if [ "$("$NODE_PREFIX/bin/pnpm" -v 2>/dev/null || true)" = "$PNPM_VERSION" ]; then
    return
  fi

  log "pnpm $PNPM_VERSION を入れる"
  "$NODE_PREFIX/bin/node" "$NODE_PREFIX/bin/npm" install -g --silent "pnpm@$PNPM_VERSION"
}

link_toolchain() {
  mkdir -p "$BIN_DIR"

  for cmd in node npm npx pnpm; do
    ln -sf "$NODE_PREFIX/bin/$cmd" "$BIN_DIR/$cmd"
  done

  # PATH の並びはこちらの契約ではないので、Claude のセッションへは明示的にも渡す。
  if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
    echo "export PATH=\"$BIN_DIR:\$PATH\"" >> "$CLAUDE_ENV_FILE"
  fi
}

psql_super() {
  runuser -u postgres -- psql -p "$PG_PORT" "$@"
}

# イメージ同梱のクラスタを compose.yaml と同じ口へ移して立てる。
start_postgres() {
  local pg_version conf
  pg_version="$(pg_lsclusters -h | awk 'NR == 1 { print $1 }')"
  conf="/etc/postgresql/$pg_version/main/postgresql.conf"

  if ! grep -qE "^port = $PG_PORT\b" "$conf"; then
    sed -i -E "s/^port = [0-9]+/port = $PG_PORT/" "$conf"
  fi

  if pg_isready -q -h localhost -p "$PG_PORT"; then
    return
  fi

  # 既定の 5432 で上がっている場合があるので、落としてから port 変更を反映させる。
  # 止まっていれば stop は失敗するが、その失敗はここでは正常。
  pg_ctlcluster "$pg_version" main stop >/dev/null 2>&1 || true
  log "Postgres $pg_version を localhost:$PG_PORT に立てる"
  pg_ctlcluster "$pg_version" main start
}

# compose.yaml の POSTGRES_USER と同じロール。
# superuser なのはコンテナ側と権限を揃えるため（migrate dev の shadow database 作成に要る）。
create_role() {
  if [ "$(psql_super -tAc "select 1 from pg_roles where rolname = 'toiito'")" = "1" ]; then
    return
  fi

  psql_super -c "create role toiito with login superuser password 'toiito'"
}

# 開発用の toiito と、テスト用の toiito_test。
# 二つを別々に見る。片方を他方の有無で代表させると、途中で落ちた回の欠けが次回以降も埋まらない。
create_databases() {
  if [ "$(psql_super -tAc "select 1 from pg_database where datname = 'toiito'")" != "1" ]; then
    psql_super -c "create database toiito owner toiito"
  fi

  if [ "$(psql_super -tAc "select 1 from pg_database where datname = 'toiito_test'")" = "1" ]; then
    return
  fi

  # テスト用 DB を作るのは compose と同じ SQL（いま initdb にあるのはこの一本だけ）。
  for sql in "$REPO_ROOT"/docker/initdb/*.sql; do
    psql_super -v ON_ERROR_STOP=1 -f "$sql"
  done
}

# .env.local は git 管理外なので、リモートのコンテナには存在しない。
# 人間が手を入れた後のセッションで上書きしないよう、無いときだけ書く。
write_env_local() {
  local env_file="$REPO_ROOT/web/.env.local"
  local url="postgresql://toiito:toiito@localhost:$PG_PORT/toiito"

  if [ -f "$env_file" ]; then
    return
  fi

  log "web/.env.local を書く"
  {
    echo "DATABASE_URL=$url"
    echo "DIRECT_URL=$url"

    # 実キーが環境変数で渡っているなら、フェイクで上書きしない。
    if [ -z "${ANTHROPIC_API_KEY:-}" ]; then
      echo "TOIITO_FAKE_AI=1"
    fi
  } > "$env_file"
}

# postinstall が prisma generate まで走らせる（生成クライアントは git 管理外）。
install_dependencies() {
  log "依存を入れる"
  (cd "$REPO_ROOT/web" && "$BIN_DIR/pnpm" install --frozen-lockfile)
}

apply_migrations() {
  log "migration を積む"
  (cd "$REPO_ROOT/web" && "$BIN_DIR/pnpm" exec prisma migrate deploy)
}

main() {
  if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
    exit 0
  fi

  configure_git_identity
  install_node
  install_pnpm
  link_toolchain
  start_postgres
  create_role
  create_databases
  write_env_local
  install_dependencies
  apply_migrations

  log "準備完了。web/ で pnpm check が走る"
}

main "$@"
