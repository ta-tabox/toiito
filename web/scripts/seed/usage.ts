/**
 * 開発用シードとして入れる AI の利用量（`usage_logs` の行）の宣言を置く。
 *
 * フェイクの AI 呼び出しは利用量を記録しないので、管理の画面の利用量の列を手元・Preview で確かめられるのはこの行だけである。
 * 利用者・呼び出しの種別・キーの出所・web 検索の有無・トークン数の NULL・集計の期間の内と外を、それぞれ両方の値で持つ。
 */

import type { UsageInput } from "@/lib/types";
import type { AiCallKind } from "@/lib/usage";

/**
 * 利用量の一行の宣言。
 * 時刻は投入した時刻から `daysAgo` 日さかのぼった瞬間になる。
 */
type UsageSeed = {
  user: "first" | "second";
  daysAgo: number;
  usage: Omit<UsageInput, "created_at">;
};

/** 呼び出しの種別ごとの、プロバイダとモデルと種別の組。 */
const CALLS_BY_KIND = {
  persona: { provider: "anthropic", model: "claude-sonnet-5", kind: "persona" },
  material: {
    provider: "anthropic",
    model: "claude-sonnet-5",
    kind: "material",
  },
} as const satisfies Record<
  AiCallKind,
  Pick<UsageInput, "provider" | "model" | "kind">
>;

/**
 * 入れる行。
 * `user` は `SEED_USERS` の一人目（`first`）と二人目（`second`）を指す。
 */
export const SEED_USAGE: UsageSeed[] = [
  {
    user: "first",
    daysAgo: 0.1,
    usage: { ...CALLS_BY_KIND.persona, input_tokens: 1200, output_tokens: 340 },
  },
  {
    user: "first",
    daysAgo: 1,
    usage: {
      ...CALLS_BY_KIND.material,
      input_tokens: 2400,
      output_tokens: 900,
      web_search_count: 3,
    },
  },
  {
    user: "first",
    daysAgo: 2,
    usage: {
      ...CALLS_BY_KIND.persona,
      input_tokens: null,
      output_tokens: null,
      key_source: "user",
    },
  },
  {
    user: "first",
    daysAgo: 30,
    usage: { ...CALLS_BY_KIND.persona, input_tokens: 1000, output_tokens: 300 },
  },
  {
    user: "second",
    daysAgo: 3,
    usage: { ...CALLS_BY_KIND.persona, input_tokens: 800, output_tokens: 200 },
  },
  {
    user: "second",
    daysAgo: 6,
    usage: {
      ...CALLS_BY_KIND.material,
      input_tokens: 1500,
      output_tokens: 600,
      web_search_count: 1,
      key_source: "user",
    },
  },
];
