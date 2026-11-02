/**
 * ペルソナ一体の発話を作る AI 呼び出しと、その指定の型を置く。
 * 待つ上限・記録・欠けた本文の検査は持たず、`lib/ai/index.ts` の `sendRecorded` が持つ。
 */

import { type RecordUsage, sendRecorded } from "@/lib/ai";
import { fakeResponse } from "@/lib/ai/fake";
import {
  buildUserContent,
  type QuestionRef,
  type Transcript,
} from "@/lib/ai/prompt";
import type { AiProvider } from "@/lib/ai/provider";
import type { PersonaConfig } from "@/lib/types";

/**
 * ペルソナ一体を呼ぶときの指定。
 *
 * どの版で話すか（config）と、どこへ送るか（provider）と、利用量をどう残すか（recordUsage）を一つの値にまとめる。
 * システムプロンプトは版の全文（`config.system_prompt`）で、発話者名は版の呼び名（`config.name`）である。
 */
export type PersonaCall = {
  readonly config: PersonaConfig;
  readonly provider: AiProvider;
  readonly recordUsage: RecordUsage;
};

/**
 * ペルソナ一体を呼んで発話本文を返す。
 * プロバイダの設定で fake が立っているときはネットワークに出ない。
 * transcript はここまでの全発話で、呼ぶ側が順序を保証する。
 * 失敗の仕方と記録の条件は `sendRecorded` と同じで、web 検索は要求しない。
 */
export async function callPersona(
  call: PersonaCall,
  question: QuestionRef,
  transcript: Transcript,
): Promise<string> {
  const { config, provider } = call;

  if (provider.settings.fake) {
    return fakeResponse(config.name, transcript);
  }

  const response = await sendRecorded(
    {
      provider,
      kind: "persona",
      personaConfigId: config.id,
      recordUsage: call.recordUsage,
    },
    {
      system: config.system_prompt,
      userContent: buildUserContent(question, transcript, config.name),
    },
  );

  return response.body;
}
