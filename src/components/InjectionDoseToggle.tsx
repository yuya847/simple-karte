"use client";
import { displayText } from "@/lib/display-text";
import { useMe, useDeny } from "./RoleContext";
import { executeDeny } from "@/lib/order-execute";
import type { ExecuteProps } from "./ExecuteMenu";
import type { AdminRecord } from "@/lib/mar";
export function InjectionDoseToggle({ execute, at, time, record, onToggle, omitted = false }: { execute?: ExecuteProps; patientId: string; orderId: string; at: number; time: string; record?: AdminRecord; onToggle?: () => void; omitted?: boolean }) {
  const me = useMe();
  const denied = useDeny()("order");
  const toggle = denied ? undefined : onToggle;
  record = record?.cancellation ? undefined : record;
  if (record?.status === "実施" && (!execute || executeDeny(me.role))) return <span>✔︎ {time}</span>;
  const future = !record && at >= (execute ? Number(execute.nowTime.slice(0, 2)) * 60 + Number(execute.nowTime.slice(3, 5)) : 0);
  const skipped = record?.status === "未実施";
  return <button data-dose-menu={future ? undefined : "true"} type="button"
    disabled={future ? !toggle : !execute || !!executeDeny(me.role)}
    onClick={future ? e => { e.stopPropagation(); toggle?.(); } : undefined}
    aria-pressed={future ? omitted : undefined}
    title={displayText(future ? toggle ? omitted ? "取り消しの下書きを戻す" : "この回を取り消す（下書き）" : "投与予定の変更は医師が行います" : record ? `${skipped ? "消した回" : record.status} ${record.doneAt} ${record.by}` : "右クリックで実施・未実施を記録")}
    className={`text-[11px] ${skipped ? "opacity-40 line-through" : omitted ? "border border-dashed border-shu text-shu line-through" : ""}`}>
    {record?.status === "実施" ? "✔︎ " : skipped ? "× " : "◯ "}{time}
  </button>;
}
