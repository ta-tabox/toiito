/**
 * 環境変数から作る設定。
 *
 * env を読むのはこのモジュールだけで、既定値もここが決める（HARNESS.md「テスト可能性の設計制約」2）。
 * 他のモジュールは解決済みの値を参照し、呼び出しごとに変わりうる値は引数で受け取る。
 * env から値への写像は純関数へ分けてある。
 * process.env を書き換えずに読み方そのものを検査できる形にするため。
 *
 * 変数の名前と既定値の正は web/README.md の表。
 */

import { type Effort, toEffort } from "@/lib/effort";
import type { PersonaRole } from "@/lib/personas";

/** Claude API の呼び出しに効く環境変数。 */
type AiEnv = {
  readonly TOIITO_MODEL?: string;
  readonly TOIITO_MAX_TOKENS?: string;
  readonly TOIITO_FAKE_AI?: string;
  readonly ANTHROPIC_API_KEY?: string;
};

/** 系統ごとの思考の深さに効く環境変数。 */
type EffortEnv = {
  readonly TOIITO_EFFORT_CONCRETE?: string;
  readonly TOIITO_EFFORT_ABSTRACT?: string;
};

/** Claude API を一回叩くときの設定。 */
export type AiSettings = {
  readonly model: string;

  /**
   * 一回の応答に許すトークン数。
   *
   * thinking のトークンもここから引かれるので、本文の想定長で見積もると足りない。
   * 足りなければ本文が途中で切れるか、text ブロックごと出てこない。
   * ストリーミングを使っていないため、上限は HTTP のタイムアウトに収まる範囲で選ぶ。
   */
  readonly maxTokens: number;

  /** ネットワークに出ず決定的な応答を返すか（HARNESS.md 参照）。 */
  readonly fake: boolean;

  /** Claude API のキー。 */
  readonly apiKey?: string;
};

/**
 * env から Claude API の設定を読む。
 * 数として読めない値（未設定・空・非数）は既定へ倒す。
 */
export function readAiSettings(env: AiEnv): AiSettings {
  return {
    model: env.TOIITO_MODEL ?? "claude-sonnet-5",
    maxTokens: Number(env.TOIITO_MAX_TOKENS) || 16000,
    fake: env.TOIITO_FAKE_AI === "1",
    apiKey: env.ANTHROPIC_API_KEY,
  };
}

/**
 * env から系統ごとの思考の深さを読む。
 *
 * 深さは個体でなく系統の性質なので、キーは `PersonaId` でなく `PersonaRole`。
 * 抽象系は構造を取り出して材料を添える役で thinking が膨らみやすいので、一段落とす。
 * undefined は API の既定（high）で走らせるという指定。
 * 値域の外（綴り違い）は既定へ倒す。
 */
export function readPersonaEffort(
  env: EffortEnv,
): Record<PersonaRole, Effort | undefined> {
  return {
    concrete: toEffort(env.TOIITO_EFFORT_CONCRETE),
    abstract: toEffort(env.TOIITO_EFFORT_ABSTRACT) ?? "medium",
  };
}

/**
 * アプリからの接続先。
 *
 * 未設定のまま残すのは、接続を張る側（db.ts）が文脈付きで落とせるようにするため。
 * ここで落とすと、DB を使わない経路まで巻き添えになる。
 */
export const DATABASE_URL = process.env.DATABASE_URL;

/** 解決済みの Claude API 設定。 */
export const AI_SETTINGS = readAiSettings({
  TOIITO_MODEL: process.env.TOIITO_MODEL,
  TOIITO_MAX_TOKENS: process.env.TOIITO_MAX_TOKENS,
  TOIITO_FAKE_AI: process.env.TOIITO_FAKE_AI,
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
});

/** 解決済みの、系統ごとの思考の深さ。 */
export const PERSONA_EFFORT = readPersonaEffort({
  TOIITO_EFFORT_CONCRETE: process.env.TOIITO_EFFORT_CONCRETE,
  TOIITO_EFFORT_ABSTRACT: process.env.TOIITO_EFFORT_ABSTRACT,
});
