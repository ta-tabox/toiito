/**
 * 解決済みの AI プロバイダと、利用者の API キーとモデルからプロバイダを作る関数を置く。
 *
 * AI で `process.env` に触るのはこの一枚だけで、env から値への写像と既定値は各プロバイダの純関数が持つ（`.claude/rules/layers.md`「境界の禁止則」）。
 * 呼び出し側は `AI_PROVIDER` か `aiProviderFor` から解決済みのプロバイダを受け取り、env を知らない。
 *
 * `AI_PROVIDER` はモジュールの評価時に作るので、本番で `ANTHROPIC_API_KEY` が無ければ、`next build` がページを評価する時点で throw してビルドが失敗する。
 * 本番以外（キーを持たない CI の `next build` を含む）では throw せず、送る前に `AnthropicProvider.send` が throw する。
 */

import {
  type AnthropicCredentials,
  type AnthropicProvider,
  readAnthropicProvider,
} from "@/lib/ai/anthropic";
import { readFakeMode } from "@/lib/ai/provider";

/** 運営の API キーと既定のモデルで呼ぶ、アプリ全体で一つの AI プロバイダ。 */
export const AI_PROVIDER = readAnthropicProvider(
  process.env,
  readFakeMode(process.env),
);

/**
 * 利用者の API キーとモデル（`credentials`）で呼ぶプロバイダを返す。
 * `credentials` が無ければ `AI_PROVIDER` を返す。
 *
 * 最大トークン数・待つ上限・思考の深さ・フェイクモードは、`credentials` があっても env から読む。
 */
export function aiProviderFor(
  credentials?: AnthropicCredentials,
): AnthropicProvider {
  if (!credentials) {
    return AI_PROVIDER;
  }

  return readAnthropicProvider(
    process.env,
    readFakeMode(process.env),
    credentials,
  );
}
