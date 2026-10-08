import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "iStudio | 学びを、いっしょに。",
  description:
    "麗澤大学 iStudio 学習支援・予約管理システムの独立した検証用プロトタイプ。",
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
