import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Simple Karte",
  description:
    "病棟で医師が話した指示を、オーダーの下書きにする Web アプリ。決めるのは医師、AI は入力係。",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
