/**
 * AI 呼び出しの規約（サーバー側のみ）。
 * どのプロバイダにも共通する形だけを持ち、固有の値域と API の作法はプロバイダ側のモジュールが持つ。
 *
 * 設定は `provider` で判別するユニオンで、プロバイダを足すときはここへ一項足して分岐の網羅性検査に拾わせる。
 *
 * env を読まない。
 * 設定は呼び出し側が解決して渡す（config.ts が env から作る）。
 */

import { type AnthropicSettings, callAnthropic } from "@/lib/ai/anthropic";
import type { PersonaId } from "@/lib/personas";
import type { Speaker } from "@/lib/types";

/** 一回の呼び出しに効く設定。 */
export type AiSettings = AnthropicSettings;

/**
 * ペルソナ一体を呼ぶときの指定。
 *
 * どの体か（id）・何を渡すか（prompt）と、どのプロバイダをどう叩くか（settings）を一つの値にまとめる。
 * 識別子を prompt から復元しない。
 * ペルソナ定義の見出しに依存すると、見出しを変えた回に黙って壊れる。
 */
export type PersonaCall = {
  readonly id: PersonaId;
  readonly prompt: string;
  readonly settings: AiSettings;
};

/**
 * 原型と現在の形を両方渡す。
 * 片方だけでは、問いが移った先を見失うか、原型からのずれを検出できないかのどちらかになる（ARCHITECTURE.md「原型と現在の形」）。
 */
export type QuestionRef = { body: string; current_form?: string | null };

/**
 * ペルソナ一体を呼んで発話本文を返す。
 * transcript はここまでの全発話で、呼ぶ側が順序を保証する。
 * 失敗の仕方はプロバイダ側の実装が決める。
 */
export async function callPersona(
  call: PersonaCall,
  question: QuestionRef,
  transcript: { speaker: Speaker; body: string }[],
): Promise<string> {
  const { settings } = call;

  switch (settings.provider) {
    case "anthropic":
      return callAnthropic({ ...call, settings }, question, transcript);
  }
}
