/**
 * ハーネス用フェイクモードの応答（docs/HARNESS.md 参照）。
 * ネットワークに出ず決定的なテキストを返す。
 *
 * ペルソナ ID と直近の人間発話を含むのは、E2E から「どの体が・何を受けて」応答したかをアサートするため。
 * この書式を変えると `e2e/dialogue.spec.ts` と `e2e/memo.spec.ts` が応答を拾えなくなる。
 */

import type { QuestionRef, Transcript } from "@/lib/ai/prompt";
import type { PersonaId } from "@/lib/personas";

/** ペルソナ一体分の決定的応答を組み立てる。 */
export function fakeResponse(id: PersonaId, transcript: Transcript): string {
  const lastHuman = [...transcript]
    .reverse()
    .find((m) => m.speaker === "human");
  return `[fake:${id}] 「${lastHuman?.body ?? "(発話なし)"}」への応答`;
}

/**
 * 問いに付随する材料を寄せる AI 呼び出しの、フェイクモードの結果。
 * `body` は `parseCultureDrafts` が読む JSON の応答本文で、`searchResultUrls` は検索結果の URL の一覧。
 */
export type FakeCultureResponse = {
  body: string;
  searchResultUrls: string[];
};

/**
 * `question` に対する、材料の決定的な応答を組み立てる。
 *
 * 一つの論点について立場の違う外部の材料を二件返し、出典はどちらも `searchResultUrls` に含めるので、`listCultureViolations` は違反を返さない。
 */
export function fakeCultureResponse(
  question: QuestionRef,
): FakeCultureResponse {
  const topic = `[fake:culture] 「${question.body}」`;
  const searchResultUrls = [
    "https://example.com/fake-culture/for",
    "https://example.com/fake-culture/against",
  ];
  const cultures = [
    {
      kind: "external",
      topic,
      body: "問いの前提を支持する立場の材料",
      source_url: searchResultUrls[0],
    },
    {
      kind: "external",
      topic,
      body: "問いの前提に反対する立場の材料",
      source_url: searchResultUrls[1],
    },
  ];

  return { body: JSON.stringify({ cultures }), searchResultUrls };
}
