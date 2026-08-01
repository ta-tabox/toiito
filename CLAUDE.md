# toiito — 有期プロジェクト（terrarium）

目的: 問いをコンポスターに投げ入れて発酵させる Web アプリ「トイット（Toiito）」を
設計・実装する。AI をスピードアップではなくスローダウン（自分の問いを深め、
安易な答えに逃げない）のために使うという問題意識の具体化。
全体像は `VISION.md`（立ち上げ時に fermentary セッションで意味構築した正）。
完了条件: MVP（問い投入 → 二視点AIとの対話 → キーワードメモ → メモからの
セッション逆引き、の一連）が動き、自分の問いで実際に常用できている状態。
このプロジェクトは**終わる**。手仕舞いの正典は
`~/vivarium/fermentary/playbooks/terrarium.md`（収穫掃引 → _closed）。
人間が「クローズして」と言ったら、正典の手仕舞い手順を読み、Claude 側の担当分
（収穫掃引・最終コミット・ATLAS の行を closed に更新）を実行し、
人間側の残り（Cowork プロジェクトを閉じる・`_closed/` への mv）を明示して引き渡す。

## セッション開始時にやること
0. fermentary（第二マウント）が見えることを確認する（`fermentary/RULES.md` が
   読めるか）。**見えなければ作業を始めず**、人間に「fermentary が並置されていない」
   と指摘して連携を求める（並置なしのセッションは膜からも台帳からも切断されている）
1. `NEXT.md` を見て続きを拾う
2. fermentary（第二マウント）の `NEXT.md` に自分宛の搬送メモがあれば拾う
3. fermentary の `ATLAS.md`（terrarium 節）の自行を一瞥し、status が実態と
   乖離していたら直す（初回セッション実施・MVP 到達・方針転換などの節目を反映。
   台帳はこのプロジェクトの状態を fermentary へ伝える唯一の口）

## 開発ハーネス（正典: `HARNESS.md`）
変更 → `web/` で `pnpm check`（型→lint→テスト→ビルド）→ 緑ならコミット。
パッケージマネージャは pnpm。版管理はランタイム共々 **mise**（ルートの `mise.toml` が正。
corepack は使わない。toolchain 正典: fermentary/playbooks/toolchain.md）。npm/yarn は使わない。
**check が赤のままコミットしない**。AI 呼び出しを伴う動作確認は
`TOIITO_FAKE_AI=1` で（実 API を自動テストで叩かない）。
ロジックは lib 層へ寄せ、「lib 関数 + テスト → UI 配線」の順で作る。
Cowork サンドボックスではビルドのみ `/tmp` コピーで実行（FUSE が unlink 拒否）。

コーディング規約: @CODING.md（詳細判断は skill `coding-standards`）

## git
署名は fermentary/RULES.md #5 に従う。Claude は機械 author
（`git -c user.name=claude -c user.email=claude@local commit`）。
**メッセージ prefix は変更の型**——`feat:` `fix:` `docs:` `refactor:` `chore:`
`test:`、部位を添えるなら `feat(web):`。**プロジェクト名は名乗らない**
（このリポジトリが既に答えている。外の器から書き込むときも同じ型を使う）。
push・リモート操作は人間のみ。

## 知識区分の膜（正典: ~/vivarium/fermentary/playbooks/membrane.md）

このプロジェクトも vivarium 共通の膜に従う。一行判定:

> 事実の参照ならこのプロジェクトの kb/stock、言い切れる抽象なら
> fermentary/memory/inbox.md、開いた問いなら fermentary/memory/questions.md、
> 別領域行きなら fermentary/NEXT.md に搬送メモ（本文が数行に収まらないなら
> **封緘搬送**——一行要約からの再生成は内容を変質させる。手順は正典の搬送節）、
> どれでもなければ流す。

セッション開始時に fermentary/NEXT.md の自分宛（`[→このプロジェクト]`）搬送メモを
確認し、あれば拾って消す。宛先が自分でないメモは実行も削除も編集もしない。

膜を触る前に正典を読む（不変条件: 本文複製禁止／昇格は人間／捕捉で git を
触らない、他）。追記の書式は各キュー先頭のコメントが自己記述している。
