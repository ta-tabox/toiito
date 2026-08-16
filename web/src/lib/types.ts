// アプリ全体で共有するドメイン型。永続化の実装（現状 node:sqlite、#11 以降 Prisma）にも
// UI にも依存しない。意味の正は ARCHITECTURE.md「データモデル」。

// 問いの状態。型・DB の check・UI ラベルはここから派生する。
// 各値の意味と 6 値である理由は ARCHITECTURE.md「問いの状態機械」。
export const QUESTION_STATUSES = [
  "composting", // 投入済み。まだ材料が付いていない
  "fermented", // 材料（培地）が付き、蒸留に入れる
  "promoted", // 答えが結晶した（別の器へ書き出した）
  "open", // 持ち続ける問い。答えが出ないことは欠陥ではない
  "perennial", // 閉じないことが正しい問い。閉じ候補として催促しない
  "discarded", // 棄却
] as const;

export type QuestionStatus = (typeof QUESTION_STATUSES)[number];

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

/**
 * 本文を切り分けた一区間。「掛かっているメモの組み合わせが変わらない最大の連続範囲」で、
 * UI はこれを 1 単位として下線を描く。
 *
 * 本文先頭からの位置 start は生成時に確定するので、自分で持つ。
 * これが無いと、セグメント内オフセットを絶対オフセットへ戻すたびに
 * 手前のセグメントを全部足し直すことになる。
 */
export class Segment {
  constructor(
    readonly text: string,
    readonly start: number,
    readonly memoIds: string[],
  ) {}

  /** UI が返すセグメント内オフセットを、本文先頭基準の絶対オフセットへ換算する。 */
  absoluteOffset(offsetInSegment: number): number {
    return this.start + offsetInSegment;
  }
}
