/**
 * アプリ全体で共有するドメイン型。
 * 永続化の実装（Prisma）にも UI にも依存しない。
 * 意味の正は ARCHITECTURE.md「データモデル」。
 *
 * db.ts と UI の境界はここ一枚。
 * Prisma の生成型はこの向こうへ出さない。
 * 時刻は Date（Prisma の DateTime も JS の Date なので詰め替えが要らない）。
 * 表示用の文字列化は format.ts の責務で、この型は持たない。
 *
 * 実行時の値（値域の定数など）は置かない。
 * それぞれのドメインのモジュールが持つ。
 */

import type { QuestionStatus } from "@/lib/question";

/**
 * 所有者の ID。
 *
 * 素の string と混ざらないよう印を付ける。
 * db.ts の repo 関数はこの型しか所有者として受け取らないので、URL やフォームから来た文字列をそのまま渡せない。
 * 印を付けてよいのは `user` 表を引いた db.ts だけで、他所で `as OwnerId` と書けば型は通るが、それは規約違反として読める。
 */
export type OwnerId = string & { readonly __brand: "OwnerId" };

/**
 * 利用者。
 * 実体は Better Auth の `user` 表で、この器が読むのはこの三つだけ。
 */
export type User = { id: OwnerId; email: string; name: string };

/**
 * body は原型（投入された生の問い。転記誤りの訂正以外では書き換えない）、current_form は対話の中で言い直された焦点。
 * 二つに分けている理由は ARCHITECTURE.md「原型と現在の形」。
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
 * 対話画面の切り替え口が、どのセッションだったかの手掛かりに使う。
 */
export type SessionWithKeywords = Session & { keywords: string[] };

export type Speaker = "human" | "ai_a" | "ai_b";

export type Message = {
  id: string;
  session_id: string;
  speaker: Speaker;
  body: string;
  created_at: Date;
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

/** メモからの逆引き（#5）で使う、メモとその出所をまとめた形。 */
export type MemoWithContext = Memo & {
  session_id: string;
  question_id: string;
  question_body: string;
  speaker: Speaker;
  message_body: string;
};
