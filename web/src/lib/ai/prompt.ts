/**
 * モデルへ渡す本文の組み立てと、その材料の型（toiito の決め事）。
 * 何をどの順で見せるかはプロバイダに依らないので、API の作法とは別に置く。
 *
 * 出来上がるのは一本のユーザーメッセージで、三者対話の transcript をそのメッセージへまとめる。
 * ai_b の呼び出し時には直前の ai_a の発話も含まれている前提（二体は並列でなく逐次——ai_b は ai_a への応答であることに意味がある）。
 * 利用者が書いた文字列（問い・現在の形・発話）は XML 風のタグの内側にだけ置き、タグの外の見出しと指示文はこのモジュールが書く文字列だけにする。
 */

import type { Speaker, Utterance } from "@/lib/types";

/** ここまでの全発話。 */
export type Transcript = Utterance[];

/**
 * 原型と現在の形を両方渡す。
 * 片方だけでは、問いが移った先を見失うか、原型からのずれを検出できないかのどちらかになる（docs/ARCHITECTURE.md「原型と現在の形」）。
 */
export type QuestionRef = { body: string; current_form?: string | null };

/** 次に発話する AI の発話者。 */
type AiSpeaker = Exclude<Speaker, "human">;

/**
 * transcript の発話者名。
 *
 * モデルはこの文字列をそのまま呼称として使うので、対話に出したくない語を置かない。
 * 内部 ID（ai_a / ai_b）を置くと、AI 同士がその ID で呼び合う。
 * AI の名前は、ペルソナ定義の「あなたは<発話者名>である。」の一文と揃える。
 */
export const SPEAKER_NAME: Record<Speaker, string> = {
  human: "あなた",
  ai_a: "具体さん",
  ai_b: "抽象さん",
};

/**
 * `text` の `&`・`<`・`>` を実体参照へ置き換え、タグの内側に置ける文字列にする。
 *
 * 置き換えないと、本文に書いた `</utterance>` がタグの終わりとして読まれ、その後ろの文字列が別の発話者の発話に見える。
 */
function toTagContent(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

/**
 * 次に `nextSpeaker` が発話するためのユーザーメッセージを、`question` と `transcript` から組み立てる。
 * 原型と現在の形を両方載せる理由は `QuestionRef` の JSDoc にある。
 *
 * 指示文はモデルを発話者名で呼び、ユーザーメッセージの中の「あなた」は人間の発話者名だけにする。
 */
export function buildUserContent(
  question: QuestionRef,
  transcript: Transcript,
  nextSpeaker: AiSpeaker,
): string {
  const dialogue = transcript
    .map(
      (m) =>
        `<utterance speaker="${SPEAKER_NAME[m.speaker]}">\n${toTagContent(m.body)}\n</utterance>`,
    )
    .join("\n\n");

  return [
    `# 投入された問い（原型・不変）\n<question>\n${toTagContent(question.body)}\n</question>`,
    ...(question.current_form
      ? [
          `# 現在の形（対話の中で言い直された焦点）\n<current_form>\n${toTagContent(question.current_form)}\n</current_form>\n\n` +
            `※ 原型からずれていると見えたら、それ自体を突いてよい。`,
        ]
      : []),
    `# ここまでの対話（発話者「${SPEAKER_NAME.human}」は問いを投入した人間）\n${dialogue || "（まだ発話なし。問いへの最初の応答をする）"}`,
    `${SPEAKER_NAME[nextSpeaker]}として、役割定義に従い、次の一手を発話せよ。発話本文のみを出力すること。`,
  ].join("\n\n");
}
