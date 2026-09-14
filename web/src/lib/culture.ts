/**
 * 問いに付随する材料（`cultures` の行）のドメイン。
 * `kind` と `created_by` の値域と判定、AI の応答本文から下書きを取り出す処理、下書きが材料の規律を守っているかの検査を持つ。
 *
 * 行の読み書きは `db.ts` が持ち、AI の呼び出しは `lib/ai` が持つので、`culture.ts` は DB にもネットワークにも触らない。
 */

import type { CultureDraft } from "@/lib/types";

/**
 * 材料の種類。
 * `internal` は自分の過去の問いとメモ、`external` は外部の調査、`isomorph` は別領域と同じ形に見える候補を指す。
 *
 * DB の enum `CultureKind`（`prisma/schema.prisma`）と同じ並びなので、値を足すときは両方に足す。
 */
export const CULTURE_KINDS = ["internal", "external", "isomorph"] as const;

export type CultureKind = (typeof CULTURE_KINDS)[number];

/**
 * 材料を作った主体。
 * `auto` は AI が寄せた材料、`human` は人間が足した材料を指す。
 *
 * DB の enum `CultureCreator`（`prisma/schema.prisma`）と同じ並びなので、値を足すときは両方に足す。
 */
export const CULTURE_CREATORS = ["auto", "human"] as const;

export type CultureCreator = (typeof CULTURE_CREATORS)[number];

/**
 * 一回の付与で許す外部の材料の件数の、既定の上限。
 *
 * 対話の中で二体の AI が出す材料と同じ上限にそろえてある（ペルソナの md の「材料の供給規律」節）。
 */
export const EXTERNAL_CULTURE_LIMIT = 3;

/** 一つの論点について求める、外部の材料の最小の件数。 */
const MIN_EXTERNAL_PER_TOPIC = 2;

/**
 * 材料の規律への違反の一件。
 * `index` は `listCultureViolations` へ渡した `drafts` の中の位置。
 */
export type CultureViolation =
  | { rule: "tooManyExternal"; count: number; limit: number }
  | { rule: "unpairedTopic"; topic: string; count: number }
  | { rule: "unlistedSource"; index: number; source_url: string | undefined };

/**
 * `listCultureViolations` が照らす規律。
 * `searchResultUrls` は AI の web 検索が返した URL の一覧で、`externalLimit` を省くと `EXTERNAL_CULTURE_LIMIT` になる。
 */
export type CultureRules = {
  searchResultUrls: readonly string[];
  externalLimit?: number;
};

/** 外から来た文字列 `value` を `CultureKind` へ絞り込む。 */
export function isCultureKind(value: string): value is CultureKind {
  return (CULTURE_KINDS as readonly string[]).includes(value);
}

/**
 * AI の応答本文 `responseBody` を `{"cultures": [{"kind", "topic", "body", "source_url"}]}` の JSON として読み、`CultureDraft` の配列を返す。
 * 本文が JSON でないか、`cultures` が配列でないか、材料の一件でも形が合わなければ throw する。
 *
 * 返す下書きの `created_by` はすべて `auto` になる。
 * 問いは機微な出自を含みうるので、エラーの文面に応答本文を含めない。
 */
export function parseCultureDrafts(responseBody: string): CultureDraft[] {
  const parsed = parseJson(responseBody);

  if (!isRecord(parsed) || !Array.isArray(parsed.cultures)) {
    throw new Error("AI の応答本文に cultures の配列が無い");
  }

  return parsed.cultures.map((item: unknown, index) =>
    parseCultureDraft(item, index),
  );
}

/**
 * 下書き `drafts` を、外部の材料の件数・論点ごとの対立・出典の三つの規律 `rules` に照らし、違反の一覧を返す。
 * 違反が無ければ空配列を返す。
 *
 * 三つとも `kind` が `external` の下書きにだけ当て、`internal` と `isomorph` は数えない。
 * 出典を持たない外部の材料は、検索結果に無い出典と同じ `unlistedSource` になる。
 */
