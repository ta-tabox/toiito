/**
 * 環境変数から作る設定。
 *
 * `process.env` を読むのはこのモジュールだけで、他のモジュールは解決済みの値を参照する（HARNESS.md「テスト可能性の設計制約」2）。
 * env から値への写像そのものはプロバイダ側のモジュールが純関数として持ち、ここはそれに `process.env` を渡すだけの層。
 *
 * 変数の名前と既定値の正は web/README.md の表。
 */

import { readAnthropicSettings } from "@/lib/ai/anthropic";

/**
 * アプリからの接続先。
 *
 * 未設定のまま残すのは、接続を張る側（db.ts）が文脈付きで落とせるようにするため。
 * ここで落とすと、DB を使わない経路まで巻き添えになる。
 */
export const DATABASE_URL = process.env.DATABASE_URL;

/**
 * 解決済みの、系統ごとの AI 設定。
 * プロバイダはアプリ全体で一つで、系統で分かれるのは思考の深さだけ（ADR-0021）。
 */
export const AI_SETTINGS = readAnthropicSettings(process.env);
