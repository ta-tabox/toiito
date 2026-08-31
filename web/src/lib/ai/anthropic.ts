/**
 * Anthropic（Claude API）の実装（サーバー側のみ）。
 * 思考の深さの値域・設定・env からの読み・API 呼び出しの一切をここへ閉じる。
 *
 * `effort` は Claude API の `output_config.effort` そのもので、他のプロバイダには無いか別の綴りになるので外へ出さない。
 *
 * `process.env` は読まない。
 * env を模した object を受ける純関数だけを出し、`process.env` を渡すのは config.ts（HARNESS.md「テスト可能性の設計制約」2）。
 */

import type { PersonaCall, QuestionRef } from "@/lib/ai";
import type { PersonaId, PersonaRole } from "@/lib/personas";
import type { Speaker } from "@/lib/types";

const API_URL = "https://api.anthropic.com/v1/messages";

/**
 * 思考にどれだけ費やすか。
 * 値域は Claude API の `output_config.effort`。
 * 既定値を書く側が名前で引けるよう、並びでなく名前付きで持つ。
 */
export const EFFORT = {
  low: "low",
  medium: "medium",
  high: "high",
  xhigh: "xhigh",
  max: "max",
} as const;

export type Effort = (typeof EFFORT)[keyof typeof EFFORT];

/** 値域の一覧。 */
const EFFORTS: readonly Effort[] = Object.values(EFFORT);

/**
 * 外から来た文字列を Effort へ絞り込む。
 * API へ渡す前の関門。
 */
export function isEffort(value: string): value is Effort {
  return (EFFORTS as readonly string[]).includes(value);
}

/**
 * 値域に収まる文字列だけを Effort として通す。
 * 未設定と綴り違いはどちらも undefined へ倒す。
 */
function toEffort(value: string | undefined): Effort | undefined {
  return value && isEffort(value) ? value : undefined;
}

/**
 * Claude API の呼び出しに効く環境変数。
 * `process.env` をそのまま渡せるよう、宣言した以外のキーも通す。
 */
type AnthropicEnv = {
  readonly TOIITO_MODEL?: string;
  readonly TOIITO_MAX_TOKENS?: string;
  readonly TOIITO_FAKE_AI?: string;
  readonly ANTHROPIC_API_KEY?: string;
  readonly TOIITO_EFFORT_CONCRETE?: string;
  readonly TOIITO_EFFORT_ABSTRACT?: string;
  readonly [key: string]: string | undefined;
};

/** Claude API を一回叩くときの設定。 */
export type AnthropicSettings = {
  /** 設定のユニオンを絞る判別子。 */
  readonly provider: "anthropic";

  readonly model: string;

  /**
   * 一回の応答に許すトークン数。
   *
   * thinking のトークンもここから引かれるので、本文の想定長で見積もると足りない。
   * 足りなければ本文が途中で切れるか、text ブロックごと出てこない。
   * ストリーミングを使っていないため、上限は HTTP のタイムアウトに収まる範囲で選ぶ。
   */
  readonly maxTokens: number;

  /**
   * 思考の深さ。
   * 省くと API の既定（high）で走る。
   */
  readonly effort?: Effort;

  /** ネットワークに出ず決定的な応答を返すか（HARNESS.md 参照）。 */
  readonly fake: boolean;

  /** Claude API のキー。 */
  readonly apiKey?: string;
};

/** 設定の絞り込みが済んだ呼び出し指定。 */
type AnthropicCall = PersonaCall & { readonly settings: AnthropicSettings };

/**
 * 系統ごとの思考の深さの既定。
 *
 * 深さは個体でなく系統の性質なので、キーは `PersonaId` でなく `PersonaRole`。
 * 抽象系は構造を取り出して材料を添える役で thinking が膨らみやすいので、一段落とす。
 * undefined は API の既定（high）で走らせるという指定。
 */
const DEFAULT_EFFORT: Record<PersonaRole, Effort | undefined> = {
  concrete: undefined,
  abstract: EFFORT.medium,
};

/**
 * env が欠けているときに倒れる先。
 *
 * 既定値の綴りをここ一箇所に集める。
 * モデルを変えるたびに散らばった文字列を追う形にしないためで、テストもここを引く。
 */
export const ANTHROPIC_DEFAULTS = {
  model: "claude-sonnet-5",
  maxTokens: 16000,
  effort: DEFAULT_EFFORT,
} as const;

/**
 * env から系統ごとの設定を読む。
 *
 * 深さだけが系統で分かれ、残りは全系統で同じ値になる。
 * 数として読めない値（未設定・空・非数）と、深さの値域の外（未設定・綴り違い）は既定へ倒す。
 */
export function readAnthropicSettings(
  env: AnthropicEnv,
): Record<PersonaRole, AnthropicSettings> {
  const shared = {
    provider: "anthropic",
    model: env.TOIITO_MODEL ?? ANTHROPIC_DEFAULTS.model,
    maxTokens: Number(env.TOIITO_MAX_TOKENS) || ANTHROPIC_DEFAULTS.maxTokens,
    fake: env.TOIITO_FAKE_AI === "1",
    apiKey: env.ANTHROPIC_API_KEY,
  } as const;

  return {
    concrete: {
      ...shared,
      effort:
        toEffort(env.TOIITO_EFFORT_CONCRETE) ??
        ANTHROPIC_DEFAULTS.effort.concrete,
    },
    abstract: {
      ...shared,
      effort:
        toEffort(env.TOIITO_EFFORT_ABSTRACT) ??
        ANTHROPIC_DEFAULTS.effort.abstract,
    },
  };
}

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
 * ペルソナ一体を Claude API で呼んで発話本文を返す。
 * settings.fake が立っているときはネットワークに出ない。
 * transcript はここまでの全発話で、呼ぶ側が順序を保証する。
 * 応答が打ち切られたときと本文が空のときは例外を投げる（欠けた本文を返さない）。
 */
export async function callAnthropic(
  call: AnthropicCall,
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
      ...(settings.effort
        ? { output_config: { effort: settings.effort } }
        : {}),
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
