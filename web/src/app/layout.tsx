import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "toiito — 問いのコンポスター",
  description: "問いを投げ入れて発酵させる。答えではなく問いを深めるための場所。",
};

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
