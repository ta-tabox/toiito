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
# 例外は、main 以外の名前付きブランチへの `--force-with-lease` だけで、スタック型 PR の積み直しに使う。
# lease は最後に取得した後に他者が push した ref を上書きせずに失敗するので、人間に ask を出さず settings.json の allow へ委ねる。
# 経緯は docs/adr/20261102-stacked-pull-requests.md が持つ。
#
# 判定は「戻せない形か」だけで、それ以外は何も言わず settings.json の判定へ委ねる。
# 迷ったら ask を返す。
# 余計に訊かれるのは摩擦で済むが、確認なしで通すと事故になる。
#
# settings.json の `if` は起動を絞るだけで、判定の責任は持たない。
# `settings.json` の `if` は best-effort で、`$( )` やバッククォートを含む行——sleep を待つ until ループのような、git と無縁のもの——では絞り込みが効かずに起動してくるので、git push かどうかはこのスクリプトの側でも確かめる。

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

# lease 付きのフラグを語の列から抜き出し、残りの語だけで破壊的な形を検査する。
# 抜かずに検査すると `--force-with-lease` が `--force` の形に当たる。
# macOS の既定の bash 3.2 は、set -u の下で空の配列を `"${arr[@]}"` や `"${arr[*]}"` で展開すると unbound variable で落ちる。
# read は最初の 1 行しか読まないので、改行を空白へ替えて、複数行のコマンドの 2 行目以降も検査に入れる。
read -ra words <<< "${arguments//$'\n'/ }"
has_lease=false
words_without_lease=()
for word in ${words[@]+"${words[@]}"}; do
  case "$word" in
    --force-with-lease | --force-with-lease=* | --force-if-includes) has_lease=true ;;
    *) words_without_lease+=("$word") ;;
  esac
done

if grep -qE "$destructive" <<< "${words_without_lease[*]:-}"; then
  ask "戻せない push の可能性がある（force / delete / mirror）。人間の諾否が要る"
  exit 0
fi

if [[ $has_lease == false ]]; then
  exit 0
fi

# 送り先は、remote 名の後に並ぶ refspec の `:` より後ろ（`:` が無ければ refspec 全体）である。
# 送り先を書かない push は現在のブランチへ送るので、main に居るかを見ずに人間へ回す。
positionals=()
for word in ${words_without_lease[@]+"${words_without_lease[@]}"}; do
  if [[ $word != -* ]]; then
    positionals+=("$word")
  fi
done

if ((${#positionals[@]} < 2)); then
  ask "force-with-lease の送り先のブランチが書かれていない。人間の諾否が要る"
  exit 0
fi

for refspec in ${positionals[@]+"${positionals[@]:1}"}; do
  destination=${refspec#*:}
  destination=${destination//[\"\']/}
  destination=${destination#+}
  destination=${destination#refs/heads/}

  if [[ -z $destination || $destination == main || $destination == HEAD || $destination == *'*'* ]]; then
    ask "main か名前の決まらないブランチへの force-with-lease。人間の諾否が要る"
    exit 0
  fi
done
