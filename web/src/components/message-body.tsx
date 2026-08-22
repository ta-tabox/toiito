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
import { useEffect, useRef, useState } from "react";
import {
  clampToGraphemeBoundary,
  type Segment,
  segmentBody,
} from "@/lib/anchors";
import type { Memo, Message } from "@/lib/types";

/** メモが掛かっている区間の装飾。 */
const MARKED_STYLE =
  "underline decoration-2 decoration-amber-500 underline-offset-4";

/** 選択が確定してから、メモとして送られるまでの下書き。 */
type MemoDraft = {
  anchorStart: number;
  anchorEnd: number;
  keyword: string;
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
  const segments = segmentBody(message.body, memos);

  /**
   * 選択の確定を拾って下書きを立てる。
   *
   * 下へ払って選ぶと手を離す位置が本文の外になるので、listener は document に置く。
   * 本文の div に付けると払った分の選択を落とすうえ、静的な要素へ対話を持たせることになる（biome の a11y）。
   * keyup も見るのは shift + 矢印による選択を落とさないため。
   * 読み取れない選択で下書きを消さないのは、開いているフォームが選択の解除で畳まれるため。
   */
  useEffect(() => {
    function readSelection() {
      const selected = draftFromSelection(
        message.body,
        segments,
        bodyRef.current,
      );

      if (selected) {
        setDraft(selected);
      }
    }

    document.addEventListener("mouseup", readSelection);
    document.addEventListener("keyup", readSelection);

    return () => {
      document.removeEventListener("mouseup", readSelection);
      document.removeEventListener("keyup", readSelection);
    };
  }, [message.body, segments]);

  return (
    <>
      <div ref={bodyRef} className="whitespace-pre-wrap leading-relaxed">
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
    </>
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
 * キーワードは選択文字列で固定し、書き換えさせない。
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
      className="mt-3 flex flex-col gap-2 rounded border border-neutral-300 bg-white p-3"
    >
      <input type="hidden" name="message_id" value={messageId} />
      <input type="hidden" name="anchor_start" value={draft.anchorStart} />
      <input type="hidden" name="anchor_end" value={draft.anchorEnd} />

      {/* キーワードはアンカーが指す文字列そのもの。
          書き換えられると、下線の位置と語が食い違ったメモが残る。 */}
      <input
        name="keyword"
        aria-label="キーワード"
        value={draft.keyword}
        readOnly
        className="w-full rounded border border-neutral-200 bg-neutral-50 px-2 py-1 text-sm text-neutral-600"
      />
      <input
        name="note"
        aria-label="メモ"
        placeholder="なぜ引っかかったか（任意）"
        className="w-full rounded border border-neutral-300 px-2 py-1 text-sm"
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
 * いまの選択範囲から下書きを作る。
 *
 * 選択が無い・潰れている・この発話の外へ出ているときは undefined。
 * 書記素境界への丸めで潰れた範囲も捨てる（絵文字の内側だけを選んだ場合）。
 */
function draftFromSelection(
  body: string,
  segments: Segment[],
  container: HTMLElement | null,
): MemoDraft | undefined {
  const selection = window.getSelection();
  if (!container || !selection || selection.isCollapsed) {
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
  };
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
  const element =
    container instanceof Element ? container : container.parentElement;
  const index = element
    ?.closest("[data-segment-index]")
    ?.getAttribute("data-segment-index");

  return index ? Number(index) : undefined;
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
