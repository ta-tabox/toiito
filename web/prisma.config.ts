/**
 * Prisma CLI の設定。
 * Prisma 7 は .env を自動で読まないので、接続先は `scripts/checkout-environment.ts` から受け取る。
 * Next.js は .env.local を自分で読むが、CLI はこの経路しか通らない。
 */

import { defineConfig } from "prisma/config";
import { applyCheckoutEnvironment } from "./scripts/checkout-environment.ts";

const environment = applyCheckoutEnvironment();

export default defineConfig({
  schema: "prisma/schema.prisma",

  // この config に書くのは CLI（Prisma Migrate）の接続先だけで、直結の DIRECT_URL を渡す。
  // Migrate はプーラー越しには動かないため。
  //
  // アプリの接続先は別で、DATABASE_URL を PrismaClient の adapter が持つ（db.ts）。
  // 本番の Neon では DATABASE_URL がプーラー経由になるので、env は最初から二本に分けてある。
  // schema.prisma 側に directUrl は書けない（Prisma 7 の datasource は url も directUrl も受け取らない）。
  datasource: {
    url: environment.DIRECT_URL,
  },
});
