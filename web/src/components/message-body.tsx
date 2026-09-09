"use client";

/**
 * 発話本文の描画と、選択した範囲へメモを付ける小フォーム。
 *
 * オフセットの換算は anchors.ts の純関数だけが行う。
 * `MessageBody` が引き受けるのは DOM から（セグメント, セグメント内オフセット）を読むところまでで、絶対オフセットを求める式をこのファイルへ書かない。
 * 書いた時点で、テストの外にオフセット演算が増える。
 *
 * 複数の発話へ跨る選択は捨てる。
 * メモのアンカーは発話一件の本文へ閉じており、跨いだ範囲を一件では表せない。
 *
 * 下線の付いた区間は、触れると覗き見の枠を開くだけで、それ自体はリンクにしない。
 * メモ一覧の当該メモへは枠の中のリンクから辿る（枠の中身と開閉は `memo-preview.tsx`）。
 * 逆向き（メモ → 発話）は /memos が持っているので、`MessageBody` は発話 → メモを埋める側。
 */

import {
  type KeyboardEvent,
  type ReactNode,
  type SyntheticEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  MemoPreviewLayer,
  openMemoPreview,
  PREVIEW_ID,
  scheduleMemoPreviewClose,
  useOpenMemoPreview,
} from "@/components/memo-preview";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import {
  clampToGraphemeBoundary,
  type Segment,
  segmentBody,
} from "@/lib/anchors";
import type { Memo, Message } from "@/lib/types";

/**
 * メモ一件ぶんの下線の装飾。
 *
 * 背景でなく下線で出すのは、彩度を持つ背景を人間の発話の一つに留めるため（`.claude/rules/design.md`「彩度の規律」）。
 * 画面の中で最も強い色が、自分で付けたメモになる。
 *
 * 触れていないあいだ琥珀を薄めるのは、読んでいる最中の下線が本文と競らないようにするため。
 */
const UNDERLINE_STYLE = "underline decoration-1";

/**
 * 下線の濃さ。
 *
 * 濃い側になるのは、いま開いている覗き見に出ているメモの下線だけである。
 * 区間ごとに当てると、同じ区間に重なっているだけで枠に出ていないメモの下線まで濃くなる。
 */
const UNDERLINE_TONE = {
  active: "decoration-mark",
  idle: "decoration-mark/40",
};

/** 一本目の下線と文字の間隔（px）。 */
const UNDERLINE_OFFSET = 4;

/** 二本目以降の下線を、一本手前の下線から離す距離（px）。 */
const UNDERLINE_SPACING = 3;

/** 発話一件ぶんの、選択の読み直しと下書きの取り消し。 */
type SelectionReader = {
  read: () => void;
  clear: () => void;
};

/**
 * 選択を読み直す発話のレジストリ。
 *
 * document へのリスナを画面に 1 本だけ張るために、React の外へ置く。
 * 鍵が本文の要素そのものなので、開発時に effect が二度走っても同じ発話が二重に載らない。
 */
const readers = new Map<Element, SelectionReader>();

/** 選択が確定してから、メモとして送られるまでの下書き。 */
type MemoDraft = {
  anchorStart: number;
  anchorEnd: number;
  keyword: string;
};

/**
 * 発話本文。
 * メモの付いた区間へ下線を引き、選択からメモを作る。
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

  // useMemo を通すのは、`segments` が下の useEffect の依存だから。
  // 素で呼ぶとレンダリングのたびに新しい配列になり、選択のたびに listener を外して張り直すことになる。
  const segments = useMemo(
    () => segmentBody(message.body, memos),
    [message.body, memos],
  );

  /**
   * この発話を `readers` へ登録し、自分宛ての選択で下書きを立てる。
   *
   * 読み取れない選択で下書きを消さないのは、開いているフォームが選択の解除で閉じてしまうため。
   */
  useEffect(() => {
    const container = bodyRef.current;
    if (!container) {
      return;
    }

    return subscribeSelection(container, {
      read: () => {
        const selected = draftFromSelection(message.body, segments, container);

        if (selected) {
          setDraft(selected);
        }
      },
      clear: () => setDraft(null),
    });
  }, [message.body, segments]);

  /**
   * 下書きを閉じ、選んだ範囲の色も消す。
   *
   * 色だけが残ると、まだ選択が続いているように見える。
   */
  const closeDraft = () => {
    setDraft(null);
    window.getSelection()?.removeAllRanges();
  };

  return (
    <>
      <div
        ref={bodyRef}
        data-message-body=""
        className="whitespace-pre-wrap text-utterance md:text-utterance-lg"
      >
        {segments.map((segment, index) => (
          <SegmentText
            key={segment.start}
            segment={segment}
            index={index}
            memos={memos}
            previewKey={`${message.id}:${segment.start}`}
          />
        ))}
      </div>

      {/* 下線を持つ発話だけが層を申し出て、画面に描かれるのはそのうちの一つだけである（`memo-preview.tsx`）。 */}
      {memos.length > 0 && <MemoPreviewLayer />}

      {/* body へ移すのは、祖先が containing block を作ると fixed の基準が画面でなくその祖先へ移るため。 */}
      {draft &&
        createPortal(
          <MemoForm
            key={`${draft.anchorStart}-${draft.anchorEnd}`}
            messageId={message.id}
            draft={draft}
            action={action}
            onClose={closeDraft}
          />,
          document.body,
        )}
    </>
  );
}

