/**
 * Anthropic（Claude API）固有の一切（サーバー側のみ）。
 * 思考の深さの値域・設定・env からの読み・HTTP の作法を `anthropic.ts` へ閉じる。
 *
 * `effort` は Claude API の `output_config.effort` そのもので、他のプロバイダには無いか別の名前になるので外へ出さない。
 * 何をどう見せるか（本文の組み立て）と、応答をどう扱うか（記録・打ち切りの拒否）は `lib/ai/index.ts` の決め事なので持たない。
 *
 * `process.env` は読まない。
 * env を模した object を受ける純関数だけを出し、`process.env` を渡すのは `providers.ts`。
 */

import {
  AiProvider,
  type CommonSettings,
  type ProviderRequest,
  type ProviderResponse,
} from "@/lib/ai/provider";
import { isProduction } from "@/lib/config";
import { valueSet } from "@/lib/value-set";

const API_URL = "https://api.anthropic.com/v1/messages";

/**
 * サーバー側で web 検索を行うツールの、Claude API での指定。
 *
 * 版を上げると検索がコード実行の内側で走る形になり、`ANTHROPIC_MODELS` のうち `haiku45` が受け付けない。
 * `send` にモデルごとの分岐を置かずに済むよう、`ANTHROPIC_MODELS` のどれでも動く版を使う。
 */
const WEB_SEARCH_TOOL = {
  type: "web_search_20250305",
  name: "web_search",
} as const;

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
 * 値域の検証。
 * API へ渡す前に、値域の外（未設定・想定外の値）を undefined へ変換する。
 */
const EFFORTS = valueSet<AnthropicEffort>(Object.values(ANTHROPIC_EFFORT));

/** 利用者が選べるモデル。 */
export const ANTHROPIC_MODELS = {
  sonnet5: "claude-sonnet-5",
  opus5: "claude-opus-5",
  haiku45: "claude-haiku-4-5",
} as const;

export type AnthropicModel =
  (typeof ANTHROPIC_MODELS)[keyof typeof ANTHROPIC_MODELS];

/** 利用者が選べるモデルの値域の検証。 */
const MODELS = valueSet<AnthropicModel>(Object.values(ANTHROPIC_MODELS));

/**
 * `value` が `ANTHROPIC_MODELS` のモデル名なら true を返す。
 * 利用者の設定から読んだモデル名は、`isAnthropicModel` で絞り込んでから `AnthropicCredentials` に渡す。
 */
export function isAnthropicModel(value: string): value is AnthropicModel {
  return MODELS.includes(value);
}

/**
 * モデルごとの、深さの指定（`output_config.effort`）を受け付けるか。
 *
 * 受け付けないモデルへ深さを送ると Claude API がエラーを返すので、`readAnthropicSettings` はそのモデルの設定に深さを持たせない。
 */
const ACCEPTS_EFFORT: Record<AnthropicModel, boolean> = {
  [ANTHROPIC_MODELS.sonnet5]: true,
  [ANTHROPIC_MODELS.opus5]: true,
  [ANTHROPIC_MODELS.haiku45]: false,
};

/**
 * `model` が深さの指定を受け付けるなら true を返す。
 * `ANTHROPIC_MODELS` の外のモデル名（`TOIITO_ANTHROPIC_MODEL` で指定したもの）は true を返す。
 */
function acceptsEffort(model: string): boolean {
  return isAnthropicModel(model) ? ACCEPTS_EFFORT[model] : true;
}

/**
 * Claude API の呼び出しに効く環境変数。
 * `process.env` をそのまま渡せるよう、宣言した以外のキーも通す。
 */
