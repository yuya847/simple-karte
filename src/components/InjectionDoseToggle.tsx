"use client";
import { displayText } from "@/lib/display-text";
import { useMe } from "./RoleContext";
import { executeDeny } from "@/lib/order-execute";
import type { ExecuteProps } from "./ExecuteMenu";
import type { AdminRecord } from "@/lib/mar";
export function InjectionDoseToggle({ execute, at, time, record }: { execute?: ExecuteProps; patientId: string; orderId: string; at: number; time: string; record?: AdminRecord }) {
  const me = useMe();
  record = record?.cancellation ? undefined : record;
  if (record?.status === "実施" && (!execute || executeDeny(me.role))) return <span>✓ {time}</span>;
  const skipped = record?.status === "未実施" && !record.cancellation;
  // A past dose with no record: shown as given (架空の記録、like the oral calendar), faint, so a day of doses
  // does not look blank; a click opens the execution menu.
  const nowAbs = execute ? Number(execute.nowTime.slice(0, 2)) * 60 + Number(execute.nowTime.slice(3, 5)) : null;
  const assumedGiven = !record && nowAbs !== null && at < nowAbs;
  return <button data-dose-menu="true" type="button" disabled={!execute || !!executeDeny(me.role)} title={displayText(record ? `${skipped ? "消した回" : record.status} ${record.doneAt} ${record.by}${record.cancellation ? `（取り消し：${record.cancellation.reason || "理由なし"}）` : ""}` : assumedGiven ? "記録のない過去の回（実施済みとして扱う）。クリックで実施・未実施のメニューを開く" : "クリックで実施・未実施のメニューを開く")} className={`text-[11px] ${skipped ? "opacity-40 line-through" : assumedGiven ? "text-wakatake/70" : ""}`}>{record?.status === "実施" || assumedGiven ? "✓ " : ""}{time}</button>;
}
