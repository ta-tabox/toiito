/**
 * 表の数値を右に揃えて描くセルの部品を置く。
 */

/**
 * 数値（`value`）を桁区切り付きで右に揃えて描く表のセル。
 * 数字の幅を揃え、縦に並んだ桁が列の中で揃うようにする。
 *
 * 行をまたぐセル（`rowSpan`）でも数値を行の上端に置き、隣の列の一行目と高さを揃える。
 */
export function NumberCell({
  value,
  rowSpan,
}: {
  value: number;
  rowSpan?: number;
}) {
  return (
    <td
      rowSpan={rowSpan}
      className="px-2 py-2 text-right align-top tabular-nums"
    >
      {value.toLocaleString("ja-JP")}
    </td>
  );
}
