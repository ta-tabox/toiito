/**
 * 全ページ共通の外枠。
 * html / body の骨格とサイト全体のメタデータだけを持つ。
 *
 * 画面ごとの見出し・余白・データ取得は各 page が持つ。
 * `RootLayout` は全画面の描画を止める位置にあり、一画面の都合を寄せると全体に波及する。
 */

import type { Metadata } from "next";
import { Shippori_Mincho, Zen_Kaku_Gothic_New } from "next/font/google";
import "./globals.css";

/**
 * 見出しの明朝。
 * 問いだけが明朝で立ち、対話はゴシックで読み下せる（`.claude/rules/design.md`「書体と字組み」）。
 *
 * `preload: false`・画面へ出るウェイトだけの宣言・`subsets` を書かないことの理由は `docs/adr/0032-japanese-webfont-loading.md`。
 * ウェイトを増やすときは、その太さを実際に出す画面と一緒に足す。
 */
const mincho = Shippori_Mincho({
  weight: ["400"],
  display: "swap",
  preload: false,
  variable: "--font-shippori-mincho",
});

/** 本文と UI のゴシック。 */
const gothic = Zen_Kaku_Gothic_New({
  weight: ["400", "700"],
  display: "swap",
  preload: false,
  variable: "--font-zen-kaku-gothic-new",
});

export const metadata: Metadata = {
  title: "toiito — 問いの発酵槽",
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
    <html
      lang="ja"
      className={`h-full antialiased ${mincho.variable} ${gothic.variable}`}
    >
      <body className="flex min-h-full flex-col font-gothic">{children}</body>
    </html>
  );
}
