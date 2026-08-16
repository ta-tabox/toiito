// アプリ全体で共有するドメイン型。永続化の実装（現状 node:sqlite、#11 以降 Prisma）にも
// UI にも依存しない。意味の正は ARCHITECTURE.md「データモデル」。
//
// 実行時の値（値域の定数など）は置かない。それぞれのドメインのモジュールが持つ。

import type { QuestionStatus } from "@/lib/question";

// body は原型（投入された生の問い。転記誤りの訂正以外では書き換えない）、
// current_form は対話の中で言い直された焦点。
// 二つに分けている理由は ARCHITECTURE.md「原型と現在の形」。
export type Question = {
  id: string;
  body: string;
  current_form: string | null;
  status: QuestionStatus;
  created_at: string;
};

export type Session = { id: string; question_id: string; started_at: string };

export type Speaker = "human" | "ai_a" | "ai_b";

export type Message = {
  id: string;
  session_id: string;
  speaker: Speaker;
  body: string;
  created_at: string;
};

/** キーワードメモ。メッセージ本文の一部（anchor_start〜anchor_end）に付く。 */
export type Memo = {
  id: string;
  message_id: string;
  anchor_start: number;
  anchor_end: number;
  keyword: string;
  note: string | null;
  created_at: string;
};

/** メモからの逆引き（#5）で使う、メモとその出所をまとめた形。 */
export type MemoWithContext = Memo & {
  session_id: string;
  question_id: string;
  question_body: string;
  speaker: Speaker;
  message_body: string;
};
