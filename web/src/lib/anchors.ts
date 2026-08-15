// メモのアンカー（メッセージ本文中の文字オフセット）を扱う純関数群。
// 本文の分割・オフセット換算・引用生成を行う。
//
// オフセットの単位は JS の string index（UTF-16 code unit）。コードポイントではない。
// DB / next / DOM に依存しない。UI は DOM から読んだ数値をこの層へ渡すだけにする。
// アンカーは messages が immutable（追記のみ）であることを前提にしている。

export type Segment = { text: string; memoIds: string[] };

type AnchorRange = { id: string; anchor_start: number; anchor_end: number };

/**
 * 本文をメモのアンダーライン区間で分割する。重複区間は一つのセグメントに複数の memoIds を持たせる
 * （テキストを複製すると segment → 絶対オフセットの逆変換が壊れるため）。
 *
 * 実装は座標圧縮。全メモの start/end を切断点とし、隣接する切断点の間を 1 セグメントとする。
 * 切断点がメモの境界そのものなので、メモ区間がセグメントの途中で切れることはない。
 */
export function segmentBody(body: string, memos: AnchorRange[]): Segment[] {
  const cuts = new Set<number>([0, body.length]);
  for (const m of memos) {
    cuts.add(m.anchor_start);
    cuts.add(m.anchor_end);
  }
  const points = [...cuts].sort((a, b) => a - b);

  const segments: Segment[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const start = points[i];
    const end = points[i + 1];
    const memoIds = memos
      .filter((m) => m.anchor_start <= start && end <= m.anchor_end)
      .map((m) => m.id);

    segments.push({ text: body.slice(start, end), memoIds });
  }
  return segments;
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
