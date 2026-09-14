/**
 * 解決済みの AI プロバイダ。
 *
 * AI で `process.env` に触るのはこの一枚だけで、env から値への写像と既定値は各プロバイダの純関数が持つ（`.claude/rules/layers.md`「境界の禁止則」）。
 * 呼び出し側は `AI_PROVIDERS` から解決済みのプロバイダを受け取り、env を知らない。
 */

import { readAnthropicProviders } from "@/lib/ai/anthropic";
import { readFakeMode } from "@/lib/ai/provider";

/**
 * 系統ごとの AI プロバイダ。
 * プロバイダはアプリ全体で一つで、系統で分かれるのは思考の深さだけ。
 */
export const AI_PROVIDERS = readAnthropicProviders(
  process.env,
  readFakeMode(process.env),
);
