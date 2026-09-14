/**
 * 解決済みの AI プロバイダ。
 *
 * AI で `process.env` に触るのはこの一枚だけで、env から値への写像と既定値は各プロバイダの純関数が持つ（`.claude/rules/layers.md`「境界の禁止則」）。
 * 呼び出し側は `AI_PROVIDERS` から解決済みのプロバイダを受け取り、env を知らない。
 */

import { readAnthropicProviders } from "@/lib/ai/anthropic";
import {
  AiProvider,
  type CommonSettings,
  type ProviderResponse,
  readFakeMode,
} from "@/lib/ai/provider";
import type { PersonaRole } from "@/lib/personas";

/**
 * `process.env` から作った系統ごとのプロバイダ。
 * `resolveAiProviders` が最初に呼ばれるまで undefined。
 */
let resolved: Record<PersonaRole, AiProvider> | undefined;

/**
 * `process.env` から系統ごとのプロバイダを作って返す。
 * 最初の呼び出しで作り、以後は同じプロバイダを返す。
 * `ANTHROPIC_API_KEY` の欠落と本番の `TOIITO_FAKE_AI=1` は throw し、次の呼び出しでも作り直して同じく throw する。
 */
function resolveAiProviders(): Record<PersonaRole, AiProvider> {
  resolved ??= readAnthropicProviders(process.env, readFakeMode(process.env));

  return resolved;
}

/**
 * `name`・`settings`・`send` を読んだときに `resolve` で本体を取得し、本体へ委ねるプロバイダ。
 *
 * `next build` はページのモジュールを評価して設定を集めるので、評価時に本体を作ると `ANTHROPIC_API_KEY` を持たない CI（`.github/workflows/check.yml`）でビルドが失敗する。
 * `actions.ts` は `personaCalls` を `runTurn` の引数として `pending_messages` への保存より前に評価するので、組み立てで throw すると人間の発話が残らない。
 */
export class LazyAiProvider extends AiProvider {
  constructor(private readonly resolve: () => AiProvider) {
    super();
  }

  /** 本体の `name` を返す。 */
  get name(): string {
    return this.resolve().name;
  }

  /** 本体の `settings` を返す。 */
  get settings(): CommonSettings {
    return this.resolve().settings;
  }

  /** 組み立て済みの本文を本体の `send` へ渡す。 */
  async send(
    system: string,
    userContent: string,
    signal: AbortSignal,
  ): Promise<ProviderResponse> {
    return this.resolve().send(system, userContent, signal);
  }
}

/**
 * 系統ごとの AI プロバイダ。
 * プロバイダはアプリ全体で一つで、系統で分かれるのは思考の深さだけ。
 */
export const AI_PROVIDERS: Record<PersonaRole, AiProvider> = {
  concrete: new LazyAiProvider(() => resolveAiProviders().concrete),
  abstract: new LazyAiProvider(() => resolveAiProviders().abstract),
};
