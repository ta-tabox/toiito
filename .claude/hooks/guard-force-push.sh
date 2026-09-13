#!/bin/bash
#
# 戻せない git push を人間の諾否へ回す PreToolUse フック。
#
# `.claude/settings.json` の権限パターンはコマンド文字列への前方一致なので、`Bash(git push --force:*)` はフラグが push の直後に来る語順にしか当たらない。
# `git push origin --force` のように remote 名が先に来る書き方は素の `Bash(git push:*)` の allow へ落ちる。
# ここはコマンド文字列を見るので語順に依存しない。
#
# 前方一致では表現できない形も拾う——短オプションの束（`-fu`）・`+src:dst` の force refspec・`:branch` の削除 refspec。
#
# 判定は「戻せない形か」だけで、それ以外は何も言わず settings.json の判定へ委ねる。
# 迷ったら ask へ倒す。
# 余計に訊かれるのは摩擦で済むが、素通りは事故になる。
#
# settings.json の `if` は起動を絞るだけで、判定の責任は持たない。
# あれは best-effort で、`$( )` やバッククォートを含む行——sleep を待つ until ループのような、git と無縁のもの——では開いて倒れて起動してくるので、git push かどうかはこのスクリプトの側でも確かめる。

set -euo pipefail

ask() {
  jq -n --arg reason "$1" '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "ask",
      permissionDecisionReason: $reason
    }
  }'
}

# コマンドを読み出せないときは通さない（戻せない操作は人間が諾否を決める）。
if ! command -v jq > /dev/null 2>&1; then
  echo '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"ask","permissionDecisionReason":"jq が無くコマンドを検査できない"}}'
  exit 0
fi

command_line=$(jq -r '.tool_input.command // ""') || {
  ask "フックの入力を読めなかった"
  exit 0
}

# `git` と `push` が一つのコマンドの中で並んでいるか。
#
# 間に `;` `|` `&` を挟む並びは別々のコマンドなので見ない。
# 見ると `git status; echo "--- 未 push の有無 ---"` のような行が、git を呼んでいるだけで push 扱いになる。
# 引用の中の区切りは同じコマンドの一部なので、引用の塊ごと跨ぐ（`git -c 'x=;' push`）。
# 改行を書いていないのは、grep が行ごとに見るためである。
#
# 語頭と語尾に括弧を許すのは、`echo $(git push --force)` の `git` が `(` の直後に来て空白の境界を持たないためである。
quoted='"[^"]*"'"|'[^']*'"
git_push='(^|[[:space:]]|[(`{])git([^;|&]|'"$quoted"')*[[:space:]]push([[:space:]]|$|[)`}])'

if ! grep -qE "$git_push" <<< "$command_line"; then
  exit 0
fi

# 破壊的な形を探すのは push より後ろだけである。
# 前まで見ると `gh api graphql -f query=…; git push origin main` の `-f` を push のフラグと取り違える。
# 記号を空白へ潰すのは、`echo $(git push -f)` の `-f` が `)` に接して語尾を失うためである。
symbols='[;|&()`{}]'
arguments=${command_line#*push}
arguments=${arguments//$symbols/ }

# --force / --force-with-lease / --delete / --mirror を語順を問わず拾う。
# `-[a-zA-Z]*[fd][a-zA-Z]*` は -f・-d と、それらを含む束（-fu）に当たる。
# -u だけなら当たらない。
destructive='(^|[[:space:]])--(force|delete|mirror)'
destructive+='|(^|[[:space:]])-[a-zA-Z]*[fd][a-zA-Z]*([[:space:]]|$)'
destructive+='|(^|[[:space:]])\+[^[:space:]]+:'
destructive+='|(^|[[:space:]]):[^[:space:]]+'

if grep -qE "$destructive" <<< "$arguments"; then
  ask "戻せない push の可能性がある（force / delete / mirror）。人間の諾否が要る"
fi
