"use client";
import { useState } from "react";
import { useDeny, useMe } from "./RoleContext";
import type { RehabDesk } from "@/lib/rehab";
import type { NoteEntry } from "@/lib/types";
const FIM_ITEMS = ["食事", "整容", "清拭", "更衣（上半身）", "更衣（下半身）", "トイレ動作", "排尿管理", "排便管理", "移乗（ベッド・椅子・車椅子）", "移乗（トイレ）", "移乗（浴槽・シャワー）", "歩行・車椅子", "階段", "理解", "表出", "社会的交流", "問題解決", "記憶"];
export function RehabFim({ patientId, desk, onDesk, nowTime, onNote }: { patientId: string; desk: RehabDesk; onDesk: (f: (d: RehabDesk) => RehabDesk) => void; nowTime: string; onNote?: (pid: string, n: NoteEntry) => void }) {
  const me = useMe(); const deny = useDeny()("rehab.therapy");
  const [scores, setScores] = useState<number[]>(Array(18).fill(0));
  const [walk, setWalk] = useState(""); const [transfer, setTransfer] = useState(""); const [saved, setSaved] = useState(false);
  return <section className="space-y-2"><h3 className="font-bold">FIM・歩行・移乗</h3>
    <div className="flex flex-wrap gap-2">{scores.map((v, i) => <label key={i}>{FIM_ITEMS[i]}<input className="w-12 border border-rule" aria-label={`FIM ${FIM_ITEMS[i]}`} type="number" min={1} max={7} value={v || ""} onChange={e => setScores(scores.map((x, j) => i === j ? Number(e.target.value) : x))} /></label>)}</div>
    <p>合計 {scores.every(s => s >= 1 && s <= 7 && Number.isInteger(s)) ? scores.reduce((a,b) => a+b, 0) : "—"} / 126</p>
    <label>歩行<input value={walk} onChange={e => setWalk(e.target.value)} className="border border-rule" /></label>
    <label>移乗<input value={transfer} onChange={e => setTransfer(e.target.value)} className="border border-rule" /></label>
    <button type="button" disabled={!!deny || !scores.every(s => s >= 1 && s <= 7 && Number.isInteger(s))} onClick={() => { const e = { id: crypto.randomUUID(), patientId, day: 0, time: nowTime, by: me.name, scores: [...scores], walk, transfer }; onDesk(d => ({ ...d, fim: [...(d.fim ?? []), e] })); onNote?.(patientId, { kind: "note", id: e.id, day: 0, time: nowTime, author: me.name, role: me.role, text: `FIM ${scores.reduce((a,b) => a+b,0)} / 126\n各項目：${scores.join("、")}\n歩行：${walk}\n移乗：${transfer}` }); setSaved(true); }}>FIMを記録</button>
    {saved && <p role="status">FIMを記録しました。</p>}
    {(desk.fim ?? []).filter(e => e.patientId === patientId).map(e => <p key={e.id}>{e.time} FIM {e.scores.reduce((a,b) => a+b,0)} / 126　歩行：{e.walk}　移乗：{e.transfer}</p>)}
  </section>;
}
