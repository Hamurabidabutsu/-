import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "コウノトリのつばさ | 自分らしい選択を、ここから。",
  description:
    "確認できるデータをもとに、希望に合う精子提供者を。身体情報・検査結果・提供条件を見比べ、サイト内のチャットで直接話し合えるサービスです。",
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
