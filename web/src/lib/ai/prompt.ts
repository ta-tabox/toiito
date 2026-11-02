/**
 * モデルへ渡す本文の組み立てと、その材料の型（toiito の決め事）。
 * 何をどの順で見せるかはプロバイダに依らないので、API の作法とは別に置く。
 *
 * 出来上がるのは一本のユーザーメッセージで、三者対話の transcript をそのメッセージへまとめる。
 * 一往復の 2 番手の呼び出し時には、直前の 1 番手の発話も transcript に含まれている前提で、2 番手の発話は 1 番手への応答として組み立てる。
 * 利用者が書いた文字列（問い・現在の形・発話）は XML 風のタグの内側にだけ置き、タグの外の見出しと指示文はこのモジュールが書く文字列だけにする。
 */

import type { Utterance } from "@/lib/types";

/** ここまでの全発話。 */
export type Transcript = Utterance[];

/**
 * 原型と現在の形を両方渡す。
 * 片方だけでは、問いが移った先を見失うか、原型からのずれを検出できないかのどちらかになる（docs/ARCHITECTURE.md「原型と現在の形」）。
 */
export type QuestionRef = { body: string; current_form?: string | null };

/**
 * transcript の人間の発話者名。
 *
 * モデルはこの文字列をそのまま呼称として使い、指示文は AI を版の呼び名で呼ぶので、ユーザーメッセージの中の「あなた」は人間だけを指す。
 */
const HUMAN_SPEAKER_NAME = "あなた";

/**
 * 発話（`utterance`）の発話者名を返す。
 * AI の発話は、それを書いた版の呼び名を使う。
 *
 * 呼び名は `speaker` 属性の値へ実体参照に置き換えずに入るので、`"`・`<`・`>`・`&` と改行を含まない呼び名だけを版へ書く。
 */
function speakerNameOf(utterance: Utterance): string {
  return utterance.speaker === "human"
    ? HUMAN_SPEAKER_NAME
    : utterance.persona.name;
}

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
 * 次に呼び名 `nextSpeakerName` の AI が発話するためのユーザーメッセージを、`question` と `transcript` から組み立てる。
 * 原型と現在の形を両方載せる理由は `QuestionRef` の JSDoc にある。
 */
export function buildUserContent(
  question: QuestionRef,
  transcript: Transcript,
  nextSpeakerName: string,
): string {
  const dialogue = transcript
    .map(
      (m) =>
        `<utterance speaker="${speakerNameOf(m)}">\n${toTagContent(m.body)}\n</utterance>`,
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
    `# ここまでの対話（発話者「${HUMAN_SPEAKER_NAME}」は問いを投入した人間）\n${dialogue || "（まだ発話なし。問いへの最初の応答をする）"}`,
    `${nextSpeakerName}として、役割定義に従い、次の一手を発話せよ。発話本文のみを出力すること。`,
  ].join("\n\n");
}

/**
 * 材料を寄せる呼び出しのユーザーメッセージを、`question` から組み立てる。
 * 原型と現在の形を両方載せる理由は `QuestionRef` の JSDoc にある。
 *
 * 何をどう出力するかの指示は載せず、`MaterialCall` の `prompt` が持つ。
 */
export function buildMaterialContent(question: QuestionRef): string {
  return [
    `# 材料を集める問い（原型・不変）\n<question>\n${toTagContent(question.body)}\n</question>`,
    ...(question.current_form
      ? [
          `# 現在の形（対話の中で言い直された焦点）\n<current_form>\n${toTagContent(question.current_form)}\n</current_form>`,
        ]
      : []),
  ].join("\n\n");
}
