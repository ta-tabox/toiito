import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // エージェントを検出すると next dev が AGENTS.md へ自分の指示文を書き足して作業ツリーを汚すので、生成を止める。
  // 正はリポジトリルートの CLAUDE.md / ARCHITECTURE.md で、web/AGENTS.md はそれを指す空殻。
  agentRules: false,

  // next dev の二重起動検知は出力先の .next/dev/lock 一つを見ており、口（ポート）を分けても効かない。
  // E2E は開発サーバーを止めずに走らせるので、出力先ごと分ける口を開ける。
  // 既定から動かすのは E2E の webServer だけで、dev と build は .next のまま。
  distDir: process.env.TOIITO_DIST_DIR ?? ".next",
};

export default nextConfig;
