"use client";
import { useMe } from "./RoleContext";
import { executeDeny } from "@/lib/order-execute";
import { marKey } from "@/lib/mar";
import type { ExecuteProps } from "./ExecuteMenu";
import type { AdminRecord } from "@/lib/mar";
export function InjectionDoseToggle({ execute, patientId, orderId, at, time, record }: { execute?: ExecuteProps; patientId: string; orderId: string; at: number; time: string; record?: AdminRecord }) {
  const me = useMe();
  const skipped = record?.status === "未実施";
  return <button type="button" disabled={!execute || !!executeDeny(me.role) || record?.status === "実施"} title={record ? `${record.status} ${record.doneAt} ${record.by}` : "クリックでこの回をスキップ"} className={`text-[11px] ${skipped ? "opacity-40 line-through" : ""}`} onClick={(e) => {
    e.stopPropagation();
    if (!execute) return;
    if (skipped && record) execute.onVoid(record, "その他");
    else execute.onRecord({ key: marKey(orderId, at), orderId, patientId, at, status: "未実施", doneAt: execute.nowTime, by: me.name, reason: "医師の指示で中止・延期", note: "注射カレンダーでこの回をスキップ", checked: { patient: false, label: null } });
  }}>{record?.status === "実施" ? "✓ " : ""}{time}</button>;
}