/**
 * セグメント一つ分の描画。
 *
 * メモが付いていれば、メモの数だけ下線を重ね、触れると覗き見の枠を開く区間にする。
 * 付いていなければただの span で、下線も覗き見も持たない。
 *
 * 区間を button 要素にしないのは、button が本文の折り返しに乗らないため。
 * `display: inline` を当てても行の途中で始まる区間を作れず、区間が独立した箱になって前後の文から切れる。
 */
function SegmentText({
  segment,
  index,
  memos,
  previewKey,
}: {
  segment: Segment;
  index: number;
  memos: Memo[];
  previewKey: string;
}) {
  const open = useOpenMemoPreview();
  const covering = memos.filter((memo) => segment.memoIds.includes(memo.id));
  const [firstMemo] = covering;

  if (!firstMemo) {
    return <span data-segment-index={index}>{segment.text}</span>;
  }

  const openMemoIds = open?.memos.map((memo) => memo.id) ?? [];

  /** この区間のメモを、区間の位置へ覗き見として開く。 */
  const showPreview = (event: SyntheticEvent<HTMLElement>) =>
    openMemoPreview(
      previewKey,
      covering,
      event.currentTarget.getBoundingClientRect(),
    );

  /**
   * Enter と Space で覗き見を開く。
   * 他のキーでは何もしない。
   */
  const showPreviewOnKey = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    event.preventDefault();
    showPreview(event);
  };

  /**
   * ポインタが離れたら閉じる。
   * フォーカスが残っているあいだは閉じない（キーボードで開いた覗き見が、マウスが通り過ぎただけで消える）。
   */
  const hidePreviewOnLeave = (event: SyntheticEvent<HTMLElement>) => {
    if (document.activeElement === event.currentTarget) {
      return;
    }

    scheduleMemoPreviewClose();
  };

  /**
   * フォーカスが外れたら閉じる。
   * ポインタが乗っているあいだは閉じない。
   */
  const hidePreviewOnBlur = (event: SyntheticEvent<HTMLElement>) => {
    if (event.currentTarget.matches(":hover")) {
      return;
    }

    scheduleMemoPreviewClose();
  };

  return (
    // biome-ignore lint/a11y/useSemanticElements: button 要素は本文の折り返しに乗らないので、行の途中から始まる区間には使えない。
    <span
      data-segment-index={index}
      role="button"
      tabIndex={0}
      aria-controls={PREVIEW_ID}
      aria-expanded={open?.key === previewKey}
      className="rounded-xs focus-visible:outline-2 focus-visible:outline-mark focus-visible:outline-offset-2"
      onMouseEnter={showPreview}
      onMouseLeave={hidePreviewOnLeave}
      onFocus={showPreview}
      onBlur={hidePreviewOnBlur}
      onClick={showPreview}
      onKeyDown={showPreviewOnKey}
    >
      {stackedUnderlines(segment.text, covering, openMemoIds)}
    </span>
  );
}

/**
 * 本文を、`covering` の一件につき一本の下線を重ねた入れ子の span で包む。
 * `openMemoIds` に居るメモの下線だけを濃く描く。
 *
 * 一本ずつ別の span が持つのは、`text-decoration` が一つの要素につき一本しか描かないため。
 * 入れ子にすると各 span の `text-underline-offset` の位置へ一本ずつ描かれ、折り返した行にも同じ本数が付く。
 */
