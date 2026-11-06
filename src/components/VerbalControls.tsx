"use client";
import { displayText } from "@/lib/display-text";
import { TimeInput } from "@/components/TimeInput";

import { createContext, useContext, useState, type ReactNode } from "react";
import { DOCTORS } from "@/lib/doctors";
import { auditLog } from "@/lib/audit";
import { reviewVerbal, canReviewVerbal, verbalConfirmationProblems, type VerbalConfirmation } from "@/lib/verbal";
import type { OrderEntry } from "@/lib/types";
import { useMe } from "./RoleContext";

export const VerbalReviewContext = createContext<(ids: string[], reason?: string) => void>(() => {});
export function VerbalReviewProvider({ children, nowTime, patientName, onReview }: { children: ReactNode; nowTime: string; patientName?: string; onReview: (f: (entries: OrderEntry[]) => OrderEntry[]) => void }) {
  const me = useMe();
  return <VerbalReviewContext.Provider value={(ids, reason) => {
    onReview((entries) => entries.map((e) => ids.includes(e.id) ? reviewVerbal(e, me, nowTime, reason) : e));
    auditLog({ role: me.role, actor: me.name, action: reason === undefined ? "確定（口頭指示を承認）" : "確定（口頭指示を取り消し）", patient: patientName, detail: `${ids.join("、")}${reason ? `：${reason}` : ""}` });
  }}>{children}</VerbalReviewContext.Provider>;
}
export function VerbalReview({ entry }: { entry: OrderEntry }) {
  const me = useMe();
  const review = useContext(VerbalReviewContext);
  const [reason, setReason] = useState<string | null>(null);
  const v = entry.verbal;
  if (!v) return null;
  if (v.signedAt) return <span className="text-wakatake">承認 {v.signedBy} {v.signedAt.time}</span>;
  if (v.cancelled) return <span className="text-shu">取り消し {displayText(v.cancelled.by)} {v.cancelled.at.time}：{displayText(v.cancelled.reason)}</span>;
  if (!canReviewVerbal(entry, me)) return null;
  return <span className="inline-flex flex-wrap items-center gap-2 text-xs">
    <button type="button" className="rounded border border-yamabuki px-2 text-yamabuki" onClick={() => review([entry.id])}>承認する</button>
    <button type="button" className="text-shu" onClick={() => setReason("")}>取り消す（理由）</button>
    {reason !== null && <><input aria-label="口頭指示を取り消す理由" value={reason} onChange={(e) => setReason(e.target.value)} className="rounded border border-rule bg-paper px-1" /><button type="button" disabled={!reason.trim()} onClick={() => { review([entry.id], reason); setReason(null); }}>取り消しを確定</button><button type="button" onClick={() => setReason(null)}>戻る</button></>}
  </span>;
}

export function useVerbalConfirmation() {
  const [pending, setPending] = useState<{ run: (v: VerbalConfirmation) => void; now: string; doctors: string[] } | null>(null);
  return {
    request: (run: (v: VerbalConfirmation) => void, now: string, doctors: string[]) => setPending({ run, now, doctors }),
    dialog: pending ? <VerbalConfirmForm now={pending.now} doctors={pending.doctors} onCancel={() => setPending(null)} onConfirm={(v) => { pending.run(v); setPending(null); }} /> : null,
  };
}
function VerbalConfirmForm({ now, doctors, onConfirm, onCancel }: { now: string; doctors: string[]; onConfirm: (v: VerbalConfirmation) => void; onCancel: () => void }) {
  const [value, setValue] = useState<VerbalConfirmation>({ doctor: "", readBack: false, time: now });
  const problems = verbalConfirmationProblems(value);
  return <div className="fixed inset-0 z-[100] grid place-items-center bg-black/30"><section role="dialog" aria-modal="true" aria-label="口頭指示の確認" className="space-y-3 rounded-lg border border-rule bg-sheet p-5 text-sm">
    <h2 className="font-bold">口頭指示の確認</h2>
    <label className="block">指示した医師（必須）<input list="verbal-doctors" value={value.doctor} onChange={(e) => setValue({ ...value, doctor: e.target.value })} className="ml-2 rounded border border-rule bg-paper" /></label>
    <datalist id="verbal-doctors">{Array.from(new Set([...doctors, ...DOCTORS.map((d) => d.name)])).map((name) => <option key={name} value={name} />)}</datalist>
    <label className="block"><input type="checkbox" checked={value.readBack} onChange={(e) => setValue({ ...value, readBack: e.target.checked })} /> 復唱した（必須）</label>
    <label className="block">指示の時刻 <TimeInput value={value.time} onChange={(e) => setValue({ ...value, time: e.target.value })} /></label>
    {problems.map((p) => <p key={p} className="text-xs text-shu">{p}</p>)}
    <div className="flex gap-3"><button type="button" onClick={onCancel}>戻る</button><button type="button" disabled={problems.length > 0} className="rounded bg-yamabuki px-3 py-1 text-white disabled:opacity-40" onClick={() => onConfirm({ ...value, doctor: value.doctor.trim() })}>口頭指示を確定</button></div>
  </section></div>;
}
