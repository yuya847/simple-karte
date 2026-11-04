"use client";

import { marksOf, type MarkKey } from "@/lib/drug-class";

// The look follows the law's marks: 毒 = black ground, white frame and letter; 劇 = white ground, red frame
// and letter (医薬品医療機器等法 第44条); 麻・向 = the letter in a circle (麻薬及び向精神薬取締法 第31条・第50条の19).
const STYLE: Record<MarkKey, string> = {
  麻: "rounded-full border-[1.5px] border-shu text-shu bg-sheet w-[1.35em] h-[1.35em] justify-center",
  向: "rounded-full border-[1.5px] border-fuji text-fuji bg-sheet w-[1.35em] h-[1.35em] justify-center",
  毒: "rounded-sm bg-ink text-white ring-1 ring-inset ring-white px-1",
  劇: "rounded-sm border border-shu bg-white text-shu px-1",
  ハイリスク: "rounded-sm bg-yamabuki-soft text-yamabuki px-1",
};
// For labels (printed black and white): the same shapes in black.
const PRINT: Record<MarkKey, string> = {
  麻: "rounded-full border-[1.5px] border-black w-[1.35em] h-[1.35em] justify-center",
  向: "rounded-full border-[1.5px] border-black w-[1.35em] h-[1.35em] justify-center",
  毒: "rounded-sm bg-black text-white px-1",
  劇: "rounded-sm border border-black px-1",
  ハイリスク: "rounded-sm border border-black px-1",
};

/** 麻・向・毒・劇・ハイリスク next to a drug (from its 電子添文; none for most drugs). */
export function DrugMarks({ codes, print = false, className = "" }: { codes: (string | null | undefined)[]; print?: boolean; className?: string }) {
  const seen = new Set<MarkKey>();
  const marks = codes.flatMap((c) => (c ? marksOf(c) : [])).filter((m) => (seen.has(m.key) ? false : (seen.add(m.key), true)));
  if (!marks.length) return null;
  return (
    <span className={`ml-1 inline-flex items-center gap-0.5 align-middle ${className}`}>
      {marks.map((m) => (
        <span key={m.key} title={m.title} aria-label={m.title} className={`inline-flex shrink-0 items-center text-[10px] font-bold leading-none ${print ? PRINT[m.key] : STYLE[m.key]} ${m.key === "ハイリスク" ? "py-0.5" : m.key === "毒" || m.key === "劇" ? "py-0.5" : ""}`}>
          {m.key}
        </span>
      ))}
    </span>
  );
}
