/**
 * 全ページ共通の外枠。html / body の骨格とサイト全体のメタデータだけを持つ。
 *
 * 画面ごとの見出し・余白・データ取得は各 page が持つ。
 * ここは全画面の描画を止める位置にあり、一画面の都合を寄せると全体に波及する。
 */

import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "toiito — 問いのコンポスター",
  description:
    "問いを投げ入れて発酵させる。答えではなく問いを深めるための場所。",
};

/** 全ページ共通の外枠。 */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
