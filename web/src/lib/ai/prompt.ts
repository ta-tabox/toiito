/**
 * モデルへ渡す本文の組み立てと、その材料の型（toiito の決め事）。
 * 何をどの順で見せるかはプロバイダに依らないので、API の作法とは別に置く。
 *
 * 出来上がるのは一本のユーザーメッセージで、三者対話の transcript をそこへ畳む。
 * ai_b の呼び出し時には直前の ai_a の発話も含まれている前提（二体は並列でなく逐次——ai_b は ai_a への応答であることに意味がある）。
 */

import type { Speaker } from "@/lib/types";

/** ここまでの全発話。 */
export type Transcript = { speaker: Speaker; body: string }[];

/**
 * 原型と現在の形を両方渡す。
 * 片方だけでは、問いが移った先を見失うか、原型からのずれを検出できないかのどちらかになる（ARCHITECTURE.md「原型と現在の形」）。
 */
export type QuestionRef = { body: string; current_form?: string | null };

/**
 * transcript の発話者見出し。
 *
 * モデルはこの文字列をそのまま呼称として使うので、対話に出したくない語を置かない。
 * 内部 ID（ai_a / ai_b）を置くと、AI 同士がその ID で呼び合う。
 */
const SPEAKER_TAG: Record<Speaker, string> = {
  human: "あなた",
  ai_a: "具体さん",
  ai_b: "抽象さん",
};

/**
 * ペルソナ一体へ渡すユーザーメッセージを組み立てる。
 * 原型と現在の形を両方載せる理由は QuestionRef の側にある。
 */
export function buildUserContent(
  question: QuestionRef,
  transcript: Transcript,
): string {
  const dialogue = transcript
    .map((m) => `【${SPEAKER_TAG[m.speaker]}】\n${m.body}`)
    .join("\n\n");

  return [
    `# 投入された問い（原型・不変）\n${question.body}`,
    ...(question.current_form
      ? [
          `# 現在の形（対話の中で言い直された焦点）\n${question.current_form}\n\n` +
            `※ 原型からずれていると見えたら、それ自体を突いてよい。`,
        ]
      : []),
    `# ここまでの対話\n${dialogue || "（まだ発話なし。問いへの最初の応答をする）"}`,
    `あなたの役割定義に従い、次の一手を発話せよ。発話本文のみを出力すること。`,
  ].join("\n\n");
}
