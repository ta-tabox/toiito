// Claude API 呼び出し層（サーバー側のみ）
// 三者対話の transcript を一本のユーザーメッセージに畳んで渡す。
// ai_b の呼び出し時には直前の ai_a の発話も transcript に含まれている前提
// （二体は並列でなく逐次——ai_b は ai_a への応答であることに意味がある）。

import type { Speaker } from "./db";

const API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = process.env.TOIITO_MODEL ?? "claude-sonnet-5";

const SPEAKER_TAG: Record<Speaker, string> = {
  human: "人間",
  ai_a: "ai_a（具体派）",
  ai_b: "ai_b（抽象派）",
};

// ハーネス用フェイクモード（HARNESS.md 参照）。
// TOIITO_FAKE_AI=1 でネットワークに出ず決定的応答を返す。
// ペルソナ ID と直近の人間発話を含めることで、E2E 側から
// 「どの体が・何を受けて」応答したかをアサート可能にする。
function fakeResponse(
  systemPrompt: string,
  transcript: { speaker: Speaker; body: string }[]
): string {
  const personaLine = systemPrompt.split("\n")[0].replace(/^#\s*/, "");
  const lastHuman = [...transcript].reverse().find((m) => m.speaker === "human");
  return `[fake:${personaLine}] 「${lastHuman?.body ?? "(発話なし)"}」への応答`;
}

// 原型と現在の形を両方渡す。片方だけでは二種類の失敗が起きる:
// 原型だけ → 対話で問いが移った先を見失う / 現在の形だけ → 元は何を訊きたかったのか
// が検証不能になり、ずれた前提のまま材料が積み上がる。
// 両方見えていれば、二体は「その言い直しは原型からずれていないか」を突けるようになる。
export type QuestionRef = { body: string; current_form?: string | null };

export async function callPersona(
  systemPrompt: string,
  question: QuestionRef,
  transcript: { speaker: Speaker; body: string }[]
): Promise<string> {
  if (process.env.TOIITO_FAKE_AI === "1") {
    return fakeResponse(systemPrompt, transcript);
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY が未設定（web/.env.local を確認）");
  }

  const dialogue = transcript
    .map((m) => `【${SPEAKER_TAG[m.speaker]}】\n${m.body}`)
    .join("\n\n");

  const userContent = [
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

  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: "user", content: userContent }],
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Claude API error ${res.status}: ${detail.slice(0, 300)}`);
  }

  const data = (await res.json()) as {
    content: { type: string; text?: string }[];
  };
  return data.content
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("");
}
