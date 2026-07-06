# ARCHITECTURE — トイット（Toiito）

初回セッション（2026-07-06）で VISION.md を土台に起こしたシステムアーキテクチャ。
VISION の設計原理が上位。ここに書くのは「どう作るか」であり「なぜ作るか」ではない。

## 技術スタック（確定事項）

- **Next.js (App Router) + TypeScript** — UI と API を一体で持つ。`web/` 配下
- **Supabase (Postgres)** — 問い・対話・メモの永続化。認証も Supabase Auth に委任
- **Claude API** — 二体 AI の対話生成。API Route（サーバー側）からのみ叩く
- **固定ペルソナ二体** — MVP は可変化しない（発酵後に再検討）

## システム全体像

```
ブラウザ (Next.js UI)
   │  Server Actions / Route Handlers
   ▼
Next.js サーバー層 ──── Claude API（二体のシステムプロンプトを切替えて逐次呼出）
   │
   ▼
Supabase Postgres（questions / sessions / messages / memos / memo_links）
```

単一 Web アプリ。マイクロサービス的分割はしない（個人用コンポスターに
分散は過剰）。AI 呼び出しはストリーミングで UI に流す。

## データモデル（発酵の地層構造）

VISION の「対話は堆積して振り返れるもの」をそのままスキーマにする。

```
questions      問い。コンポスターへの投入単位
  id, body, status(composting/fermented/closed), created_at

sessions       一つの問いに対する対話セッション（複数回ありうる＝再訪）
  id, question_id, started_at

messages       発話。人間 + AI二体の三者
  id, session_id, speaker(human/ai_a/ai_b), body, created_at

memos          キーワードメモ。文字選択で残す
  id, message_id, anchor_start, anchor_end, keyword, note, created_at

memo_links     （将来）メモ間・問い間のリンキング辺
  id, from_memo_id, to_memo_id, kind
```

- **逆引き**は `memos → messages → sessions → questions` の join 一本。
  これが「SQLite でも Postgres でも素直」と判断した根拠であり、
  Supabase でも同じクエリがそのまま成立する
- アンカーはメッセージ本文内の文字オフセット（`anchor_start/end`）。
  メッセージは immutable（追記のみ・編集しない）なのでオフセットが腐らない
- `memo_links` は MVP ではテーブルだけ切っておき、実装は発酵後
  （リンキング粒度の開いた問いはここに着地する）

## 二体 AI のオーケストレーション（超相対性理論モデル）

- ペルソナは **具体派（ai_a）** と **抽象派（ai_b）** の固定二体。
  定義は `web/src/personas/` にシステムプロンプトとして置く（コードでなく文書として管理）
- 発話順は「人間 → ai_a → ai_b」を基本としつつ、直前の流れを両体の
  プロンプトに全量渡す（三者が同じ場を見ている状態を作る）
- **最重要制約の実装位置**: 「答えを与えない」はモデル任せにせず、
  ペルソナのシステムプロンプトに否定形制約として明記する。
  破られたら人間が観察できる（メモを残せる）ことが検知機構を兼ねる
- 一回の人間発話につき AI 呼び出しは二回（ai_a → その出力込みで ai_b）。
  並列にしない——ai_b は ai_a への応答であることに意味がある（衝突と転位）

## ディレクトリ構造

```
toiito/
├── CLAUDE.md          プロジェクト規約（既存）
├── VISION.md          なぜ作るか（既存・正）
├── ARCHITECTURE.md    本文書
├── NEXT.md            セッション跨ぎ handoff（既存）
└── web/               Next.js アプリ本体
    ├── src/
    │   ├── app/           ルーティング（問い一覧 / 対話 / メモ逆引き）
    │   ├── components/    UI 部品（メモのアンダーライン表示など）
    │   ├── lib/           Supabase クライアント・Claude 呼び出し
    │   └── personas/      二体のシステムプロンプト（.md で管理）
    └── supabase/          マイグレーション SQL
```

## 意図的にやらないこと

- KPI・利用統計・ゲーミフィケーション（速度を最適化しない）
- 問いの「解決済み」クローズフロー（チケットではない）
- マルチユーザー対応の作り込み（自分専用。Auth は門としてのみ）

## 持ち越した開いた問い

- 「発酵した」状態の判定（status 列は用意したが遷移条件は未定義）
- リンキングの実装粒度（memo_links の kind をキーワード一致か埋め込みか）
- fermentary questions.md との膜接続（当面は重複を許容し、混ぜない）
