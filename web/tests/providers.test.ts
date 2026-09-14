/**
 * `AI_PROVIDERS` が各系統に置く `LazyAiProvider` の検査。
 * 設定の誤りを、プロバイダの組み立てでなく `callPersona` の中で throw させることを守る。
 */

import { describe, expect, it } from "vitest";
import { callPersona, type PersonaCall } from "@/lib/ai";
import { ANTHROPIC_DEFAULTS, AnthropicProvider } from "@/lib/ai/anthropic";
import type { AiProvider } from "@/lib/ai/provider";
import { LazyAiProvider } from "@/lib/ai/providers";

/** `provider` で ai_a を呼ぶ指定を組み立てる。 */
function personaCall(provider: AiProvider): PersonaCall {
  return { id: "ai_a", prompt: "# 具体派", provider };
}

describe("LazyAiProvider", () => {
  it("本体を作ると throw する設定でも、組み立ては throw せず、callPersona が reject する", async () => {
    const call = personaCall(
      new LazyAiProvider(() => {
        throw new Error("ANTHROPIC_API_KEY が設定されていない");
      }),
    );

    await expect(callPersona(call, { body: "問い本文" }, [])).rejects.toThrow(
      /ANTHROPIC_API_KEY/,
    );
  });

  it("本体を作れる設定では、本体の設定で呼ぶ", async () => {
    const call = personaCall(
      new LazyAiProvider(
        () =>
          new AnthropicProvider({
            model: ANTHROPIC_DEFAULTS.model,
            maxTokens: ANTHROPIC_DEFAULTS.maxTokens,
            timeoutMs: ANTHROPIC_DEFAULTS.timeoutMs,
            fake: true,
          }),
      ),
    );

    const body = await callPersona(call, { body: "問い本文" }, [
      { speaker: "human", body: "最初の発話" },
    ]);

    expect(body).toContain("最初の発話");
  });
});
