/**
 * 全ページ共通の外枠。
 * html / body の骨格とサイト全体のメタデータだけを持つ。
 *
 * 画面ごとの見出し・余白・データ取得は各 page が持つ。
 * ここは全画面の描画を止める位置にあり、一画面の都合を寄せると全体に波及する。
 */

import type { Metadata } from "next";
import { Shippori_Mincho, Zen_Kaku_Gothic_New } from "next/font/google";
import "./globals.css";

/**
 * 見出しの明朝。
 * 問いだけが明朝で立ち、対話はゴシックで読み下せる（DESIGN.md「書体と字組み」）。
 *
 * 和文の従属欧文へ日付と数字も預けるので、欧文専用の書体は足さない。
 * preload を切るのは、和文のサブセットが数十本に分かれており、どれが要るかは本文の文字を見るまで決まらないため。
 *
 * ウェイトは実際に画面へ出るものだけを挙げる。
 * 和文は 1 ウェイトが百本を超えるサブセットに分かれるので、使わない一段が初回のビルドと dev の起動をそのぶん引き延ばす。
 *
 * `subsets` は書かない。
 * これが決めるのは preload の対象だけで、生成される `@font-face` は Google が返す全 `unicode-range` ぶんになるので、`preload: false` と併記しても生成物が変わらない。
 * 逆に `["latin"]` と書くと、和文が別サブセットとして漏れるように読めてしまう。
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
