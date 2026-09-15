#!/bin/bash
#
# 禁止語を、git の変更行またはテキストから grep して報告する。
#
# 語の一覧の正本は `.claude/rules/writing.md`「語彙と読み手」節の表。
# `BANNED_WORDS` はそれを機械が読める形へ写したもので、表を直したらここも直す。
# `scripts/lint-comments.ts` は同じ表を TS のコメントへ当てる。
# こちらは見る面が違い、git の追加行・コミット本文・PR 本文を対象にする。
#
# 一致は表記そのままで、活用形は見ない(「落とす」は捕まえるが「落とし」は捕まえない)。
# `lint-comments.ts` と同じ判定にしてある。
#
# 出力は報告だけで、置換も合否判定もしない(判定は人間)。
#
# リポジトリごとの設定は3つのファイルで行い、この検査そのものは書き換えない。
#   .coding-standards-vocab-deny    そのリポジトリだけの禁止語を1行1語で足す
#   .coding-standards-vocab-allow   その領域で比喩でない語を1行1語で足す(判定から外れる)
#   .coding-standards-vocab-ignore  走査しないパスを1行1つの pathspec で足す(生ログ・原文保持の退避先など)
# 単漢字の語(器・口・印)は無関係な複合語に埋もれて誤検出になるので、代表例を STRIP_COMPOUNDS が判定用のコピーからだけ取り除く。
# 報告する本文は取り除く前の原文のまま。
# 一覧をそのまま別のリポジトリへ配ると、その領域で普通の語を機械が潰す。
# 配る前に、配布先の実コードでその語が比喩でなく技術用語として使われていないかを確かめる。
#
# 使い方:
#   lint-vocabulary.sh [<git diff への引数...>]   追加行だけを見る(引数を省略すると --cached)
#   lint-vocabulary.sh --text <ファイル>          そのファイルの全行を見る(コミット本文・PR 本文)

set -euo pipefail

MODE=diff
TEXT_FILE=""
if [ "${1:-}" = --text ]; then
  [ -n "${2:-}" ] && [ -f "${2:-}" ] || { echo "lint-vocabulary.sh: --text にはファイルが要る" >&2; exit 2; }
  MODE=text
  TEXT_FILE="$2"
  shift 2
fi

REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || echo .)

# 一覧そのものを持つファイルは常に外す(語を足す変更が毎回自分を報告する)。
# リポジトリ固有の除外は .coding-standards-vocab-ignore が持つ。
EXCLUDE_PATHSPECS=(
  ':!.coding-standards-vocab-deny' ':!.coding-standards-vocab-allow' ':!.coding-standards-vocab-ignore'
  ':!**/lint-vocabulary.sh' ':!**/lint-comments.ts' ':!**/lint-comments.test.ts'
)
if [ -f "$REPO_ROOT/.coding-standards-vocab-ignore" ]; then
  # read は改行で終わらない最後の行で 1 を返すので、行が空でなければその行も読む(read_word_file も同じ)。
  while IFS= read -r pathspec || [ -n "$pathspec" ]; do
    [ -z "$pathspec" ] && continue
    case "$pathspec" in \#*) continue ;; esac
    EXCLUDE_PATHSPECS+=(":!$pathspec")
  done < "$REPO_ROOT/.coding-standards-vocab-ignore"
fi

# 禁止語(`.claude/rules/writing.md`「語彙と読み手」節の表を写したもの。17語)。
BANNED_WORDS=(
  引く 落とす 倒す 畳む 流す 弾く 握る 掛ける
  口 関門 印 登録簿 受け皿 素通し 領分 器 綴り
)

# 単漢字の語が無関係な複合語の中に埋もれて誤検出になる分だけ、判定用コピーから取り除く。
# 網羅ではなく、実害の大きい代表例だけを持つ欄。
STRIP_COMPOUNDS=(
  入口 出口 窓口 人口 河口 一口 口頭 口座 蛇口 非常口
  容器 楽器 武器 食器 受話器 消火器 起動器 陶器 磁器 便器 計器
  矢印 目印 印字 印刷 印象 印鑑
  見落とす
)

read_word_file() {   # $1 = ファイル, $2 = 足す先の配列名
  local f="$1" w
  [ -f "$f" ] || return 0
  while IFS= read -r w || [ -n "$w" ]; do
    [ -z "$w" ] && continue
    case "$w" in \#*) continue ;; esac
    if [ "$2" = banned ]; then BANNED_WORDS+=("$w"); else STRIP_COMPOUNDS+=("$w"); fi
  done < "$f"
}
read_word_file "$REPO_ROOT/.coding-standards-vocab-deny" banned
read_word_file "$REPO_ROOT/.coding-standards-vocab-allow" strip

banned_joined=$(IFS='|'; echo "${BANNED_WORDS[*]}")
strip_joined=$(IFS='|'; echo "${STRIP_COMPOUNDS[*]}")

SCAN_AWK='
function hits(content,   check, i) {
  check = content
  for (i = 1; i <= ns; i++) gsub(swords[i], "", check)
  for (i = 1; i <= nb; i++) if (index(check, bwords[i]) > 0) return 1
  return 0
}
BEGIN { nb = split(banned, bwords, "|"); ns = split(strip, swords, "|") }
'

# ファイル名を持つ `+++ b/...` の行は、`diff --git` から最初の `@@` までのヘッダにしか現れない。
# hunk の中で `+++` や `---` から始まる行は、内容が `++` や `--` で始まる追加行・削除行なので、ヘッダと区別する。
DIFF_AWK=$SCAN_AWK'
/^diff --git / { in_header = 1; next }
in_header && /^@@/ { in_header = 0 }
in_header && /^\+\+\+ / { file = substr($0, 5); sub(/^b\//, "", file); next }
in_header { next }
/^@@/ {
  match($0, /\+[0-9]+/)
  lineno = substr($0, RSTART + 1, RLENGTH - 1) + 0
  next
}
/^\+/ {
  content = substr($0, 2)
  if (hits(content)) print file ":" lineno ": " content
  lineno++
  next
}
/^-/ { next }
'

TEXT_AWK=$SCAN_AWK'
{ if (hits($0)) print FILENAME ":" FNR ": " $0 }
'

if [ "$MODE" = text ]; then
  report=$(awk -v banned="$banned_joined" -v strip="$strip_joined" "$TEXT_AWK" "$TEXT_FILE")
else
  DIFF_ARGS=("$@")
  [ ${#DIFF_ARGS[@]} -eq 0 ] && DIFF_ARGS=(--cached)
  report=$(
    git diff -U0 "${DIFF_ARGS[@]}" -- . "${EXCLUDE_PATHSPECS[@]}" \
      | awk -v banned="$banned_joined" -v strip="$strip_joined" "$DIFF_AWK"
  )
fi

if [ -n "$report" ]; then
  echo "$report"
  {
    echo "---"
    echo "検出は報告のみ。直叙な語へ置き換えるか、置き換えられないなら人間の判断を仰ぐ。"
    echo "一覧と言い換え先は .claude/rules/writing.md「語彙と読み手」節の表。"
    echo "その領域で比喩でない語なら .coding-standards-vocab-allow へ足す。"
  } >&2
  exit 1
fi
