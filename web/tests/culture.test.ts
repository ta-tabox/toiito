import { describe, expect, it } from "vitest";
import { fakeCultureResponse } from "@/lib/ai/fake";
import { listCultureViolations, parseCultureDrafts } from "@/lib/culture";
import type { CultureDraft } from "@/lib/types";

const SEARCH_RESULT_URLS = [
  "https://example.com/a",
  "https://example.com/b",
  "https://example.com/c",
  "https://example.com/d",
];

/** 論点 `topic` について、`sourceUrl` を出典に持つ外部の材料の下書きを作る。 */
function externalDraft(topic: string, sourceUrl?: string): CultureDraft {
  return {
    kind: "external",
    topic,
    body: `${topic}についての材料`,
    source_url: sourceUrl,
    created_by: "auto",
  };
}

describe("parseCultureDrafts", () => {
  it("cultures の配列を持つ JSON の本文から、created_by が auto の下書きを返す", () => {
    const body = JSON.stringify({
      cultures: [
        {
          kind: "external",
          topic: "速さと余白",
          body: "速さは余白を生むとする調査",
          source_url: "https://example.com/a",
        },
      ],
    });

    expect(parseCultureDrafts(body)).toEqual([
      {
        kind: "external",
        topic: "速さと余白",
        body: "速さは余白を生むとする調査",
        source_url: "https://example.com/a",
        created_by: "auto",
      },
    ]);
  });

  it("source_url が null の材料は、source_url を持たない下書きになる", () => {
    const body = JSON.stringify({
      cultures: [
        {
          kind: "internal",
          topic: "速さと余白",
          body: "以前の問いで同じ語を使った",
          source_url: null,
        },
      ],
    });

    const [draft] = parseCultureDrafts(body);

    expect(draft).not.toHaveProperty("source_url");
  });

  it("JSON でない本文は throw する", () => {
    expect(() => parseCultureDrafts("材料は次の通り")).toThrow(
      /JSON として読めない/,
    );
  });

  it("cultures が配列でない本文は throw する", () => {
    expect(() => parseCultureDrafts(JSON.stringify({ cultures: {} }))).toThrow(
      /cultures の配列が無い/,
    );
  });

  it("kind が CULTURE_KINDS に無い材料は throw する", () => {
    const body = JSON.stringify({
      cultures: [{ kind: "opinion", topic: "速さと余白", body: "意見" }],
    });

    expect(() => parseCultureDrafts(body)).toThrow(/cultures\[0\] の kind/);
  });

  it("topic が空の材料は throw する", () => {
    const body = JSON.stringify({
      cultures: [{ kind: "external", topic: " ", body: "論点の無い材料" }],
    });

    expect(() => parseCultureDrafts(body)).toThrow(/cultures\[0\] の topic/);
  });
});

describe("listCultureViolations", () => {
  it("フェイクの培地は、フェイクの検索結果に照らして違反を返さない", () => {
    const response = fakeCultureResponse({ body: "なぜ速さを求めるのか" });
    const drafts = parseCultureDrafts(response.body);

    expect(
      listCultureViolations(drafts, {
        searchResultUrls: response.searchResultUrls,
      }),
    ).toEqual([]);
  });

  it("外部の材料が既定の上限 3 件ちょうどなら、件数の違反を返さない", () => {
    const drafts = [
      externalDraft("論点A", SEARCH_RESULT_URLS[0]),
      externalDraft("論点A", SEARCH_RESULT_URLS[1]),
      externalDraft("論点A", SEARCH_RESULT_URLS[2]),
    ];

    expect(
      listCultureViolations(drafts, { searchResultUrls: SEARCH_RESULT_URLS }),
    ).toEqual([]);
  });

  it("外部の材料が既定の上限 3 件を超えると、件数の違反を返す", () => {
    const drafts = [
      externalDraft("論点A", SEARCH_RESULT_URLS[0]),
      externalDraft("論点A", SEARCH_RESULT_URLS[1]),
      externalDraft("論点B", SEARCH_RESULT_URLS[2]),
      externalDraft("論点B", SEARCH_RESULT_URLS[3]),
    ];

    expect(
      listCultureViolations(drafts, { searchResultUrls: SEARCH_RESULT_URLS }),
    ).toEqual([{ rule: "tooManyExternal", count: 4, limit: 3 }]);
  });

  it("引数で上限を 2 件にすると、外部の材料 3 件は件数の違反になる", () => {
    const drafts = [
      externalDraft("論点A", SEARCH_RESULT_URLS[0]),
      externalDraft("論点A", SEARCH_RESULT_URLS[1]),
      externalDraft("論点A", SEARCH_RESULT_URLS[2]),
    ];

    expect(
      listCultureViolations(drafts, {
        searchResultUrls: SEARCH_RESULT_URLS,
        externalLimit: 2,
      }),
    ).toEqual([{ rule: "tooManyExternal", count: 3, limit: 2 }]);
  });

  it("外部の材料が 1 件しか無い論点は、対立の欠落の違反を返す", () => {
    const drafts = [
      externalDraft("論点A", SEARCH_RESULT_URLS[0]),
      externalDraft("論点A", SEARCH_RESULT_URLS[1]),
      externalDraft("論点B", SEARCH_RESULT_URLS[2]),
    ];

    expect(
      listCultureViolations(drafts, { searchResultUrls: SEARCH_RESULT_URLS }),
    ).toEqual([{ rule: "unpairedTopic", topic: "論点B", count: 1 }]);
  });

  it("検索結果に無い URL を出典に持つ外部の材料は、出典の違反を返す", () => {
    const drafts = [
      externalDraft("論点A", SEARCH_RESULT_URLS[0]),
      externalDraft("論点A", "https://example.com/not-searched"),
    ];

    expect(
      listCultureViolations(drafts, { searchResultUrls: SEARCH_RESULT_URLS }),
    ).toEqual([
      {
        rule: "unlistedSource",
        index: 1,
        source_url: "https://example.com/not-searched",
      },
    ]);
  });

  it("出典を持たない外部の材料は、出典の違反を返す", () => {
    const drafts = [
      externalDraft("論点A", SEARCH_RESULT_URLS[0]),
      externalDraft("論点A"),
    ];

    expect(
      listCultureViolations(drafts, { searchResultUrls: SEARCH_RESULT_URLS }),
    ).toEqual([{ rule: "unlistedSource", index: 1, source_url: undefined }]);
  });

  it("internal と isomorph の下書きは、三つの検査のどれにも数えない", () => {
    const drafts: CultureDraft[] = [
      {
        kind: "internal",
        topic: "論点A",
        body: "以前の問い",
        created_by: "auto",
      },
      {
        kind: "isomorph",
        topic: "論点B",
        body: "別領域の候補",
        created_by: "auto",
      },
    ];

    expect(
      listCultureViolations(drafts, {
        searchResultUrls: SEARCH_RESULT_URLS,
        externalLimit: 0,
      }),
    ).toEqual([]);
  });
});
