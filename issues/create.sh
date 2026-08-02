#!/usr/bin/env bash
# issue 草稿を GitHub へ一括登録する。gh auth login 済みの環境で実行すること。
# 依存関係（"前提: #N"）は登録後の実番号に読み替えて手で直す前提——
# 草稿内の番号は ROADMAP.md の表の通し番号であって issue 番号ではない。
set -euo pipefail
cd "$(dirname "$0")"
for f in [0-9][0-9]-*.md; do
  title=$(head -1 "$f" | sed 's/^# //')
  labels=$(sed -n '2p' "$f" | sed 's/^labels: //')
  body=$(tail -n +4 "$f")
  echo "creating: $title"
  gh issue create --title "$title" --body "$body" --label "$labels"
done
echo "完了。ROADMAP.md の表の番号と実 issue 番号のずれを確認すること。"
