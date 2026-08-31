/**
 * AI 呼び出しの規約と、一回の呼び出しの手順（サーバー側のみ）。
 *
 * プロバイダに依らない決め事——フェイクモード・呼び出しの記録・欠けた本文を返さないこと——をここが持ち、固有の設定と API の作法はプロバイダ側のモジュールが持つ。
 * 設定は `provider` で判別するユニオンで、プロバイダを足すときは `send` の分岐へ一項足して網羅性検査に拾わせる。
 *
 * env を読まない。
 * 設定は呼び出し側が解決して渡す（config.ts が env から作る）。
 */

import { type AnthropicSettings, sendToAnthropic } from "@/lib/ai/anthropic";
import { buildUserContent } from "@/lib/ai/prompt";
import type { PersonaId } from "@/lib/personas";
import type { Speaker } from "@/lib/types";

/**
 * どのプロバイダの設定も持つ欄。
 * ここに挙げた三つは、プロバイダを選ぶ前にこの層が読む。
 */
export type CommonSettings = {
  readonly model: string;

  /**
   * 一回の応答に許すトークン数。
   *
   * thinking のトークンもここから引かれるので、本文の想定長で見積もると足りない。
   * 足りなければ本文が途中で切れるか、本文ごと出てこない。
   * ストリーミングを使っていないため、上限は HTTP のタイムアウトに収まる範囲で選ぶ。
   */
  readonly maxTokens: number;

  /** ネットワークに出ず決定的な応答を返すか（HARNESS.md 参照）。 */
  readonly fake: boolean;
};

/** 一回の呼び出しに効く設定。 */
export type AiSettings = AnthropicSettings;

/** ここまでの全発話。 */
export type Transcript = { speaker: Speaker; body: string }[];

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
 * プロバイダが返す一回分の応答。
 *
 * 打ち切りの綴りはプロバイダごとに違うので、判定を済ませた `truncated` で受け取る。
 * `stopReason` は記録のためだけに通す生の値。
 */
export type ProviderResponse = {
  readonly body: string;
  readonly stopReason: string | null;
  readonly inputTokens: number | null;
  readonly outputTokens: number | null;
  readonly truncated: boolean;
};

/**
 * 一回の呼び出しの結果を 1 行の JSON で残す。
 *
 * 発話本文は出さない。
 * 投入される問いは機微な出自を含みうるので、外へ渡すのは打ち切りの検出に足りる長さだけにする。
 * 応答を受け取った直後に呼ぶので、この後で例外になった呼び出しも 1 行残る。
 */
function logCall(fields: {
  provider: string;
  model: string;
  persona: PersonaId;
  stop_reason: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  duration_ms: number;
  body_length: number;
}): void {
  console.log(JSON.stringify({ event: "ai_call", ...fields }));
}

/**
 * ハーネス用フェイクモード（HARNESS.md 参照）。
 * ネットワークに出ず決定的応答を返す。
 * ペルソナ ID と直近の人間発話を含めることで、E2E 側から「どの体が・何を受けて」応答したかをアサート可能にする。
 */
function fakeResponse(id: PersonaId, transcript: Transcript): string {
  const lastHuman = [...transcript]
    .reverse()
    .find((m) => m.speaker === "human");
  return `[fake:${id}] 「${lastHuman?.body ?? "(発話なし)"}」への応答`;
}

/**
 * 設定が名乗るプロバイダへ送る。
 * ここが唯一の分岐で、プロバイダを足すと網羅性検査が漏れを指す。
 */
function send(
  settings: AiSettings,
  system: string,
  userContent: string,
): Promise<ProviderResponse> {
  switch (settings.provider) {
    case "anthropic":
      return sendToAnthropic(settings, system, userContent);
  }
}

/**
 * ペルソナ一体を呼んで発話本文を返す。
 * settings.fake が立っているときはネットワークに出ない。
 * transcript はここまでの全発話で、呼ぶ側が順序を保証する。
 * 応答が打ち切られたときと本文が空のときは例外を投げる（欠けた本文を返さない）。
 */
export async function callPersona(
  call: PersonaCall,
  question: QuestionRef,
  transcript: Transcript,
): Promise<string> {
  const { settings } = call;

  if (settings.fake) {
    return fakeResponse(call.id, transcript);
  }

  const startedAt = Date.now();
  const response = await send(
    settings,
    call.prompt,
    buildUserContent(question, transcript),
  );

  logCall({
    provider: settings.provider,
    model: settings.model,
    persona: call.id,
    stop_reason: response.stopReason,
    input_tokens: response.inputTokens,
    output_tokens: response.outputTokens,
    duration_ms: Date.now() - startedAt,
    body_length: response.body.length,
  });

  // 切れた本文を messages へ入れると、immutable なので後から直せない。
  if (response.truncated) {
    throw new Error(
      `${settings.provider} の応答が maxTokens (${settings.maxTokens}) で打ち切られた`,
    );
  }

  // thinking だけで応答が終わると本文が一文字も来ない。
  if (!response.body) {
    throw new Error(`${settings.provider} の応答に本文が無い`);
  }

  return response.body;
}
