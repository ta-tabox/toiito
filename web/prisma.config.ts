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

  // 接続は二本引く。
  // Prisma Migrate はプーラー越しには動かないので、CLI が使うここは直結の DIRECT_URL。
  // アプリ経路（本番 Neon ではプーラー経由の DATABASE_URL）は PrismaClient の adapter が持つ（db.ts）。
  // schema.prisma 側に directUrl は書けない（Prisma 7 でこの config へ移った）。
  datasource: {
    url: env("DIRECT_URL"),
  },
});
