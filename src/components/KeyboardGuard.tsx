"use client";

// iPad・iPhone の Safari は、入力欄にフォーカスして画面のキーボードが出ると、入力欄を見せようとして
// overflow: hidden の枠（この画面の列や行）まで勝手にスクロールし、中身が画面の外へ飛ぶことがある
// （動画：バイタルの欄を押すと画面が真っ白になる）。ここでは、フォーカスのあとと画面の大きさが変わった
// あとに、スクロールするはずのない枠（overflow が auto/scroll でないもの）とページ自体の位置を 0 に戻す。
// スクロールする枠（引き出しの中身など）はそのまま。

import { useEffect } from "react";

function settle() {
  const el = document.activeElement as HTMLElement | null;
  if (!el || !/^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName)) return;
  for (let p = el.parentElement; p; p = p.parentElement) {
    const oy = getComputedStyle(p).overflowY;
    if (oy !== "auto" && oy !== "scroll" && p.scrollTop !== 0) p.scrollTop = 0;
    if (p.scrollLeft !== 0 && getComputedStyle(p).overflowX !== "auto" && getComputedStyle(p).overflowX !== "scroll") p.scrollLeft = 0;
  }
  if (window.scrollX || window.scrollY) window.scrollTo(0, 0);
}

export function KeyboardGuard() {
  useEffect(() => {
    if (!window.matchMedia("(pointer: coarse)").matches) return;
    const later = () => {
      // The browser scrolls after the keyboard has animated in: look a few times.
      [50, 200, 450, 800].forEach((ms) => setTimeout(settle, ms));
    };
    document.addEventListener("focusin", later);
    const vv = window.visualViewport;
    vv?.addEventListener("resize", later);
    vv?.addEventListener("scroll", later);
    return () => {
      document.removeEventListener("focusin", later);
      vv?.removeEventListener("resize", later);
      vv?.removeEventListener("scroll", later);
    };
  }, []);
  return null;
}
