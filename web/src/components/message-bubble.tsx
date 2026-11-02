/**
 * 対話画面の発話一つを、話者ごとの吹き出しと発話者の名前のラベルで包んで描く部品を置く。
 * 本文とメモの描画は持たず、`MessageBody` が持つ。
 *
 * 三者は同じ幅で並べ、違いは背景色と角丸の位置だけに置く（`.claude/rules/design.md`「話者の描き分け」）。
 * AI の吹き出しは、発話を書いた版の抽象度が `level_3` 以下なら暖、`level_4` 以上なら寒にする。
 */

import type { ReactNode } from "react";
import type { PersonaAxisLevel } from "@/lib/personas";
import type { UtteranceSpeaker } from "@/lib/types";

/** AI の吹き出しを暖にする、抽象度の段階。 */
const WARM_LEVELS: ReadonlySet<PersonaAxisLevel> = new Set([
  "level_1",
  "level_2",
  "level_3",
]);

/** 発話者（`speaker`）の吹き出しの class を、人間か、AI ならそれを書いた版の抽象度から決める。 */
function bubbleClassOf(speaker: UtteranceSpeaker): string {
  if (speaker.speaker === "human") {
    return "rounded-bubble rounded-tr-notch bg-moss-surface";
  }

  return WARM_LEVELS.has(speaker.persona.abstraction)
    ? "rounded-bubble rounded-tl-notch bg-surface-warm"
    : "rounded-bubble border border-rule bg-surface-cool";
}

/**
 * 発話者（`speaker`）の吹き出しで `children` を包み、上に発話者の名前を出す。
 * 名前は人間なら「あなた」、AI なら版の呼び名で、背景色は周辺視の手掛かりでしかないので名前の表示は消さない。
 */
export function MessageBubble({
  id,
  speaker,
  children,
}: {
  id: string;
  speaker: UtteranceSpeaker;
  children: ReactNode;
}) {
  const isHuman = speaker.speaker === "human";

  return (
    <div id={id} className={`p-3 md:p-4 ${bubbleClassOf(speaker)}`}>
      <div
        className={`mb-2 text-meta text-ink-weak ${isHuman ? "text-right" : ""}`}
      >
        {isHuman ? "あなた" : speaker.persona.name}
      </div>
      {children}
    </div>
  );
}
