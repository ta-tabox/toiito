/**
 * 解決済みの AI プロバイダ。
 *
 * AI で `process.env` に触るのはこの一枚だけで、env から値への写像と既定値は各プロバイダの純関数が持つ（`.claude/rules/layers.md`「境界の禁止則」）。
 * 呼び出し側は `AI_PROVIDERS` から解決済みのプロバイダを受け取り、env を知らない。
 */

import {
  type AnthropicProvider,
  readAnthropicProviders,
} from "@/lib/ai/anthropic";
import { readFakeMode } from "@/lib/ai/provider";
import type { PersonaRole } from "@/lib/personas";

/**
 * `process.env` から作った系統ごとのプロバイダ。
 * `resolveAiProviders` が最初に呼ばれるまで undefined。
 */
let resolved: Record<PersonaRole, AnthropicProvider> | undefined;

/**
 * `process.env` から系統ごとのプロバイダを作って返す。
 * 最初の呼び出しで作り、以後は同じプロバイダを返す。
 *
 * モジュールの評価時でなく最初の呼び出しまで遅らせるのは、`next build` がページのモジュールを評価して設定を集めるため。
 * 評価時に作ると、`ANTHROPIC_API_KEY` も `TOIITO_FAKE_AI` も持たない CI（`.github/workflows/check.yml`）でビルドが失敗する。
 */
function resolveAiProviders(): Record<PersonaRole, AnthropicProvider> {
  resolved ??= readAnthropicProviders(process.env, readFakeMode(process.env));

  return resolved;
}

/**
 * 系統ごとの AI プロバイダ。
 * プロバイダはアプリ全体で一つで、系統で分かれるのは思考の深さだけ。
 *
 * 欄を最初に読んだときに `process.env` から作るので、`ANTHROPIC_API_KEY` の欠落と本番の `TOIITO_FAKE_AI=1` は、その読み取りが throw する。
 */
export const AI_PROVIDERS: Record<PersonaRole, AnthropicProvider> = {
  /** 具体系のプロバイダを返す。 */
  get concrete() {
    return resolveAiProviders().concrete;
  },

  /** 抽象系のプロバイダを返す。 */
  get abstract() {
    return resolveAiProviders().abstract;
  },
};
