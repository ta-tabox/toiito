#!/usr/bin/env bash
# issue 草稿を GitHub へ一括登録する。gh auth login 済みの環境で実行すること。
# 依存関係（"前提: #N"）は登録後の実番号に読み替えて手で直す前提——
# 草稿内の番号は ROADMAP.md の表の通し番号であって issue 番号ではない。
set -euo pipefail
cd "$(dirname "$0")"

# --- ラベルを先に用意する（--force で既存なら更新・無ければ作成）---
ensure_label() { gh label create "$1" --color "$2" --description "$3" --force >/dev/null; }
echo "ラベルを用意中..."
ensure_label claude    "1f6feb" "Claude が回す作業単位"
ensure_label human     "d4a72c" "人間の判断・実機確認が本体"
ensure_label lib       "0e8a16" "lib 層（純関数・repo）"
ensure_label ui        "5319e7" "UI 層"
ensure_label tooling   "6e7781" "開発道具（シード・スクリプト）"
ensure_label harness   "b60205" "検証層（テスト・E2E）"
ensure_label design    "c5def5" "設計を書くのが成果物"
ensure_label milestone "fbca04" "節目・判定"
ensure_label small     "c2e0c6" "1 時間未満で終わる想定"
ensure_label post-mvp  "ededed" "MVP 常用開始より後に着手"

echo "issue を登録中..."
for f in [0-9][0-9]-*.md; do
  title=$(head -1 "$f" | sed 's/^# //')
  labels=$(sed -n '2p' "$f" | sed 's/^labels: //')
  body=$(tail -n +4 "$f")
  echo "  creating: $title"
  gh issue create --title "$title" --body "$body" --label "$labels"
done
echo "完了。ROADMAP.md の表の番号と実 issue 番号のずれを確認すること。"
