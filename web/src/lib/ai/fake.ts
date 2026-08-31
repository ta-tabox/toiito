/**
 * ハーネス用フェイクモードの応答（HARNESS.md 参照）。
 * ネットワークに出ず決定的なテキストを返す。
 *
 * ペルソナ ID と直近の人間発話を含むのは、E2E から「どの体が・何を受けて」応答したかをアサートするため。
 * 綴りを変えると `e2e/dialogue.spec.ts` と `e2e/memo.spec.ts` が応答を拾えなくなる。
 */

import type { Transcript } from "@/lib/ai/prompt";
import type { PersonaId } from "@/lib/personas";

/** ペルソナ一体分の決定的応答を組み立てる。 */
export function fakeResponse(id: PersonaId, transcript: Transcript): string {
  const lastHuman = [...transcript]
    .reverse()
    .find((m) => m.speaker === "human");
  return `[fake:${id}] 「${lastHuman?.body ?? "(発話なし)"}」への応答`;
}
