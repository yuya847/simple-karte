import type { MetadataRoute } from "next";

// Lets the chart be added to the home screen of an iPad (or a phone / desktop) and open full screen,
// like an app. The data is fictional; nothing is stored on the device beyond the open page.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Simple Karte",
    short_name: "Simple Karte",
    description: "病棟の電子カルテ。決めるのは医師、AI は入力係。",
    lang: "ja",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#f5f1e6",
    theme_color: "#f5f1e6",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
