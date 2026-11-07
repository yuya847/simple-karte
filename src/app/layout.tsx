import type { Metadata, Viewport } from "next";
import { KeyboardGuard } from "@/components/KeyboardGuard";
import { BIZ_UDPGothic } from "next/font/google";
import { appearanceBootScript } from "@/lib/appearance";
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
  // Added to the home screen of an iPad, it opens full screen like an app.
  appleWebApp: { capable: true, title: "Simple Karte", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Chrome/Android: the layout shrinks for the keyboard instead of scrolling (Safari ignores this).
  interactiveWidget: "resizes-content",
  themeColor: "#f5f1e6",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // The script puts this browser's last look (設定：見た目・字の大きさ) on <html> before the first paint; React then
    // keeps those attributes (suppressHydrationWarning) and the 設定 button applies the person's own choice.
    <html lang="ja" className={biz.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: appearanceBootScript() }} />
      </head>
      <body className="font-sans antialiased">
        <KeyboardGuard />
        {children}
      </body>
    </html>
  );
}
