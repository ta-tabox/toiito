#!/bin/bash
#
# `gh api` のうち、戻せない書き込みを人間の諾否へ回す PreToolUse フック。
#
# `gh` の権限は「戻せるか」で三層に切ってあり（CLAUDE.md「git」節）、その線は操作の性質で引かれている。
# ところが `.claude/settings.json` の権限パターンはコマンド文字列への前方一致なので、`gh api` は綴りが一つしか無く層を分けられない。
# 全部を ask にすると、レビューの読み取りや返信——`gh issue comment` が allow なのと同じ「戻せるコメント」——まで毎回訊かれる。
# ここがコマンド全文を見て、戻せない側だけを ask へ回す。
#
# 素通しするのは次の三つだけである。
#
# - 読み取り（メソッドを書かず、フィールドも渡さない呼び出し）
# - コメントと返信の投稿（`/comments`・`/replies` への POST。編集も削除もできる）
# - レビュースレッドの resolve / unresolve（GraphQL。互いに戻せる）
#
# 判定は「戻せない形か」だけで、それ以外は何も言わず settings.json の判定へ委ねる。
# 迷ったら ask へ倒す。
# 余計に訊かれるのは摩擦で済むが、素通りは事故になる。
#
# settings.json の `if` は起動を絞るだけで、判定の責任は持たない。
# あれは best-effort で `$( )` を含む行では開いて倒れるので、`gh api` かどうかはこのスクリプトの側でも確かめる。

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

# 起動条件が素通しさせた無関係なコマンドは、ここで `gh api` でないことを見て外す。
if ! grep -qE '(^|[[:space:]])gh[[:space:]]+api([[:space:]]|$)' <<< "$command_line"; then
  exit 0
fi

# secret は `gh secret` が deny なので、api 経由でも同じ扱いにする。
if grep -qE '/(actions|dependabot|codespaces)/secrets' <<< "$command_line"; then
  ask "secret へ api 経由で届いている。gh secret は deny なので人間の諾否が要る"
  exit 0
fi

# 既存を書き換える／消すメソッドは、対象を問わず戻せない。
if grep -qiE '(^|[[:space:]])(-X|--method)[[:space:]]+(PATCH|PUT|DELETE)([[:space:]]|$)' <<< "$command_line"; then
  ask "既存を書き換えるか消す api 呼び出しである。人間の諾否が要る"
  exit 0
fi

# GraphQL はメソッドでなく mutation の有無が書き込みを決める。
# `-f query=` は読み取りの query にも付くので、フィールドの有無では判定できない。
if grep -qE '(^|[[:space:]])graphql([[:space:]]|$)' <<< "$command_line"; then
  if grep -qE 'mutation[[:space:]]*[({]' <<< "$command_line"; then
    if ! grep -qE 'mutation[[:space:]]*[({][[:space:]]*(resolve|unresolve)ReviewThread' <<< "$command_line" \
      || grep -qiE '(delete|remove|transfer|archive|secret)' <<< "$command_line"; then
      ask "レビュースレッドの resolve 以外の mutation である。人間の諾否が要る"
    fi
  fi
  exit 0
fi

# ここから先は REST。
# `gh api` はフィールドを渡すと自動で POST になるので、メソッドを書かない書き込みも拾う。
writes='(^|[[:space:]])(-X|--method)[[:space:]]+POST([[:space:]]|$)'
writes+='|(^|[[:space:]])(-f|-F|--field|--raw-field|--input)([[:space:]]|=)'

# コメントと返信だけは戻せる側に置く（`gh issue comment` が allow なのと同じ層）。
#
# 見るのはエンドポイントの位置だけで、コマンド全体を探さない。
# 全体を探すと、フィールドの値がたまたま `/comments` を含むだけで別の書き込みが素通りする（`gh api repos/o/r/issues -f title="see /comments"` は issue の作成である）。
# エンドポイントは `gh api` の直後か、メソッド指定を挟んだ直後にしか来ない。
comment_endpoint='(^|[[:space:]])gh[[:space:]]+api[[:space:]]+'
comment_endpoint+='((-X|--method)[[:space:]]+[A-Za-z]+[[:space:]]+)?'
comment_endpoint+='[^-[:space:]][^[:space:]]*/(comments|replies)([[:space:]]|$)'

if grep -qiE "$writes" <<< "$command_line"; then
  if ! grep -qE "$comment_endpoint" <<< "$command_line"; then
    ask "コメント投稿以外の書き込みである。人間の諾否が要る"
  fi
fi
