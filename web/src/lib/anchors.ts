// 純関数のみ・DB / next / DOM 非依存。メッセージ本文とメモのアンカー区間から
// 表示用の分割・オフセット換算・引用生成を行う（対話画面・逆引き画面の両方が使う）。
//
// オフセットの正は JS の string index（UTF-16 code unit）。コードポイント
// （サロゲートペアで2 code unit を使う絵文字等）ではない。

export type Segment = { text: string; memoIds: string[] };

type AnchorRange = { id: string; anchor_start: number; anchor_end: number };

/**
 * 本文をメモのアンダーライン区間で分割する。重複区間（overlap）は
 * 一つのセグメントに複数の memoIds を持たせて表現する——テキストを
 * 複製すると往復変換（segment→絶対オフセット）が壊れるため。
 *
 * アルゴリズム: 全メモの start/end を切断点として座標圧縮し、隣接する
 * 切断点の間を1セグメントとする。切断点はメモの境界そのものなので、
 * 各セグメントは「特定のメモ集合を完全に内包する／しない」のどちらかに
 * 定まり、メモ区間がセグメント途中で切れることはない。
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
 * 丸め方向は常に手前（index - 1）——start/end どちらの用途で呼ばれても
 * 「元の index を超えない」を保証すれば、本文範囲をはみ出す事故も
 * ペア片割れの分断も起きない。
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
