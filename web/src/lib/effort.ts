/**
 * 思考の深さのドメイン。
 * 値域と、値域から派生する判定をここに置く。
 * 呼び出し層（claude.ts）と設定層（config.ts）の双方が参照するので、どちらにも寄せない。
 */

/**
 * 思考にどれだけ費やすか。
 * 値域は Claude API の `output_config.effort`。
 */
export const EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;

export type Effort = (typeof EFFORTS)[number];

/**
 * 外から来た文字列を Effort へ絞り込む。
 * API へ渡す前の関門。
 */
export function isEffort(value: string): value is Effort {
  return (EFFORTS as readonly string[]).includes(value);
}

/**
 * 値域に収まる文字列だけを Effort として通す。
 * 未設定と綴り違いはどちらも undefined へ倒す。
 */
export function toEffort(value: string | undefined): Effort | undefined {
  return value && isEffort(value) ? value : undefined;
}
