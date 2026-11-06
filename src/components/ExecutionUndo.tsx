"use client";

import { displayText } from "@/lib/display-text";
import type { ExecutionCancellation } from "@/lib/mar";
import { useState } from "react";
import { can, type Action } from "@/lib/roles";
import { auditLog } from "@/lib/audit";
import { useMe } from "./RoleContext";

/** Department records retain their withdrawn values in their own history. */
export function ExecutionUndo({ action, patient, detail, onUndo }: { action: Action; patient: string; detail: string; onUndo: (by: string, at: string, reason: string) => void }) {
  const me = useMe();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  if (!can(me.role, action)) return null;
  return <span className="inline-flex flex-wrap items-center gap-1 text-[11px]">
    <button type="button" className="text-shu underline" onClick={() => {
      if (!open) { setOpen(true); return; }
      const at = new Date().toISOString();
      onUndo(me.name, at, reason);
      auditLog({ role: me.role, actor: me.name, action: "未実施に戻した", patient, detail: `${detail}　理由：${reason.trim() || "なし"}` });
      setOpen(false); setReason("");
    }}>未実施に戻す</button>
    {open && <><input aria-label="戻す理由（任意）" placeholder="理由（任意）" value={reason} onChange={(e) => setReason(e.target.value)} className="rounded border border-rule bg-paper px-1" /><button type="button" onClick={() => setOpen(false)}>やめる</button></>}
  </span>;
}

export function ExecutionHistory({ records }: { records?: ExecutionCancellation[] }) {
  if (!records?.length) return null;
  return <span className="block text-[10px] text-ink-faint" title={displayText(records.map((r) => `${r.at} ${r.by} ${r.reason || "理由なし"}`).join("／"))}>
    {records.map((r, i) => <span key={i} className="block">取り消し {r.at} {displayText(r.by)}（{displayText(r.reason || "理由なし")}）</span>)}
  </span>;
}
