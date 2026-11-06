"use client";

import { birthDateOf, formatBirth } from "@/lib/patient-contacts";
import type { CalendarDate } from "@/lib/dates";
import { putWork, type RisRow } from "@/lib/ris";
import { useDeny, useMe } from "./RoleContext";
import type { OnDesk } from "./RisExam";

export function IdentityCheck({ r, onDesk, nowTime, today }: { r: RisRow; onDesk: OnDesk; nowTime: string; today?: CalendarDate }) {
  const me = useMe();
  const deny = useDeny()("ris.exam");
  return <label className="flex items-center gap-2 text-[12px]"><input type="checkbox" checked={!!r.work?.identityChecked} disabled={!!deny || !!r.work?.done} onChange={(e) => onDesk((d) => putWork(d, r, (w) => ({ ...w, identityChecked: e.target.checked ? { day: 0, time: nowTime, by: me.name } : undefined })))} />氏名・生年月日・リストバンドを確認した（{r.name}　{r.patientId}{today ? `　${formatBirth(birthDateOf({ id: r.patientId, age: r.age }, today))}` : ""}）</label>;
}