export function listCultureViolations(
  drafts: readonly CultureDraft[],
  rules: CultureRules,
): CultureViolation[] {
  const externals = drafts.filter((draft) => draft.kind === "external");
  const limit = rules.externalLimit ?? EXTERNAL_CULTURE_LIMIT;

  return [
    ...tooManyExternalViolations(externals.length, limit),
    ...unpairedTopicViolations(externals),
    ...unlistedSourceViolations(drafts, rules.searchResultUrls),
  ];
}

/**
 * `responseBody` を JSON として読んだ値を返す。
 * JSON でなければ、`JSON.parse` の例外を `cause` に持たせて throw する。
 */
function parseJson(responseBody: string): unknown {
  try {
    return JSON.parse(responseBody);
  } catch (cause) {
    throw new Error("AI の応答本文を JSON として読めない", { cause });
  }
}

/** `value` が配列でないオブジェクトなら true を返す。 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * 応答本文の `cultures` の `index` 番目 `item` を検査し、`created_by` が `auto` の `CultureDraft` を返す。
 * `kind` が `CULTURE_KINDS` に無いか、`topic` か `body` が空か、`source_url` が文字列でも null でもなければ throw する。
 *
 * `source_url` が null か省略された材料は、`source_url` を持たない下書きになる。
 */
function parseCultureDraft(item: unknown, index: number): CultureDraft {
  if (!isRecord(item)) {
    throw new Error(`cultures[${index}] がオブジェクトでない`);
  }

  const { kind, source_url } = item;

  if (typeof kind !== "string" || !isCultureKind(kind)) {
    throw new Error(`cultures[${index}] の kind が CULTURE_KINDS に無い`);
  }

  const draft: CultureDraft = {
    kind,
    topic: parseText(item, "topic", index),
    body: parseText(item, "body", index),
    created_by: "auto",
  };

  if (source_url === undefined || source_url === null) {
    return draft;
  }

  if (typeof source_url !== "string") {
    throw new Error(`cultures[${index}] の source_url が文字列でない`);
  }

  return { ...draft, source_url };
}

/**
 * 応答本文の `cultures` の `index` 番目 `item` から、`key` の値を空でない文字列として返す。
 * 値が文字列でないか、空白だけなら throw する。
 */
function parseText(
  item: Record<string, unknown>,
  key: "topic" | "body",
  index: number,
): string {
  const value = item[key];

  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`cultures[${index}] の ${key} が空か文字列でない`);
  }

  return value;
}

/** 外部の材料の件数 `count` が上限 `limit` を超えていれば、件数の違反を一件返す。 */
function tooManyExternalViolations(
  count: number,
  limit: number,
): CultureViolation[] {
  if (count <= limit) {
    return [];
  }

  return [{ rule: "tooManyExternal", count, limit }];
}

/**
 * 外部の材料 `externals` を `topic` ごとに数え、`MIN_EXTERNAL_PER_TOPIC` 件に満たない論点の違反を、論点が最初に現れた順で返す。
 *
 * 立場が本当に違うかは読まないと判定できないので、ここでは件数だけを見る。
 */
function unpairedTopicViolations(
  externals: readonly CultureDraft[],
): CultureViolation[] {
  const topics = [...new Set(externals.map((draft) => draft.topic))];

  return topics
    .map((topic) => ({
      topic,
      count: externals.filter((draft) => draft.topic === topic).length,
    }))
    .filter(({ count }) => count < MIN_EXTERNAL_PER_TOPIC)
    .map(
      ({ topic, count }): CultureViolation => ({
        rule: "unpairedTopic",
        topic,
        count,
      }),
    );
}

/**
 * `drafts` のうち、出典が `searchResultUrls` に含まれない外部の材料の違反を、`drafts` の中の位置つきで返す。
 *
 * 検索結果に無い URL は AI が作った出典でありうるので、実在の確認をこの一覧との一致で代える。
 */
function unlistedSourceViolations(
  drafts: readonly CultureDraft[],
  searchResultUrls: readonly string[],
): CultureViolation[] {
  const listed = new Set(searchResultUrls);

  return drafts
    .map((draft, index) => ({ draft, index }))
    .filter(
      ({ draft }) =>
        draft.kind === "external" &&
        (draft.source_url === undefined || !listed.has(draft.source_url)),
    )
    .map(
      ({ draft, index }): CultureViolation => ({
        rule: "unlistedSource",
        index,
        source_url: draft.source_url,
      }),
    );
}
