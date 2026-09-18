#!/bin/bash
#
# 配布元のテンプレートとバイト一致させる規約の配布物を、テンプレートと diff して報告する。
#
# リポジトリ固有の規則は隣の `*.project.md` が持つので、配布物に差が出たらテンプレートの改定を写し忘れている。
# テンプレートは公開しないリポジトリにあり、CI からは読めないので、`pnpm check` には載せず手で走らせる。
#
# 使い方:
#   diff-coding-standards.sh <テンプレートのディレクトリ>
#   CODING_STANDARDS_TEMPLATE=<テンプレートのディレクトリ> diff-coding-standards.sh
# テンプレートのディレクトリは `rules/` と `skills/` を直下に持つ。
# 終了コードは、全件一致で 0、差があれば 1、テンプレートが見つからなければ 2。

set -euo pipefail

TEMPLATE_DIR="${1:-${CODING_STANDARDS_TEMPLATE:-}}"
if [ -z "$TEMPLATE_DIR" ] || [ ! -d "$TEMPLATE_DIR/rules" ]; then
  echo "diff-coding-standards.sh: テンプレートのディレクトリを引数か CODING_STANDARDS_TEMPLATE で渡す(rules/ を直下に持つもの)" >&2
  exit 2
fi

REPO_ROOT=$(git rev-parse --show-toplevel)

# テンプレートの中の相対パス。リポジトリでは `.claude/` の下の同じパスに置く。
DISTRIBUTED_FILES=(
  rules/writing.md
  rules/coding.md
  rules/languages/typescript.md
  rules/languages/prisma.md
  rules/languages/python.md
  skills/coding-standards/SKILL.md
  skills/review-checklist/SKILL.md
)

status=0
for relative in "${DISTRIBUTED_FILES[@]}"; do
  if ! diff -u "$TEMPLATE_DIR/$relative" "$REPO_ROOT/.claude/$relative"; then
    status=1
  fi
done

exit "$status"
