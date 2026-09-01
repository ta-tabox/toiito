/**
 * Anthropic（Claude API）固有の一切（サーバー側のみ）。
 * 思考の深さの値域・設定・env からの読み・HTTP の作法をここへ閉じる。
 *
 * `effort` は Claude API の `output_config.effort` そのもので、他のプロバイダには無いか別の名前になるので外へ出さない。
 * 何をどう見せるか（本文の組み立て）と、応答をどう扱うか（記録・打ち切りの拒否）は規約の側の決め事なので持たない。
 *
 * `process.env` は読まない。
 * env を模した object を受ける純関数だけを出し、`process.env` を渡すのは providers.ts（HARNESS.md「テスト可能性の設計制約」2）。
 */

import {
  AiProvider,
  type CommonSettings,
  type ProviderResponse,
} from "@/lib/ai/provider";
import type { PersonaRole } from "@/lib/personas";
import { valueSet } from "@/lib/value-set";

const API_URL = "https://api.anthropic.com/v1/messages";

/**
 * 思考にどれだけ費やすか。
 * 値域は Claude API の `output_config.effort` で、他社の同種の指定とは値も表記も違うので名前でスコープを切る。
 * 既定値を書く側が名前で引けるよう、並びでなく名前付きで持つ。
 */
export const ANTHROPIC_EFFORT = {
  low: "low",
  medium: "medium",
  high: "high",
  xhigh: "xhigh",
  max: "max",
} as const;

export type AnthropicEffort =
  (typeof ANTHROPIC_EFFORT)[keyof typeof ANTHROPIC_EFFORT];

/**
 * 値域の関門。
 * API へ渡す前に、値域の外（未設定・想定外の値）をここで落とす。
 */
const EFFORTS = valueSet<AnthropicEffort>(Object.values(ANTHROPIC_EFFORT));

/**
 * Claude API の呼び出しに効く環境変数。
 * `process.env` をそのまま渡せるよう、宣言した以外のキーも通す。
 */
type AnthropicEnv = {
  readonly TOIITO_ANTHROPIC_MODEL?: string;
  readonly TOIITO_ANTHROPIC_MAX_TOKENS?: string;
  readonly TOIITO_ANTHROPIC_TIMEOUT_MS?: string;
  readonly ANTHROPIC_API_KEY?: string;
  readonly TOIITO_ANTHROPIC_EFFORT_CONCRETE?: string;
  readonly TOIITO_ANTHROPIC_EFFORT_ABSTRACT?: string;
  readonly [key: string]: string | undefined;
};

/** Claude API を一回叩くときの設定。 */
export type AnthropicSettings = CommonSettings & {
  /**
   * 思考の深さ。
   * 省くと API の既定（high）で走る。
   */
  readonly effort?: AnthropicEffort;

  /** Claude API のキー。 */
  readonly apiKey?: string;
};

/**
 * 系統ごとの思考の深さの既定。
 *
 * 抽象系は構造を取り出して材料を添える役で thinking が膨らみやすいので、一段落とす。
 * undefined は API の既定（high）で走らせるという指定。
 */
const DEFAULT_EFFORT: Record<PersonaRole, AnthropicEffort | undefined> = {
  concrete: undefined,
  abstract: ANTHROPIC_EFFORT.medium,
};

/** 系統ごとの深さを指定する環境変数。 */
const EFFORT_ENV_KEY: Record<PersonaRole, string> = {
  concrete: "TOIITO_ANTHROPIC_EFFORT_CONCRETE",
  abstract: "TOIITO_ANTHROPIC_EFFORT_ABSTRACT",
};

/**
 * env が欠けているときに倒れる先。
 *
 * 既定値の文字列をここ一箇所に集める。
 * モデルを変えるたびに散らばった文字列を追う形にしないためで、テストもここを引く。
 */
export const ANTHROPIC_DEFAULTS = {
  model: "claude-sonnet-5",
  maxTokens: 16000,

  /**
   * 一回の呼び出しを待つ上限（ミリ秒）。
   *
   * 実測の一往復は 15〜27 秒（DEPLOY.md「引き受けている非対称」）なので、一体あたり 120 秒なら正常な生成を切らない。
   * 二体を逐次に待っても立ち上がりの約 10 秒と合わせて Vercel Hobby の 300 秒に収まり、実行環境に殺される前にこちらが切れる。
   */
  timeoutMs: 120000,
  effort: DEFAULT_EFFORT,
} as const;

/**
 * env から設定を読む。
 *
 * 深さは系統ごとに違うので、ここでは読まない（`readAnthropicProviders` が足す）。
 * 数として読めない値（未設定・空・非数）は既定へ倒す。
 * フェイクモードはプロバイダを叩くかどうかの指定で env に依らないので、解決済みの値を受け取る。
 */
export function readAnthropicSettings(
  env: AnthropicEnv,
  fake: boolean,
): AnthropicSettings {
  return {
    model: env.TOIITO_ANTHROPIC_MODEL ?? ANTHROPIC_DEFAULTS.model,
    maxTokens:
      Number(env.TOIITO_ANTHROPIC_MAX_TOKENS) || ANTHROPIC_DEFAULTS.maxTokens,
    timeoutMs:
      Number(env.TOIITO_ANTHROPIC_TIMEOUT_MS) || ANTHROPIC_DEFAULTS.timeoutMs,
    fake,
    apiKey: env.ANTHROPIC_API_KEY,
  };
}

/** Claude API を叩くプロバイダ。 */
export class AnthropicProvider extends AiProvider {
  readonly name = "anthropic";

  constructor(readonly settings: AnthropicSettings) {
    super();
  }

  /**
   * 組み立て済みの本文を Claude API へ送る。
   *
   * キーが無ければ叩く前に落とす。
   * 打ち切りは `stop_reason` で判定して通すだけで、拒むかどうかは規約の側が決める。
   * 上限を超えると `signal` が切れ、走っている fetch は例外を投げて中断する。
   * その例外はここで捕まえないので、呼び出し元の `callPersona` へそのまま伝わり、あちらが上限超過として投げ直す。
   */
  async send(
    system: string,
    userContent: string,
    signal: AbortSignal,
  ): Promise<ProviderResponse> {
    const { settings } = this;

    if (!settings.apiKey) {
      throw new Error("ANTHROPIC_API_KEY が未設定（web/.env.local を確認）");
    }

    const res = await fetch(API_URL, {
      method: "POST",
      signal,
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
      throw new Error(
        `Claude API error ${res.status}: ${detail.slice(0, 300)}`,
      );
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
}

/**
 * env から系統ごとの深さを読む。
 * 値域の外（未設定・想定外の値）は既定へ倒す。
 */
function readEffort(
  env: AnthropicEnv,
  role: PersonaRole,
): AnthropicEffort | undefined {
  return (
    EFFORTS.from(env[EFFORT_ENV_KEY[role]]) ?? ANTHROPIC_DEFAULTS.effort[role]
  );
}

/**
 * env から系統ごとのプロバイダを作る。
 *
 * 深さは個体でなく系統の性質なので、キーは `PersonaId` でなく `PersonaRole`。
 * 系統で分かれるのは深さだけで、残りは全系統が同じ設定を持つ。
 */
export function readAnthropicProviders(
  env: AnthropicEnv,
  fake: boolean,
): Record<PersonaRole, AnthropicProvider> {
  const settings = readAnthropicSettings(env, fake);

  return {
    concrete: new AnthropicProvider({
      ...settings,
      effort: readEffort(env, "concrete"),
    }),
    abstract: new AnthropicProvider({
      ...settings,
      effort: readEffort(env, "abstract"),
    }),
  };
}
