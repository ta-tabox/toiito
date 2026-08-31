/**
 * Anthropic（Claude API）固有の一切（サーバー側のみ）。
 * 思考の深さの値域・設定・env からの読み・HTTP の作法をここへ閉じる。
 *
 * `effort` は Claude API の `output_config.effort` そのもので、他のプロバイダには無いか別の綴りになるので外へ出さない。
 * 何をどう見せるか（プロンプトの組み立て）と、応答をどう扱うか（記録・打ち切りの拒否）は呼び出し規約の側の決め事なので持たない。
 *
 * `process.env` は読まない。
 * env を模した object を受ける純関数だけを出し、`process.env` を渡すのは config.ts（HARNESS.md「テスト可能性の設計制約」2）。
 */

import type { CommonSettings, ProviderResponse } from "@/lib/ai";
import type { PersonaRole } from "@/lib/personas";

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
  readonly TOIITO_ANTHROPIC_MODEL?: string;
  readonly TOIITO_ANTHROPIC_MAX_TOKENS?: string;
  readonly TOIITO_FAKE_AI?: string;
  readonly ANTHROPIC_API_KEY?: string;
  readonly TOIITO_ANTHROPIC_EFFORT_CONCRETE?: string;
  readonly TOIITO_ANTHROPIC_EFFORT_ABSTRACT?: string;
  readonly [key: string]: string | undefined;
};

/** Claude API を一回叩くときの設定。 */
export type AnthropicSettings = CommonSettings & {
  /** 設定のユニオンを絞る判別子。 */
  readonly provider: "anthropic";

  /**
   * 思考の深さ。
   * 省くと API の既定（high）で走る。
   */
  readonly effort?: Effort;

  /** Claude API のキー。 */
  readonly apiKey?: string;
};

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
    model: env.TOIITO_ANTHROPIC_MODEL ?? ANTHROPIC_DEFAULTS.model,
    maxTokens:
      Number(env.TOIITO_ANTHROPIC_MAX_TOKENS) || ANTHROPIC_DEFAULTS.maxTokens,
    fake: env.TOIITO_FAKE_AI === "1",
    apiKey: env.ANTHROPIC_API_KEY,
  } as const;

  return {
    concrete: {
      ...shared,
      effort:
        toEffort(env.TOIITO_ANTHROPIC_EFFORT_CONCRETE) ??
        ANTHROPIC_DEFAULTS.effort.concrete,
    },
    abstract: {
      ...shared,
      effort:
        toEffort(env.TOIITO_ANTHROPIC_EFFORT_ABSTRACT) ??
        ANTHROPIC_DEFAULTS.effort.abstract,
    },
  };
}

/**
 * 組み立て済みの本文を Claude API へ送り、応答を規約の形で返す。
 * キーが無ければ叩く前に落とす。
 * 打ち切りと空本文をどう扱うかは呼び出し規約の側が決めるので、ここでは判定だけ済ませて通す。
 */
export async function sendToAnthropic(
  settings: AnthropicSettings,
  system: string,
  userContent: string,
): Promise<ProviderResponse> {
  if (!settings.apiKey) {
    throw new Error("ANTHROPIC_API_KEY が未設定（web/.env.local を確認）");
  }

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
      system,
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

  // thinking だけで応答が終わると text ブロックが一つも来ない。
  const body = data.content
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("");

  return {
    body,
    stopReason: data.stop_reason,
    inputTokens: data.usage?.input_tokens ?? null,
    outputTokens: data.usage?.output_tokens ?? null,
    truncated: data.stop_reason === "max_tokens",
  };
}
