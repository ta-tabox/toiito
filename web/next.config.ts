import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // エージェントを検出すると next dev が AGENTS.md へ自分の指示文を書き足して作業ツリーを汚すので、生成を止める。
  // 正典はリポジトリルートの CLAUDE.md / ARCHITECTURE.md で、web/AGENTS.md はそれを指す空殻。
  agentRules: false,
};

export default nextConfig;
