"use client";

/**
 * 発話本文の描画と、選択した範囲へメモを付ける小フォーム。
 *
 * オフセットの換算は anchors.ts の純関数だけが行う。
 * ここが引き受けるのは DOM から（セグメント, セグメント内オフセット）を読むところまでで、絶対オフセットを求める式をこのファイルへ書かない。
 * 書いた時点で、テストの外にオフセット演算が増える。
 *
 * 複数の発話へ跨る選択は捨てる。
 * メモのアンカーは発話一件の本文へ閉じており、跨いだ範囲を一件では表せない。
 *
 * 下線の掛かった区間は `/memos?memo=<id>` へのリンクにする。
 * 逆向き（メモ → 発話）は /memos が持っているので、こちらは発話 → メモを埋める側。
 */

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  clampToGraphemeBoundary,
  type Segment,
  segmentBody,
} from "@/lib/anchors";
import type { Memo, Message } from "@/lib/types";

/** メモが掛かっている区間の装飾。 */
const MARKED_STYLE =
  "underline decoration-2 decoration-amber-500 underline-offset-4";

/** 選択した範囲とメモの小フォームの間に置く隙間（px）。 */
const FORM_GAP = 8;

/**
 * 選択を読み直す発話の登録簿。
 *
 * document へのリスナを画面に 1 本だけ張るために、React の外へ置く。
 * 鍵が本文の要素そのものなので、開発時に effect が二度走っても同じ発話が二重に載らない。
 */
const readers = new Map<Element, () => void>();

/**
 * メモの小フォームを出す位置。
 *
 * 本文の枠を基準にした絶対配置の指定で、選択の下へ出すときは上辺を、上へ出すときは下辺を押さえる。
 */
type DraftPlacement = { top: number } | { bottom: number };

/** 選択が確定してから、メモとして送られるまでの下書き。 */
type MemoDraft = {
  anchorStart: number;
  anchorEnd: number;
  keyword: string;
  placement: DraftPlacement;
};

/**
 * 発話本文。
 * メモの掛かった区間へ下線を引き、選択からメモを作る。
 */
export function MessageBody({
  message,
  memos,
  action,
}: {
  message: Message;
  memos: Memo[];
  action: (formData: FormData) => Promise<void>;
}) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<MemoDraft | null>(null);

  // useMemo を通すのは、これが下の useEffect の依存だから。
  // 素で呼ぶとレンダリングのたびに新しい配列になり、選択のたびに listener を外して張り直すことになる。
  const segments = useMemo(
    () => segmentBody(message.body, memos),
    [message.body, memos],
  );

  /**
   * この発話を登録簿へ載せ、自分宛ての選択で下書きを立てる。
   *
   * 読み取れない選択で下書きを消さないのは、開いているフォームが選択の解除で畳まれるため。
   */
  useEffect(() => {
    const container = bodyRef.current;
    if (!container) {
      return;
    }

    return subscribeSelection(container, () => {
      const selected = draftFromSelection(message.body, segments, container);

      if (selected) {
        setDraft(selected);
      }
    });
  }, [message.body, segments]);

  // 枠を relative にするのは、フォームを選択の近くへ絶対配置する基準がここになるため。
  return (
    <div className="relative">
      <div
        ref={bodyRef}
        data-message-body=""
        className="whitespace-pre-wrap leading-relaxed"
      >
        {segments.map((segment, index) => (
          <SegmentText
            key={segment.start}
            segment={segment}
            index={index}
            memos={memos}
          />
        ))}
      </div>

      {draft && (
        <MemoForm
          key={`${draft.anchorStart}-${draft.anchorEnd}`}
          messageId={message.id}
          draft={draft}
          action={action}
          onClose={() => setDraft(null)}
        />
      )}
    </div>
  );
}

/**
 * セグメント一つ分の描画。
 *
 * メモが掛かっていればメモ一覧の当該メモへのリンクにし、掛かっていなければただの span。
 * 重なっている区間はいちばん古いメモへ繋ぐ（重なりの描き分けは別 issue）。
 *
 * draggable を切るのは、下線の内側から選択を始めたときにリンクのドラッグが起きるのを防ぐため。
 * 既にメモの付いた区間へ重ねてメモを作る経路が塞がる。
 */
function SegmentText({
  segment,
  index,
  memos,
}: {
  segment: Segment;
  index: number;
  memos: Memo[];
}) {
  const [firstMemoId] = segment.memoIds;

  if (!firstMemoId) {
    return <span data-segment-index={index}>{segment.text}</span>;
  }

  return (
    <Link
      href={`/memos?memo=${firstMemoId}`}
      data-segment-index={index}
      title={memoHint(segment, memos)}
      draggable={false}
      className={MARKED_STYLE}
    >
      {segment.text}
    </Link>
  );
}

