"use client";
import { useState } from "react";
import { parseDuration } from "@/lib/inj-entry";
import { TabChoice } from "./TabChoice";
const textOf = (n: number) => n ? n % 60 ? `${n}分` : `${n / 60}時間` : "";
export function InjectionDurationInput({ value, onChange, label, className }: { value: number; onChange: (minutes: number) => void; label: string; className?: string }) {
  const [text, setText] = useState(textOf(value));
  return <><input value={text} aria-label={label} placeholder="分 または 1時間30分" className={className} onChange={e => { setText(e.target.value); onChange(parseDuration(e.target.value) ?? 0); }} />
    <TabChoice label={`${label}の候補`} options={[15, 30, 60, 90, 120, 180, 240, 360, 480, 720, 1440].map(n => ({ value: n, label: textOf(n) }))} value={value} onChange={n => { setText(textOf(n)); onChange(n); }} /></>;
}