function stackedUnderlines(
  text: string,
  covering: Memo[],
  openMemoIds: string[],
): ReactNode {
  let stacked: ReactNode = text;

  covering.forEach((memo, depth) => {
    const tone = openMemoIds.includes(memo.id)
      ? UNDERLINE_TONE.active
      : UNDERLINE_TONE.idle;

    stacked = (
      <span
        data-memo-underline=""
        className={`${UNDERLINE_STYLE} ${tone}`}
        style={{
          textUnderlineOffset: `${UNDERLINE_OFFSET + depth * UNDERLINE_SPACING}px`,
        }}
      >
        {stacked}
      </span>
    );
  });

  return stacked;
}

/**
 * メモの小フォーム。
 *
 * 背面へ半透明の覆いもスクロールの固定も置かないのは、書いている途中に発話を読み返せる方を採るため。
 * 同じ理由で、このフォームは body へ portal されて画面の main の外に居るので、`globals.css` の `[data-recedes-while-writing]` による減光も掛からない。
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
      className="fixed inset-x-4 bottom-4 z-10 mx-auto flex max-w-reading flex-col gap-2 rounded border border-rule bg-surface-mid p-3 shadow-[0_0_16px_rgba(0,0,0,0.12)]"
    >
      <input type="hidden" name="message_id" value={messageId} />
      <input type="hidden" name="anchor_start" value={draft.anchorStart} />
      <input type="hidden" name="anchor_end" value={draft.anchorEnd} />
      <input type="hidden" name="keyword" value={draft.keyword} />

      <blockquote className="border-rule border-l-2 pl-3 text-aux text-ink-weak">
        {draft.keyword}
      </blockquote>

      <Field
        name="note"
        aria-label="メモ"
        placeholder="なぜ引っかかったか（任意）"
      />

      <div className="flex justify-end gap-2">
        <Button type="button" onClick={onClose}>
          やめる
        </Button>
        <Button type="submit" tone="solid">
          メモする
        </Button>
      </div>
    </form>
  );
}

/**
 * 発話の `SelectionReader` を `readers` へ登録し、外し方を返す。
 *
 * document のリスナは `readers` が空でなくなったときに一組だけ張り、空に戻ったときに外す。
 * 本文の途中から下へドラッグして選ぶとボタンを離す位置が本文の枠の外になるので、リスナは document に置く。
 * 本文の div へ onMouseUp を付けると、React のハンドラは自分の部分木の外で起きた mouseup を受け取らないので、枠の外で離した選択が丸ごと取れない。
 * 静的な div へマウスのハンドラを付けること自体も biome が止める（a11y/noStaticElementInteractions）。
 * keyup も見るのは、shift + 矢印で伸ばした選択を取りこぼさないため。
 *
 * iOS は選択のジェスチャの終わりに mouseup を撃たないので、touchend も見る。
 * 実害は #147（スマホで発話を選んでもメモが作れない）。
 * 長押しから選択ハンドルを動かして離す一連は touchend で終わり、mouseup はその一連に来ない。
 * mouseup が来るのはただのタップのときだけで、その時点では選択が既に潰れている。
 * pointerup を採らないのは、同じ実機で touchend が来た回のうち半分ほどしか来なかったため。
 */
function subscribeSelection(
  container: Element,
  reader: SelectionReader,
): () => void {
  if (readers.size === 0) {
    document.addEventListener("mouseup", notifySelectedMessage);
    document.addEventListener("touchend", notifySelectedMessage);
    document.addEventListener("keyup", notifySelectedMessage);
  }

  readers.set(container, reader);

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
 * 選択の始点が入っている発話に読み直させ、他の発話の下書きを閉じる。
 *
 * 潰れた選択を早期 return するのは、キャレットが動いただけの keyup で `readers` を走査しないため。
 */
function notifySelectedMessage(): void {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed) {
    return;
  }

  const container = elementOf(selection.getRangeAt(0).startContainer)?.closest(
    "[data-message-body]",
  );

  if (!container) {
    return;
  }

  for (const [body, reader] of readers) {
    if (body === container) {
      reader.read();
    } else {
      // 下書きを画面に一つへ保つため、選んでいない発話のものは閉じる。
      reader.clear();
    }
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