/**
 * メモの小フォーム。
 *
 * キーワードは選択した文字列そのものなので、引用として見せるだけで入力欄にしない。
 * 触れる形にすると、下線の位置と語が食い違ったメモを作れてしまう。
 * 送るのは hidden で、書き手が埋めるのはノートだけ。
 *
 * iOS Safari は 16px 未満の入力欄へフォーカスすると自動でズームして書き手が選んだ倍率を捨てるので、ノートの入力欄だけ周りの 14px（`text-sm`）へ揃えず 16px（`text-base`）を敷く。
 *
 * 置き場は選んだ語の近くで、本文の枠を基準に絶対配置する。
 * 本文の後ろへ流し込む形にすると、発話が長いときに選んだ位置とフォームが画面一枚分ほど離れ、メモを作れること自体に気付けない。
 * 左右を枠いっぱいに広げるのは、横位置を計算せずに画面端の溢れを避けるため。
 */
function MemoForm({
  messageId,
  draft,
  action,
  onClose,
}: {
  messageId: string;
  draft: MemoDraft;
  action: (formData: FormData) => Promise<void>;
  onClose: () => void;
}) {
  return (
    <form
      action={async (formData) => {
        await action(formData);
        onClose();
      }}
      style={draft.placement}
      className="absolute inset-x-0 z-10 flex flex-col gap-2 rounded border border-neutral-300 bg-white p-3 shadow-lg"
    >
      <input type="hidden" name="message_id" value={messageId} />
      <input type="hidden" name="anchor_start" value={draft.anchorStart} />
      <input type="hidden" name="anchor_end" value={draft.anchorEnd} />
      <input type="hidden" name="keyword" value={draft.keyword} />

      <blockquote className="border-l-2 border-neutral-400 pl-3 text-sm text-neutral-600">
        {draft.keyword}
      </blockquote>

      <input
        name="note"
        aria-label="メモ"
        placeholder="なぜ引っかかったか（任意）"
        className="w-full rounded border border-neutral-300 px-2 py-1 text-base"
      />

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded px-3 py-1 text-sm text-neutral-500 hover:underline"
        >
          やめる
        </button>
        <button
          type="submit"
          className="rounded bg-neutral-800 px-3 py-1 text-sm text-white hover:bg-neutral-700"
        >
          メモする
        </button>
      </div>
    </form>
  );
}

/**
 * 発話を登録簿へ載せ、外し方を返す。
 *
 * document のリスナは登録簿が空でなくなったときに張り、空に戻ったときに外す。
 * 本文の途中から下へドラッグして選ぶとボタンを離す位置が本文の枠の外になるので、リスナは document に置く。
 * 本文の div へ onMouseUp を付けると、React のハンドラは自分の部分木の外で起きた mouseup を受け取らないので、枠の外で離した選択が丸ごと取れない。
 * 静的な div へマウスのハンドラを付けること自体も biome が止める（a11y/noStaticElementInteractions）。
 * keyup も見るのは、shift + 矢印で伸ばした選択を落とさないため。
 *
 * iOS は選択のジェスチャの終わりに mouseup を撃たないので、touchend も見る。
 * 長押しから選択ハンドルを動かして離す一連は touchend で終わり、mouseup はそこに来ない。
 * mouseup が来るのはただのタップのときだけで、その時点では選択が既に潰れている。
 * pointerup を採らないのは、同じ実機で touchend が来た回のうち半分ほどしか来なかったため。
 */
function subscribeSelection(container: Element, read: () => void): () => void {
  if (readers.size === 0) {
    document.addEventListener("mouseup", notifySelectedMessage);
    document.addEventListener("touchend", notifySelectedMessage);
    document.addEventListener("keyup", notifySelectedMessage);
  }

  readers.set(container, read);

  return () => {
    readers.delete(container);

    if (readers.size === 0) {
      document.removeEventListener("mouseup", notifySelectedMessage);
      document.removeEventListener("touchend", notifySelectedMessage);
      document.removeEventListener("keyup", notifySelectedMessage);
    }
  };
}

/**
 * 選択の始点が入っている発話の read だけを呼ぶ。
 *
 * 始点のノードから closest で本文の div まで遡り、その div を鍵に登録簿を引く。
 * 発話を跨ぐ選択でも呼ぶのは始点側の 1 本で、終点が自分の本文の外にあることは呼ばれた側の draftFromSelection が見て、下書きを立てずに終わる。
 * 潰れた選択をここで返すのは、キャレットが動いただけの keyup で登録簿まで引かないため。
 */
