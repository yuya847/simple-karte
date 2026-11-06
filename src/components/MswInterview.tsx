"use client";
import { useState } from "react";
export function MswInterview({ today, nowTime, onSave }: { today: string; nowTime: string; onSave: (text: string) => void }) {
  const [text, setText] = useState("");
  const [saved, setSaved] = useState(false);
  return <div className="space-y-2"><label>面談内容<textarea aria-label="面談内容" value={text} onChange={e => { setText(e.target.value); setSaved(false); }} rows={7} className="block w-full border border-rule bg-paper" /></label><button disabled={!text.trim()} className="rounded bg-ai px-3 py-1 text-white disabled:opacity-40" onClick={() => { onSave(`面談記録 ${today} ${nowTime}\n${text.trim()}`); setSaved(true); setText(""); }}>面談記録を保存</button>{saved && <p role="status">経過に残しました。</p>}</div>;
}
