import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "コウノトリのつばさ | 自分らしい選択を、ここから。",
  description:
    "提供者の情報を確かめて、納得できる選択へ。コウノトリのつばさは、個人間の精子提供について対話するためのサービスです。",
  robots: { index: false, follow: false },
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
