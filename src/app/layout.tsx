import type { Metadata } from "next";
import { BIZ_UDPGothic } from "next/font/google";
import "./globals.css";

const biz = BIZ_UDPGothic({
  weight: ["400", "700"],
  variable: "--font-biz",
  display: "swap",
  preload: false,
});

export const metadata: Metadata = {
  title: "Simple Karte",
  description:
    "病棟で医師が話した指示を、オーダーの下書きにする Web アプリ。決めるのは医師、AI は入力係。",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ja" className={biz.variable}>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
