/**
 * Claude API 呼び出し層（サーバー側のみ）。
 * 三者対話の transcript を一本のユーザーメッセージに畳んで渡す。
 * ai_b の呼び出し時には直前の ai_a の発話も transcript に含まれている前提（二体は並列でなく逐次——ai_b は ai_a への応答であることに意味がある）。
 */

import type { Speaker } from "@/lib/types";

const API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = process.env.TOIITO_MODEL ?? "claude-sonnet-5";

/**
 * 一回の応答に許すトークン数。
 *
 * thinking のトークンもここから引かれるので、本文の想定長で見積もると足りない。
 * 足りなければ本文が途中で切れるか、text ブロックごと出てこない。
 * ストリーミングを使っていないため、上限は HTTP のタイムアウトに収まる範囲で選ぶ。
 * 数として読めない値（未設定・空・非数）は既定へ倒す。
 */
const MAX_TOKENS = Number(process.env.TOIITO_MAX_TOKENS) || 16000;

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
 * 思考にどれだけ費やすか。
 * 値域は Claude API の `output_config.effort`。
 */
export const EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;

export type Effort = (typeof EFFORTS)[number];

/**
 * 外から来た文字列を Effort へ絞り込む。
 * API へ渡す前の関門。
 */
export function isEffort(value: string): value is Effort {
  return (EFFORTS as readonly string[]).includes(value);
}

/**
 * システムプロンプト冒頭の見出しから、どのペルソナかを表す一行を取り出す。
 * ペルソナ定義（`src/personas/*.md`）は `# ai_a — 具体派` で始まる。
 */
function personaLabel(systemPrompt: string): string {
  return systemPrompt.split("\n")[0].replace(/^#\s*/, "");
}

/**
 * 一回の API 呼び出しの結果を 1 行の JSON で残す。
 *
 * 発話本文は出さない。
 * 投入される問いは機微な出自を含みうるので、外へ渡すのは打ち切りの検出に足りる長さだけにする。
 * 応答をパースした直後に呼ぶので、この後で例外になった呼び出しも 1 行残る。
 */
function logCall(fields: {
  persona: string;
  stop_reason: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  duration_ms: number;
  body_length: number;
}): void {
  console.log(
    JSON.stringify({ event: "claude_call", model: MODEL, ...fields }),
  );
}

/**
 * ハーネス用フェイクモード（HARNESS.md 参照）。
 * TOIITO_FAKE_AI=1 でネットワークに出ず決定的応答を返す。
 * ペルソナ ID と直近の人間発話を含めることで、E2E 側から「どの体が・何を受けて」応答したかをアサート可能にする。
 */
function fakeResponse(
  systemPrompt: string,
  transcript: { speaker: Speaker; body: string }[],
): string {
  const personaLine = personaLabel(systemPrompt);
  const lastHuman = [...transcript]
    .reverse()
    .find((m) => m.speaker === "human");
  return `[fake:${personaLine}] 「${lastHuman?.body ?? "(発話なし)"}」への応答`;
}

/**
 * 原型と現在の形を両方渡す。
 * 片方だけでは、問いが移った先を見失うか、原型からのずれを検出できないかのどちらかになる（ARCHITECTURE.md「原型と現在の形」）。
 */
export type QuestionRef = { body: string; current_form?: string | null };

/**
 * ペルソナ一体を呼んで発話本文を返す。
 * TOIITO_FAKE_AI=1 のときはネットワークに出ない。
 * transcript はここまでの全発話で、呼ぶ側が順序を保証する。
 * 応答が打ち切られたときと本文が空のときは例外を投げる（欠けた本文を返さない）。
 * effort を省くと API の既定（high）で走る。
 */
export async function callPersona(
  systemPrompt: string,
  question: QuestionRef,
  transcript: { speaker: Speaker; body: string }[],
  effort?: Effort,
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

  const startedAt = Date.now();
  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      ...(effort ? { output_config: { effort } } : {}),
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
    stop_reason: string | null;
    usage?: { input_tokens: number; output_tokens: number };
  };

  const body = data.content
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("");

  logCall({
    persona: personaLabel(systemPrompt),
    stop_reason: data.stop_reason,
    input_tokens: data.usage?.input_tokens ?? null,
    output_tokens: data.usage?.output_tokens ?? null,
    duration_ms: Date.now() - startedAt,
    body_length: body.length,
  });

  // 切れた本文を messages へ入れると、immutable なので後から直せない。
  if (data.stop_reason === "max_tokens") {
    throw new Error(
      `Claude API の応答が max_tokens (${MAX_TOKENS}) で打ち切られた`,
    );
  }

  // thinking だけで応答が終わると text ブロックが一つも来ない。
  if (!body) {
    throw new Error("Claude API の応答に text ブロックが無い");
  }

  return body;
}
