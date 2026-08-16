/**
 * Prisma CLI の設定。
 * Prisma 7 は .env を自動で読まないので、ここで明示的に読み込む。
 * Next.js は .env.local を自分で読むが、CLI はこの経路しか通らない。
 */

import { defineConfig, env } from "prisma/config";

// ファイルが無い環境（CI で env を直接渡す場合）でも落とさない
try {
  process.loadEnvFile(".env.local");
} catch {
  // .env.local が無ければ、既に環境変数として入っている前提で続ける
}

export default defineConfig({
  schema: "prisma/schema.prisma",

  // ここに書くのは CLI（Prisma Migrate）の接続先だけで、直結の DIRECT_URL を渡す。
  // Migrate はプーラー越しには動かないため。
  //
  // アプリの接続先は別で、DATABASE_URL を PrismaClient の adapter が持つ（db.ts）。
  // 本番の Neon ではそちらがプーラー経由になるので、env は最初から二本に分けてある。
  // schema.prisma 側に directUrl は書けない（Prisma 7 でこの config へ移った）。
  datasource: {
    url: env("DIRECT_URL"),
  },
});
