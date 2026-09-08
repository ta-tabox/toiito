/**
 * Better Auth のエンドポイントを `/api/auth/*` へ配線するルートハンドラ。
 *
 * 判断は持たない。
 * サインインの可否・セッションの寿命・cookie の属性はすべて `auth.ts` の設定が決め、`route.ts` は Next の規約へ繋ぐだけにする。
 *
 * `@/lib/auth` を import してよいのはこのファイルと `current-user.ts` だけで、`biome.json` の `noRestrictedImports` が検査する。
 */

import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth";

// インスタンスでなく関数を渡す。
// `auth()` は最初の呼び出しまで環境変数を読まないので、モジュールの評価時に組み立てるとその遅延が消える。
export const { GET, POST } = toNextJsHandler((request: Request) =>
  auth().handler(request),
);
