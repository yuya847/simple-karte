"use client";
import { useState } from "react";
import { ExecutionUndo } from "./ExecutionUndo";
import { useMe } from "./RoleContext";
import { executeDeny } from "@/lib/order-execute";
import { marKey } from "@/lib/mar";
import type { ExecuteProps } from "./ExecuteMenu";
import type { AdminRecord } from "@/lib/mar";
export function InjectionDoseToggle({ execute, patientId, orderId, at, time, record }: { execute?: ExecuteProps; patientId: string; orderId: string; at: number; time: string; record?: AdminRecord }) {
  const me = useMe();
  const [undo, setUndo] = useState(false);
  if (record?.status === "実施" && !record.cancellation && (!execute || executeDeny(me.role))) return <span>✓ {time}</span>;
  if (record?.status === "実施" && !record.cancellation) return <span className="inline-flex flex-col items-start" onClick={(e) => e.stopPropagation()}>
    <button type="button" disabled={!execute || !!executeDeny(me.role)} title="未実施に戻す" onClick={() => setUndo(!undo)}>✓ {time}</button>
    {undo && execute && <ExecutionUndo action="mar" patient={patientId} detail={`${orderId} ${time}`} onUndo={(_by, _at, reason) => { execute.onVoid(record, reason); setUndo(false); }} />}
  </span>;
  const skipped = record?.status === "未実施" && !record.cancellation;
  // A past dose with no record: shown as given (架空の記録、like the oral calendar), faint, so a day of doses
  // does not look blank; a click still skips it (records 未実施).
  const nowAbs = execute ? Number(execute.nowTime.slice(0, 2)) * 60 + Number(execute.nowTime.slice(3, 5)) : null;
  const assumedGiven = !record && nowAbs !== null && at < nowAbs;
  return <button type="button" disabled={!execute || !!executeDeny(me.role)} title={record ? `${skipped ? "消した回" : record.status} ${record.doneAt} ${record.by}${record.cancellation ? `（取り消し：${record.cancellation.reason || "理由なし"}）` : ""}` : assumedGiven ? "記録のない過去の回（架空のデータでは実施済みとして扱う）。クリックでこの回を未実施に" : "クリックでこの回をスキップ"} className={`text-[11px] ${skipped ? "opacity-40 line-through" : assumedGiven ? "text-wakatake/70" : ""}`} onClick={(e) => {
    e.stopPropagation();
    if (!execute) return;
    if (skipped && record) execute.onVoid(record, "その他");
    else execute.onRecord({ key: marKey(orderId, at), orderId, patientId, at, status: "未実施", doneAt: execute.nowTime, by: me.name, reason: "医師の指示で中止・延期", note: "注射カレンダーでこの回をスキップ", checked: { patient: false, label: null } });
  }}>{record?.status === "実施" || assumedGiven ? "✓ " : ""}{time}</button>;
}
