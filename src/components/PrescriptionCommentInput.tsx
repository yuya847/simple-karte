"use client";
import { useId } from "react";
import { RX_COMMENT_OPTIONS } from "@/lib/rx-entry";
export function PrescriptionCommentInput({ value, onChange, label, onEnter }: { value: string; onChange: (text: string) => void; label: string; onEnter: () => void }) {
  const id = useId();
  return <><input data-comment list={id} aria-label={label} className="w-full bg-transparent outline-none" placeholder="コメント" value={value} onChange={e => onChange(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); onEnter(); } }} /><datalist id={id}>{RX_COMMENT_OPTIONS.map(text => <option key={text} value={text} />)}</datalist></>;
}
