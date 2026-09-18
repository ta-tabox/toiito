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
import type { PersonaId } from "@/lib/personas";

/**
 * ペルソナ一体を呼ぶときの指定。
 *
 * どの体か（id）・何を渡すか（prompt）と、どこへ送るか（provider）と、利用量をどう残すか（recordUsage）を一つの値にまとめる。
 * 識別子を prompt から復元しない。
 * ペルソナ定義の見出しに依存すると、見出しを変えた回に黙って壊れる。
 */
export type PersonaCall = {
  readonly id: PersonaId;
  readonly prompt: string;
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
  const { provider } = call;

  if (provider.settings.fake) {
    return fakeResponse(call.id, transcript);
  }

  const response = await sendRecorded(
    {
      provider,
      kind: "persona",
      persona: call.id,
      recordUsage: call.recordUsage,
    },
    {
      system: call.prompt,
      userContent: buildUserContent(question, transcript, call.id),
    },
  );

  return response.body;
}
