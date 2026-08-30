/**
 * Claude API 呼び出し層（サーバー側のみ）。
 * 三者対話の transcript を一本のユーザーメッセージに畳んで渡す。
 * ai_b の呼び出し時には直前の ai_a の発話も transcript に含まれている前提（二体は並列でなく逐次——ai_b は ai_a への応答であることに意味がある）。
 *
 * env を読まない。
 * モデル名・トークン上限・フェイクモード・API キーは呼び出し側が解決して渡す（config.ts が env から作る）。
 */

import type { AiSettings } from "@/lib/config";
import type { Effort } from "@/lib/effort";
import type { PersonaId } from "@/lib/personas";
import type { Speaker } from "@/lib/types";

const API_URL = "https://api.anthropic.com/v1/messages";

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
 * ペルソナ一体を呼ぶときの指定。
 *
 * どの体か（id）・何を渡すか（prompt）・どれだけ考えさせるか（effort）と、API 側の設定を一つの値にまとめる。
 * 識別子を prompt から復元しない。
 * ペルソナ定義の見出しに依存すると、見出しを変えた回に黙って壊れる。
 * effort を省くと API の既定（high）で走る。
 */
export type PersonaCall = {
  readonly id: PersonaId;
  readonly prompt: string;
  readonly effort?: Effort;
  readonly settings: AiSettings;
};

/**
 * 一回の API 呼び出しの結果を 1 行の JSON で残す。
 *
 * 発話本文は出さない。
 * 投入される問いは機微な出自を含みうるので、外へ渡すのは打ち切りの検出に足りる長さだけにする。
 * 応答をパースした直後に呼ぶので、この後で例外になった呼び出しも 1 行残る。
 */
function logCall(fields: {
  model: string;
  persona: PersonaId;
  stop_reason: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  duration_ms: number;
  body_length: number;
}): void {
  console.log(JSON.stringify({ event: "claude_call", ...fields }));
}

/**
 * ハーネス用フェイクモード（HARNESS.md 参照）。
 * ネットワークに出ず決定的応答を返す。
 * ペルソナ ID と直近の人間発話を含めることで、E2E 側から「どの体が・何を受けて」応答したかをアサート可能にする。
 */
function fakeResponse(
  id: PersonaId,
  transcript: { speaker: Speaker; body: string }[],
): string {
  const lastHuman = [...transcript]
    .reverse()
    .find((m) => m.speaker === "human");
  return `[fake:${id}] 「${lastHuman?.body ?? "(発話なし)"}」への応答`;
}

/**
 * 原型と現在の形を両方渡す。
 * 片方だけでは、問いが移った先を見失うか、原型からのずれを検出できないかのどちらかになる（ARCHITECTURE.md「原型と現在の形」）。
 */
export type QuestionRef = { body: string; current_form?: string | null };

/**
 * ペルソナ一体を呼んで発話本文を返す。
 * settings.fake が立っているときはネットワークに出ない。
 * transcript はここまでの全発話で、呼ぶ側が順序を保証する。
 * 応答が打ち切られたときと本文が空のときは例外を投げる（欠けた本文を返さない）。
 */
export async function callPersona(
  call: PersonaCall,
  question: QuestionRef,
  transcript: { speaker: Speaker; body: string }[],
): Promise<string> {
  const { settings } = call;

  if (settings.fake) {
    return fakeResponse(call.id, transcript);
  }

  if (!settings.apiKey) {
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
      "x-api-key": settings.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: settings.model,
      max_tokens: settings.maxTokens,
      ...(call.effort ? { output_config: { effort: call.effort } } : {}),
      system: call.prompt,
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
    model: settings.model,
    persona: call.id,
    stop_reason: data.stop_reason,
    input_tokens: data.usage?.input_tokens ?? null,
    output_tokens: data.usage?.output_tokens ?? null,
    duration_ms: Date.now() - startedAt,
    body_length: body.length,
  });

  // 切れた本文を messages へ入れると、immutable なので後から直せない。
  if (data.stop_reason === "max_tokens") {
    throw new Error(
      `Claude API の応答が max_tokens (${settings.maxTokens}) で打ち切られた`,
    );
  }

  // thinking だけで応答が終わると text ブロックが一つも来ない。
  if (!body) {
    throw new Error("Claude API の応答に text ブロックが無い");
  }

  return body;
}