function notifySelectedMessage(): void {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed) {
    return;
  }

  const container = elementOf(selection.getRangeAt(0).startContainer)?.closest(
    "[data-message-body]",
  );

  if (container) {
    readers.get(container)?.();
  }
}

/**
 * いまの選択範囲から下書きを作る。
 *
 * 選択が無い・潰れている・この発話の外へ出ているときは undefined。
 * 書記素境界への丸めで潰れた範囲も捨てる（絵文字の内側だけを選んだ場合）。
 */
function draftFromSelection(
  body: string,
  segments: Segment[],
  container: Element,
): MemoDraft | undefined {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed) {
    return undefined;
  }

  const range = selection.getRangeAt(0);
  if (
    !container.contains(range.startContainer) ||
    !container.contains(range.endContainer)
  ) {
    return undefined;
  }

  const start = absoluteOffsetOf(
    segments,
    range.startContainer,
    range.startOffset,
  );
  const end = absoluteOffsetOf(segments, range.endContainer, range.endOffset);
  if (start === undefined || end === undefined) {
    return undefined;
  }

  const anchorStart = clampToGraphemeBoundary(body, start);
  const anchorEnd = clampToGraphemeBoundary(body, end);
  if (anchorEnd <= anchorStart) {
    return undefined;
  }

  return {
    anchorStart,
    anchorEnd,
    keyword: body.slice(anchorStart, anchorEnd),
    placement: placementOf(
      range.getBoundingClientRect(),
      container.getBoundingClientRect(),
    ),
  };
}

/**
 * 選択の矩形から、フォームを出す辺と本文の枠のその辺からの距離を決める。
 *
 * 選んだ語そのものを覆うと何に対するメモか見えなくなるので、返すのは矩形の外側へ隙間を足した位置。
 * 下の余白が上より狭いときに上側へ出すのは、画面の下端に近いところで選ぶとフォームが視界の外へ落ちるため。
 * 上側へ出すときに上辺でなく下辺を押さえるのは、まだ描いていないフォームの高さを測れないため。
 */
function placementOf(selected: DOMRect, container: DOMRect): DraftPlacement {
  const spaceBelow = window.innerHeight - selected.bottom;

  if (spaceBelow < selected.top) {
    return { bottom: container.bottom - selected.top + FORM_GAP };
  }

  return { top: selected.bottom - container.top + FORM_GAP };
}

/**
 * Range の端点を本文先頭基準の絶対オフセットへ換算する。
 *
 * 換算そのものは Segment#absoluteOffset が持つ。
 * 端点がどのセグメントにも属さなければ undefined。
 */
function absoluteOffsetOf(
  segments: Segment[],
  container: Node,
  offset: number,
): number | undefined {
  const index = segmentIndexOf(container);
  const segment = index === undefined ? undefined : segments[index];

  if (!segment) {
    return undefined;
  }

  return segment.absoluteOffset(offsetInSegment(segment, container, offset));
}

/** 端点が居るセグメントの添字を data 属性から読む。 */
function segmentIndexOf(container: Node): number | undefined {
  const index = elementOf(container)
    ?.closest("[data-segment-index]")
    ?.getAttribute("data-segment-index");

  return index ? Number(index) : undefined;
}

/**
 * ノードに対応する要素を返す。
 *
 * Range の端点は text node で来ることがあり、closest は Element のメソッドなので直接は呼べない。
 * text node のときは親の要素を返す。
 */
function elementOf(node: Node): Element | null {
  return node instanceof Element ? node : node.parentElement;
}

/**
 * Range の端点をセグメント内の文字オフセットへ読み替える。
 *
 * 端点が text node なら offset はそのまま文字数。
 * span ごと含む選択では端点が要素側へ落ち、offset は子ノードの位置になるので、先頭なら 0、それ以外はセグメントの末尾とみなす。
 */
function offsetInSegment(
  segment: Segment,
  container: Node,
  offset: number,
): number {
  if (container.nodeType === Node.TEXT_NODE) {
    return offset;
  }

  return offset === 0 ? 0 : segment.text.length;
}

/**
 * 区間に掛かっているメモを、hover で覗ける一つの文字列へ畳む。
 * 掛かっていなければ undefined（title 属性ごと出さない）。
 */
function memoHint(segment: Segment, memos: Memo[]): string | undefined {
  const covering = memos.filter((memo) => segment.memoIds.includes(memo.id));

  if (covering.length === 0) {
    return undefined;
  }

  return covering
    .map((memo) => (memo.note ? `${memo.keyword}: ${memo.note}` : memo.keyword))
    .join("\n");
}
