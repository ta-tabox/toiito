/**
 * Better Auth のエンドポイントを `/api/auth/*` へ配線するルートハンドラ。
 *
 * 判断は持たない。
 * サインインの可否・セッションの寿命・cookie の属性はすべて `lib/auth/index.ts` の設定が決め、`route.ts` は Next の規約へ繋ぐだけにする。
 *
 * `@/lib/auth` を import してよいのはこのファイルと `current-user.ts` と `sign-in.ts` だけで、`biome.json` の `noRestrictedImports` が検査する。
 */

import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth";

/**
 * `/api/auth/*` への GET と POST を Better Auth のハンドラへ渡す。
 *
 * `auth()` は最初の呼び出しまで環境変数を読まないので、インスタンスでなく関数を渡してその遅延を保つ。
 */
export const { GET, POST } = toNextJsHandler((request: Request) =>
  auth().handler(request),
);
