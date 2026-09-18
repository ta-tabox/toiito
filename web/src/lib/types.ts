/**
 * アプリ全体で共有するドメイン型。
 * 永続化の実装（Prisma）にも UI にも依存しない。
 * 意味の正は docs/ARCHITECTURE.md「データモデル」。
 *
 * `db.ts` と UI の境界は `types.ts` 一枚で、Prisma の生成型を `types.ts` の外へ出さない。
 * 時刻は Date（Prisma の DateTime も JS の Date なので詰め替えが要らない）。
 * 表示用の文字列化は `format.ts` の責務で、ドメイン型は持たない。
 * 実行時の値（値域の定数など）は置かず、それぞれのドメインのモジュールが持つ。
 */

import type { MaterialCreator, MaterialKind } from "@/lib/material";
import type { QuestionStatus } from "@/lib/question";
import type { AiCallKind, ApiKeySource } from "@/lib/usage";

/**
 * 所有者の ID。
 *
 * 素の string と混ざらないよう、ブランド型にしてある。
 * `db.ts` の repo 関数は `OwnerId` しか所有者として受け取らないので、URL やフォームから来た文字列をそのまま渡せない。
 * `OwnerId` へ変換してよいのは `user` 表を SELECT した `db.ts` だけで、他所の `as OwnerId` は `tsc` を通っても規約違反として読める。
 */
export type OwnerId = string & { readonly __brand: "OwnerId" };

/**
 * ユーザー。
 * 実体は Better Auth の `user` 表である。
 *
 * `is_admin` の使い道の制約は `prisma/schema.prisma` の `is_admin` のコメントが正。
 */
export type User = {
  id: OwnerId;
  email: string;
  name: string;
  is_admin: boolean;
};

/**
 * 管理の画面の一覧の一行で、ユーザー一人と、そのユーザーが持つ問いとセッションの数。
 * 作るのは `db.ts` の `listUsersForAdmin` で、問いの本文は持たない。
 *
 * `id` を `OwnerId` にしないので、一覧の行から他のユーザーの問いを読む repo 関数へ渡せない。
 */
export type AdminUserRow = {
  id: string;
  email: string;
  name: string;
  question_count: number;
  session_count: number;
};

/**
 * body は原型（投入された生の問い。転記誤りの訂正以外では書き換えない）、current_form は対話の中で言い直された焦点。
 * 二つに分けている理由は docs/ARCHITECTURE.md「原型と現在の形」。
 */
export type Question = {
  id: string;
  body: string;
  current_form: string | null;
  status: QuestionStatus;
  created_at: Date;
};

export type Session = { id: string; question_id: string; started_at: Date };

/**
 * セッションと、そのセッションで付いたメモのキーワード。
 * 対話画面のセッション切り替えが、どのセッションだったかの手掛かりに使う。
 */
export type SessionWithKeywords = Session & { keywords: string[] };

export type Speaker = "human" | "ai_a" | "ai_b";

/**
 * 発話の話者と本文の組。
 * `messages` へ追記する前の発話で、AI へ渡す transcript の一行でもある。
 */
export type Utterance = { speaker: Speaker; body: string };

export type Message = {
  id: string;
  session_id: string;
  speaker: Speaker;
  body: string;
  created_at: Date;
};

/**
 * 発話本文の中の範囲。
 * `start` と `end` は本文先頭からの文字オフセット（JS の string index）で、`start` を含み `end` を含まない。
 *
 * 作れるのは `anchors.ts` の `parseAnchor` だけなので、`Anchor` を受け取る関数は `start >= 0` かつ `end > start` の整数であることを検証し直さない。
 */
export type Anchor = { readonly start: number; readonly end: number } & {
  readonly __brand: "Anchor";
};

/**
 * キーワードメモ。
 * メッセージ本文の一部（anchor_start〜anchor_end）に付く。
 */
export type Memo = {
  id: string;
  message_id: string;
  anchor_start: number;
  anchor_end: number;
  keyword: string;
  note: string | null;
  created_at: Date;
};

/** メモからの逆引きで使う、メモとその出所をまとめた形。 */
export type MemoWithContext = Memo & {
  session_id: string;
  question_id: string;
  question_body: string;
  speaker: Speaker;
  message_body: string;
};

/**
 * 問いに付随する材料（`materials` の行）。
 * 同じ `topic` を持つ行が、一つの論点について立場の違う材料の組になる。
 */
export type Material = {
  id: string;
  question_id: string;
  kind: MaterialKind;
  topic: string;
  body: string;
  source_url: string | null;
  created_by: MaterialCreator;
  created_at: Date;
};

/**
 * `addMaterials` へ渡す、まだ保存していない材料の一件。
 * 出典を持たない材料は `source_url` を省く。
 */
export type MaterialDraft = {
  kind: MaterialKind;
  topic: string;
  body: string;
  source_url?: string;
  created_by: MaterialCreator;
};

/**
 * AI の呼び出し一回分の利用量（`usage_logs` の行）。
 * 問いの本文も、問い・セッション・発話を指す値も持たない。
 */
export type UsageLog = {
  id: string;
  user_id: string;
  provider: string;
  model: string;
  kind: AiCallKind;
  input_tokens: number | null;
  output_tokens: number | null;
  web_search_count: number;
  key_source: ApiKeySource;
  created_at: Date;
};

/**
 * `recordUsage` へ渡す、まだ保存していない利用量の一件。
 * `web_search_count` を省くと 0 に、`key_source` を省くと `system` になる。
 */
export type UsageInput = {
  provider: string;
  model: string;
  kind: AiCallKind;
  input_tokens: number | null;
  output_tokens: number | null;
  web_search_count?: number;
  key_source?: ApiKeySource;
};
