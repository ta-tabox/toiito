// メモのアンカー（メッセージ本文中の文字オフセット）を扱う純関数群。
// 本文の分割・オフセット換算・引用生成を行う。
//
// オフセットの単位は JS の string index（UTF-16 code unit）。コードポイントではない。
// DB / next / DOM に依存しない。UI は DOM から読んだ数値をこの層へ渡すだけにする。
// アンカーは messages が immutable（追記のみ）であることを前提にしている。

import type { Segment } from "./types";

type AnchorRange = { id: string; anchor_start: number; anchor_end: number };

/**
 * 本文をセグメント（下線の掛かり方が変わらない最大の連続範囲）へ切り分ける。
 *
 * メモは本文の一部に付く下線で、複数のメモが同じ範囲に重なりうる。UI は重なりの
 * 有無が切り替わるたびに描き分けたいので、切り替わる位置＝全メモの端点で本文を割る。
 * 各セグメントは自分に掛かっているメモの id を全部持つ（重なりなら複数、地の文なら空）。
 *
 * 例: 本文 "abcdef" にメモ m1(0-4) と m2(2-6) が付く場合
 *   → "ab"[m1] / "cd"[m1,m2] / "ef"[m2]
 *
 * 重なりの部分でテキストを複製しないのは、複製するとセグメント内オフセットから
 * 本文の絶対オフセットへ戻せなくなるため。
 */
export function segmentBody(body: string, memos: AnchorRange[]): Segment[] {
  const cuts = new Set<number>([0, body.length]);

  memos.forEach((memo) => {
    cuts.add(memo.anchor_start);
    cuts.add(memo.anchor_end);
  });

  const sortedCuts = [...cuts].sort((a, b) => a - b);

  // 隣り合う切断点の間が 1 セグメント。切断点はメモの端点そのものなので、
  // メモ区間がセグメントの途中で切れることはない。
  return sortedCuts.slice(0, -1).map((start, i) => {
    const end = sortedCuts[i + 1];
    const coveringMemoIds = memos
      .filter((memo) => memo.anchor_start <= start && end <= memo.anchor_end)
      .map((memo) => memo.id);

    return { text: body.slice(start, end), memoIds: coveringMemoIds };
  });
}

/** セグメント内オフセットを本文先頭基準の絶対オフセットへ換算する。 */
export function resolveOffset(
  segments: Segment[],
  segmentIndex: number,
  offsetInSegment: number,
): number {
  let base = 0;
  for (let i = 0; i < segmentIndex; i++) {
    base += segments[i].text.length;
  }
  return base + offsetInSegment;
}

/**
 * サロゲートペアの途中を指すインデックスをコードポイント境界へ丸める。
 * 丸め方向は常に手前（index - 1）。start / end どちらに使っても元の index を超えない。
 */
export function clampToCodePoint(body: string, index: number): number {
  if (index <= 0 || index >= body.length) return index;

  const before = body.charCodeAt(index - 1);
  const after = body.charCodeAt(index);
  const isHighSurrogate = before >= 0xd800 && before <= 0xdbff;
  const isLowSurrogate = after >= 0xdc00 && after <= 0xdfff;
  return isHighSurrogate && isLowSurrogate ? index - 1 : index;
}

/** 逆引き一覧用の引用生成。margin が本文外へはみ出す場合は本文端で止める。 */
export function excerpt(
  body: string,
  start: number,
  end: number,
  margin: number,
): string {
  const from = clampToCodePoint(body, Math.max(0, start - margin));
  const to = clampToCodePoint(body, Math.min(body.length, end + margin));
  return body.slice(from, to);
}