type AnthropicEnv = {
  readonly TOIITO_ANTHROPIC_MODEL?: string;
  readonly TOIITO_ANTHROPIC_MAX_TOKENS?: string;
  readonly TOIITO_ANTHROPIC_TIMEOUT_MS?: string;
  readonly ANTHROPIC_API_KEY?: string;
  readonly TOIITO_ANTHROPIC_EFFORT?: string;
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
 * 利用者が登録した API キーと、利用者が選んだモデル。
 * `readAnthropicSettings` が env から読んだ設定の `apiKey` と `model` を、この二つで上書きする。
 */
export type AnthropicCredentials = {
  readonly apiKey: string;
  readonly model: AnthropicModel;
};

/**
 * env が欠けているときに使う既定値。
 *
 * 既定値の文字列を `ANTHROPIC_DEFAULTS` 一箇所に集める。
 * モデルを変えるたびに散らばった文字列を追う形にしないためで、テストも `ANTHROPIC_DEFAULTS` を読む。
 */
export const ANTHROPIC_DEFAULTS = {
  model: ANTHROPIC_MODELS.sonnet5,
  maxTokens: 16000,

  /**
   * 一回の呼び出しを待つ上限（ミリ秒）。
   *
   * 実測の一往復は 15〜27 秒（docs/DEPLOY.md「引き受けている非対称」）なので、一体あたり 120 秒なら正常な生成を切らない。
   * 二体を逐次に待っても立ち上がりの約 10 秒と合わせて Vercel Hobby の 300 秒に収まり、実行環境が強制終了する前に `timeoutMs` で打ち切れる。
   */
  timeoutMs: 120000,

  /**
   * 思考の深さ。
   *
   * `ANTHROPIC_API_KEY` に乗る費用を抑えるので、API の既定（high）より一段下げる。
   */
  effort: ANTHROPIC_EFFORT.medium,
} as const;

/**
 * env から設定を読み、`credentials` があれば `apiKey` と `model` をその値で上書きする。
 * 数として読めない値（未設定・空・非数）と、値域の外の深さ（未設定を含む）は既定値にする。
 * 深さの指定を受け付けないモデルでは、設定に深さを持たせない。
 * 本番（`VERCEL_ENV=production`）で、実 API へ送るのに使う API キーが無ければ throw する。
 *
 * フェイクモードはプロバイダを叩くかどうかの指定で env に依らないので、解決済みの値を受け取る。
 * 深さは利用者ごとに変えないので、`credentials` があっても env から読む。
 */
export function readAnthropicSettings(
  env: AnthropicEnv,
  fake: boolean,
  credentials?: AnthropicCredentials,
): AnthropicSettings {
  // `credentials` があれば利用者のキーを送り、`fake` なら何も送らないので、どちらでもないときだけ `ANTHROPIC_API_KEY` を要求する。
  if (!credentials && isProduction(env) && !fake && !env.ANTHROPIC_API_KEY) {
    throw new Error(
      "ANTHROPIC_API_KEY が本番（VERCEL_ENV=production）で設定されていない（docs/DEPLOY.md「秘密の置き場」）",
    );
  }

  const model =
    credentials?.model ??
    env.TOIITO_ANTHROPIC_MODEL ??
    ANTHROPIC_DEFAULTS.model;
  const effort =
    EFFORTS.from(env.TOIITO_ANTHROPIC_EFFORT) ?? ANTHROPIC_DEFAULTS.effort;

  return {
    model,
    maxTokens:
      Number(env.TOIITO_ANTHROPIC_MAX_TOKENS) || ANTHROPIC_DEFAULTS.maxTokens,
    timeoutMs:
      Number(env.TOIITO_ANTHROPIC_TIMEOUT_MS) || ANTHROPIC_DEFAULTS.timeoutMs,
    effort: acceptsEffort(model) ? effort : undefined,
    fake,
    apiKey: credentials?.apiKey ?? env.ANTHROPIC_API_KEY,
  };
}

/**
 * Claude API の応答のうち、`send` が読む欄。
 *
 * `web_search_tool_result` の `content` は、検索が成功すれば結果の配列、失敗すれば一つのエラーの object になる。
 * 結果が一件も無い検索は空配列を返すので、配列であること自体は成功を意味する。
 */
type MessageResponse = {
  content: {
    type: string;
    text?: string;
    content?:
      | { type: string; url?: string }[]
      | { type: string; error_code?: string };
  }[];
  stop_reason: string | null;
  usage?: {
    input_tokens: number;
    output_tokens: number;
    server_tool_use?: { web_search_requests: number };
  };
};

/**
 * 応答のブロック `content` から、web 検索が返した URL を現れた順で返す。
 * 検索が失敗したブロックがあれば、その `error_code` を添えて throw する。
 *
 * 検索の失敗を URL ゼロ件として返すと、出典の照合（`listMaterialViolations`）が結果ゼロ件として違反を返すので、失敗の理由がどこにも残らない。
 */
function listSearchResultUrls(content: MessageResponse["content"]): string[] {
  const urls: string[] = [];

  for (const block of content) {
    if (block.type !== "web_search_tool_result") {
      continue;
    }

    const result = block.content;

    if (!Array.isArray(result)) {
      throw new Error(
        `Claude API の web 検索が失敗した: ${result?.error_code ?? "不明"}`,
      );
    }

    for (const item of result) {
      if (item.type === "web_search_result" && item.url) {
        urls.push(item.url);
      }
    }
  }

  return urls;
}

/** Claude API を叩くプロバイダ。 */
export class AnthropicProvider extends AiProvider {
  readonly name = "anthropic";
  readonly settings: AnthropicSettings;

  constructor(settings: AnthropicSettings) {
    super();
    this.settings = settings;
  }

  /**
   * 組み立て済みの本文と、`request.webSearch` があれば web 検索のツールを Claude API へ送る。
   * `apiKey` が無ければ送信の前に throw し、`signal` が切れて fetch が投げた例外は捕まえずに呼び出し元へ伝える。
   *
   * 打ち切りは `stop_reason` で判定して通すだけで、拒むかどうかは `lib/ai/index.ts` が決める。
   * `signal` が切れたときの例外を `send` で捕まえると、上限超過として投げ直せなくなる。
   */
  async send(
    request: ProviderRequest,
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
        ...(request.webSearch
          ? {
              tools: [
                { ...WEB_SEARCH_TOOL, max_uses: request.webSearch.maxSearches },
              ],
            }
          : {}),
        system: request.system,
        messages: [{ role: "user", content: request.userContent }],
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      throw new Error(
        `Claude API error ${res.status}: ${detail.slice(0, 300)}`,
      );
    }

    const data: MessageResponse = await res.json();

    // 応答を送り返して続きを出させる経路を持たないので、途中で止まった応答は失敗として扱う。
    if (data.stop_reason === "pause_turn") {
      throw new Error("Claude API の応答が pause_turn で中断した");
    }

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
      searchResultUrls: listSearchResultUrls(data.content),
      webSearchCount: data.usage?.server_tool_use?.web_search_requests ?? 0,
    };
  }
}

/**
 * env から Claude API を叩くプロバイダを作り、`credentials` があれば `apiKey` と `model` をその値で上書きする。
 * throw する条件は `readAnthropicSettings` と同じ。
 */
export function readAnthropicProvider(
  env: AnthropicEnv,
  fake: boolean,
  credentials?: AnthropicCredentials,
): AnthropicProvider {
  return new AnthropicProvider(readAnthropicSettings(env, fake, credentials));
}
