/**
 * 文字列の値域から、外から来た値を絞り込む関門を作る。
 *
 * 値域そのものは概念ごとに違うので、共有するのは絞り込みの手順だけ。
 * 値域を持つ側が自分の並びを渡し、返る二つで判定と変換を使い分ける。
 */

/**
 * 値域を渡して関門を作る。
 * `includes` は型を絞る判定で、`from` は値域の外（未設定・綴り違い）を undefined へ倒す変換。
 */
export function valueSet<T extends string>(
  values: readonly T[],
): {
  includes: (value: string) => value is T;
  from: (value: string | undefined) => T | undefined;
} {
  const members: ReadonlySet<string> = new Set(values);

  const includes = (value: string): value is T => members.has(value);

  const from = (value: string | undefined): T | undefined =>
    value !== undefined && includes(value) ? value : undefined;

  return { includes, from };
}
