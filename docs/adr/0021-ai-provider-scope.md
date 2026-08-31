# 0021. AI の語彙をプロバイダ単位で切り、深さを設定へ畳む

- **状態**: 採用
- **決定日**: 2026-08-31
- **関係する ADR**: なし

## 文脈

AI に関する語彙が三つのモジュールへ散っている。
`effort.ts` が思考の深さの値域を、`config.ts` が env から作る既定値を、`claude.ts` が API 呼び出しを持つ。

`effort` は Claude API の `output_config.effort` そのもので、モデル名と同じくプロバイダ固有の概念である。
それがモデル名と別のモジュールに住み、既定値だけがさらに別の `config.ts` に集まっている。
分布の理由は env を読む都合であって、語彙の都合ではない。

将来ほかのプロバイダを足す想定があるので、切り方の軸は「AI 全般」ではなくプロバイダになる。

## 決定

`src/lib/ai/` を作り、次の三枚へ切り直す。

- `ai/index.ts` — 呼び出しの規約と、一回の呼び出しの手順（フェイクモード・呼び出しの記録・欠けた本文を返さないこと）
- `ai/prompt.ts` — モデルへ渡す本文の組み立て（発話者見出しと transcript の畳み方）
- `ai/anthropic.ts` — Anthropic 固有の一切（`Effort` の値域・設定型・env からの読み・HTTP の作法）

`effort.ts` と `claude.ts` は無くなる。

**プロバイダが引き受けるのは、組み立て済みの本文を送って応答を規約の形（`ProviderResponse`）で返すところだけとする。**
打ち切りの綴りはプロバイダごとに違うので判定済みの `truncated` で受け、それをどう扱うか（途中までの本文を返さない）は規約の側が決める。
どのプロバイダの設定も持つ欄（`model` / `maxTokens` / `fake`）は `CommonSettings` として型で括る。
規約の側がプロバイダを選ぶ前に読む欄が、そこに挙がっているものだけだと表明するためである。

**設定は `provider` を判別子とするユニオンで持つ。**
二つ目は `AnthropicSettings | CodexSettings` のように足し、`callPersona` の分岐が網羅性検査で漏れを拾う。

**深さは設定へ畳む。**
`PersonaCall` から `effort` が消え、`AnthropicSettings` の一フィールドになる。
深さは系統（`PersonaRole`）ごとに違うので、設定も系統ごとに解決される（`AI_SETTINGS.concrete` / `AI_SETTINGS.abstract`）。

**プロバイダはアプリ全体で一つとする。**
系統ごとに別プロバイダを選ぶ口は作らない。

**env はプロバイダを名乗る形へ改名する。**

| 旧 | 新 |
|---|---|
| `TOIITO_MODEL` | `TOIITO_ANTHROPIC_MODEL` |
| `TOIITO_MAX_TOKENS` | `TOIITO_ANTHROPIC_MAX_TOKENS` |
| `TOIITO_EFFORT_CONCRETE` | `TOIITO_ANTHROPIC_EFFORT_CONCRETE` |
| `TOIITO_EFFORT_ABSTRACT` | `TOIITO_ANTHROPIC_EFFORT_ABSTRACT` |

`ANTHROPIC_API_KEY` は SDK 慣習の名前なので据え置く。
`TOIITO_FAKE_AI` はプロバイダを叩かないというハーネス側の指定なので、同じく名乗らせない。

**`process.env` を読むのは `config.ts` のままとする。**
`ai/anthropic.ts` が持つのは env を模した object を受ける純関数で、`process.env` を渡すのは `config.ts` である（HARNESS.md「テスト可能性の設計制約」2 は変わらない）。

## 理由

深さをプロバイダ固有の設定に畳むと、プロバイダ間で綴りも値域も違う概念が、呼び出し側の視界から消える。
`callPersona` の引数に固有の値が残る形（共通コア + プロバイダ固有の袋）だと、袋の型が結局 `provider` に依存するので、判別ユニオンを一段遅れて再発明することになる。

共通の欄を型で括ることは、退けた「袋」とは別である。
袋が持つのはプロバイダごとに中身の変わる値で、括るのは全プロバイダが同じ意味で持つ値なので、後者は判別を要さずに読める。

深さを toiito 独自の語彙（`Depth` など）へ正規化する案も採らなかった。
`xhigh` と `max` は他社の値域に無く、写像は情報を落とす。
深さを UI から触らせる要求が出れば正規化に値するが、いまは env にしか出ていない。

プロバイダを系統ごとに選べる口も作らなかった。
二つ目が実在しない段階で選択の口を作っても、正しさを確かめる相手がいない。
判別ユニオンなので、広げるときに要るのは env と解決の配線だけである。

env の改名をいま行うのは、二つ目が来てから直すより安いからである。
対象は 4 本で、触るのは手元の `.env.local` と Vercel の Production / Preview に限られる。
据え置くと `TOIITO_MODEL` が「どちらのモデルか」を答えられないまま残る。

## 帰結

- `AI_SETTINGS` は系統ごとの設定になり、`PERSONA_EFFORT` は無くなる
- `config.ts` に残るのは `DATABASE_URL` と `AI_SETTINGS` の解決だけになる
- `ARCHITECTURE.md` の「Claude API」を、プロバイダの一つとして書き直す
- env の改名に、手元の `.env.local` と Vercel の環境変数の書き換えが要る。
  旧名のまま残った変数は既定へ倒れるので、落ちずに設定だけが効かなくなる

## 覆る条件

- **二つ目のプロバイダを足したとき、`ai/index.ts` の規約に押し込めなかったとき**。
  規約が実質 Anthropic の形をしていたということなので、切り直す
- **ペルソナごと・系統ごとにプロバイダを変えたい要求が出たとき**。
  そのときに単位を決め直す（#64 でペルソナがテーブルへ乗れば、行が列として持つ選択肢も出る）
- **二つ目のプロバイダの応答が `ProviderResponse` に収まらなかったとき**。
  打ち切りと本文と使用トークン数で足りるという見立てが外れたということなので、規約の形を決め直す
- **深さを UI から触らせるとき**。
  独自語彙への正規化を再検討する
