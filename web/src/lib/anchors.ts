/**
 * メモのアンカー（メッセージ本文中の文字オフセット）を扱う純関数群。
 * 本文の分割・オフセット換算・引用生成を行う。
 *
 * オフセットの単位は JS の string index（UTF-16 code unit）。
 * コードポイントではない。
 * DB / next / DOM に依存しない。
 * UI は DOM から読んだ数値をこの層へ渡すだけにする。
 * アンカーは messages が immutable（追記のみ）であることを前提にしている。
 */

import type { Anchor } from "@/lib/types";

type AnchorRange = { id: string; anchor_start: number; anchor_end: number };

/**
 * `start` と `end` を検査して `Anchor` にする。
 * `start` と `end` が整数で、`start >= 0` かつ `end > start` でなければ throw する。
 *
 * `Anchor` を作るのは `parseAnchor` だけなので、フォームの値・DOM の選択・DB の行のどこから範囲を作るときも、ここを通す。
 */
export function parseAnchor(start: number, end: number): Anchor {
  const isValid =
    Number.isInteger(start) &&
    Number.isInteger(end) &&
    start >= 0 &&
    end > start;

  if (!isValid) {
    throw new Error(
      `アンカーの範囲が不正: start ${start}、end ${end}（start は 0 以上の整数、end は start より大きい整数）`,
    );
  }

  return { start, end } as Anchor;
}

/**
 * 本文を切り分けた一区間。
 *
 * 「付いているメモの組み合わせが変わらない最大の連続範囲」で、UI はセグメント 1 つを単位として下線を描く。
 *
 * 本文先頭からの位置 start は生成時に確定するので、自分で持つ。
 * `start` が無いと、セグメント内オフセットを絶対オフセットへ戻すたびに手前のセグメントを全部足し直すことになる。
 */
export class Segment {
  readonly text: string;
  readonly start: number;
  readonly memoIds: string[];

  constructor(text: string, start: number, memoIds: string[]) {
    this.text = text;
    this.start = start;
    this.memoIds = memoIds;
  }

  /** UI が返すセグメント内オフセットを、本文先頭基準の絶対オフセットへ換算する。 */
  absoluteOffset(offsetInSegment: number): number {
    return this.start + offsetInSegment;
  }
}

/**
 * 本文を、全メモの端点で切ったセグメント（下線の付き方が変わらない最大の連続範囲）へ切り分ける。
 * 各セグメントは自分に付いているメモの id を全部持つ（重なりなら複数、メモの無い範囲なら空）。
 *
 * 例: 本文 "abcdef" にメモ m1(0-4) と m2(2-6) が付く場合
 *   → "ab"[m1] / "cd"[m1,m2] / "ef"[m2]
 *
 * 重なりの部分でテキストを複製すると、セグメント内オフセットから本文の絶対オフセットへ戻せなくなるので、複製しない。
 */
export function segmentBody(body: string, memos: AnchorRange[]): Segment[] {
  const cuts = new Set<number>([0, body.length]);

  memos.forEach((memo) => {
    cuts.add(memo.anchor_start);
    cuts.add(memo.anchor_end);
  });

  const sortedCuts = [...cuts].sort((a, b) => a - b);

  // 隣り合う切断点の間が 1 セグメント。
  // 切断点はメモの端点そのものなので、メモ区間がセグメントの途中で切れることはない。
  return sortedCuts.slice(0, -1).map((start, i) => {
    const end = sortedCuts[i + 1];
    const coveringMemoIds = memos
      .filter((memo) => memo.anchor_start <= start && end <= memo.anchor_end)
      .map((memo) => memo.id);

    return new Segment(body.slice(start, end), start, coveringMemoIds);
  });
}

const graphemeSegmenter = new Intl.Segmenter("ja", { granularity: "grapheme" });

/**
 * 人が「一文字」と見る単位＝書記素クラスタの途中を指すインデックスを、その手前の境界へ丸める。
 * 丸め方向は常に手前なので、start / end どちらに使っても元の index を超えない。
 *
 * コードポイント境界で丸めると、サロゲートペアを含まない異体字セレクタ（神︀ = U+795E + U+FE00）や結合文字が判定を通り抜け、肌色修飾や ZWJ 連結の絵文字（👨‍👩‍👧 = 8 code unit）は内部の境界で割れる。
 * いずれも分断すると字体や絵柄が変わる。
 */
export function clampToGraphemeBoundary(body: string, index: number): number {
  if (index <= 0 || index >= body.length) {
    return index;
  }

  for (const { index: start, segment } of graphemeSegmenter.segment(body)) {
    if (index < start + segment.length) {
      return index === start ? index : start;
    }
  }

  return index;
}

/** 引用を、アンカーの手前・アンカー本体・その後ろへ切り分けた形。 */
export type ExcerptParts = {
  readonly before: string;
  readonly anchor: string;
  readonly after: string;
};

/**
 * メモの引用を、アンカーの手前・本体・後ろの三つに切って作る。
 * `anchor` の前後へ `margin` 文字ずつ広げ、本文の端と書記素境界で止める。
 * 連結すれば引用の全文になる。
 *
 * 三つに割るのは、UI がアンカー本体だけを描き分けるため。
 * 一本の文字列で返すと、UI 側が同じオフセット演算をやり直すことになる。
 */
export function excerptParts(
  body: string,
  anchor: Anchor,
  margin: number,
): ExcerptParts {
  const from = clampToGraphemeBoundary(
    body,
    Math.max(0, anchor.start - margin),
  );
  const to = clampToGraphemeBoundary(
    body,
    Math.min(body.length, anchor.end + margin),
  );

  return {
    before: body.slice(from, anchor.start),
    anchor: body.slice(anchor.start, anchor.end),
    after: body.slice(anchor.end, to),
  };
}
