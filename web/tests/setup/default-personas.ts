/**
 * 既定の二体の最新の版の id を、AI の発話を書くテストへ渡す関数を置く。
 *
 * AI の発話は版を指すので、発話を書くテストは先に版の id を取得する。
 * 版は前準備（`truncate.ts`）がケースごとに同期しているので、`beforeEach` の中で呼ぶ。
 */

import { getLatestDefaultPersonaConfig } from "@/lib/db";
import type { DefaultPersonaKey } from "@/lib/personas";

/**
 * 既定の二体それぞれの、最新の版の id を返す。
 * どちらかに版が無ければ throw する。
 */
export async function getDefaultPersonaConfigIds(): Promise<
  Record<DefaultPersonaKey, string>
> {
  const concrete = await getLatestDefaultPersonaConfig("concrete");
  const abstract = await getLatestDefaultPersonaConfig("abstract");
  if (!concrete || !abstract) {
    throw new Error("既定のペルソナの版が無い。前準備の同期を確かめる");
  }

  return { concrete: concrete.id, abstract: abstract.id };
}
