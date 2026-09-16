/**
 * AI の呼び出し一回分の利用量（`usage_logs` の行）が持つ、呼び出しの種別と API キーの出所の取りうる値を置く。
 * 行の読み書きは持たず、`db.ts` が持つ。
 */

/**
 * AI の呼び出しの種別。
 *
 * - `persona`: ペルソナ一体の発話を作る呼び出し
 * - `material`: 問いに付随する材料を作る呼び出し
 *
 * DB の enum `AiCallKind`（`prisma/schema.prisma`）と同じ並びなので、この配列に値を足したら enum にも足す。
 */
export const AI_CALL_KINDS = ["persona", "material"] as const;

export type AiCallKind = (typeof AI_CALL_KINDS)[number];

/**
 * AI の呼び出しに使った API キーの出所。
 *
 * - `operator`: 運営が持つキー
 * - `user`: 利用者が登録したキー
 *
 * DB の enum `ApiKeySource`（`prisma/schema.prisma`）と同じ並びなので、この配列に値を足したら enum にも足す。
 */
export const API_KEY_SOURCES = ["operator", "user"] as const;

export type ApiKeySource = (typeof API_KEY_SOURCES)[number];
