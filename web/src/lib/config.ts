/**
 * 環境変数から作る設定。
 *
 * env を読むのはこのモジュールだけで、既定値もここが決める（HARNESS.md「テスト可能性の設計制約」2）。
 * 他のモジュールは解決済みの値を参照し、呼び出しごとに変わりうる値は引数で受け取る。
 *
 * アプリが使うのは解決済みの定数（`DATABASE_URL` / `AI_SETTINGS` / `PERSONA_EFFORT`）。
 * `read*` の二つは env から値への写像そのものをテストへ開く口で、アプリの経路からは呼ばない。
 *
 * 変数の名前と既定値の正は web/README.md の表。
 */

import { EFFORT, type Effort, toEffort } from "@/lib/effort";
import type { PersonaRole } from "@/lib/personas";

/**
 * Claude API の呼び出しに効く環境変数。
 * `process.env` をそのまま渡せるよう、宣言した以外のキーも通す。
 */
type AiEnv = {
  readonly TOIITO_MODEL?: string;
  readonly TOIITO_MAX_TOKENS?: string;
  readonly TOIITO_FAKE_AI?: string;
  readonly ANTHROPIC_API_KEY?: string;
  readonly [key: string]: string | undefined;
};

/** 系統ごとの思考の深さに効く環境変数。 */
type EffortEnv = {
  readonly TOIITO_EFFORT_CONCRETE?: string;
  readonly TOIITO_EFFORT_ABSTRACT?: string;
  readonly [key: string]: string | undefined;
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
 * 系統ごとの思考の深さの既定。
 *
 * 深さは個体でなく系統の性質なので、キーは `PersonaId` でなく `PersonaRole`。
 * 抽象系は構造を取り出して材料を添える役で thinking が膨らみやすいので、一段落とす。
 * undefined は API の既定（high）で走らせるという指定。
 */
const DEFAULT_EFFORT: Record<PersonaRole, Effort | undefined> = {
  concrete: undefined,
  abstract: EFFORT.medium,
};

/**
 * env が欠けているときに倒れる先。
 *
 * 既定値の綴りをここ一箇所に集める。
 * モデルを変えるたびに散らばった文字列を追う形にしないためで、テストもここを引く。
 */
export const AI_DEFAULTS = {
  model: "claude-sonnet-5",
  maxTokens: 16000,
  effort: DEFAULT_EFFORT,
} as const;

/**
 * env から Claude API の設定を読む。
 * 数として読めない値（未設定・空・非数）は既定へ倒す。
 */
export function readAiSettings(env: AiEnv): AiSettings {
  return {
    model: env.TOIITO_MODEL ?? AI_DEFAULTS.model,
    maxTokens: Number(env.TOIITO_MAX_TOKENS) || AI_DEFAULTS.maxTokens,
    fake: env.TOIITO_FAKE_AI === "1",
    apiKey: env.ANTHROPIC_API_KEY,
  };
}

/**
 * env から系統ごとの思考の深さを読む。
 * 値域の外（未設定・綴り違い）は既定へ倒す。
 */
export function readPersonaEffort(
  env: EffortEnv,
): Record<PersonaRole, Effort | undefined> {
  return {
    concrete:
      toEffort(env.TOIITO_EFFORT_CONCRETE) ?? AI_DEFAULTS.effort.concrete,
    abstract:
      toEffort(env.TOIITO_EFFORT_ABSTRACT) ?? AI_DEFAULTS.effort.abstract,
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
export const AI_SETTINGS = readAiSettings(process.env);

/** 解決済みの、系統ごとの思考の深さ。 */
export const PERSONA_EFFORT = readPersonaEffort(process.env);
