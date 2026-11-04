"use client";

// The records of the system itself (監査ログ・マスタ管理・スキャン・署名), for the workspace. WardApp spreads
// `states` into useWorkspace so they are saved with the other records of the day.

import { useMemo } from "react";
import { auditForSave, auditRestore, useAudit } from "./audit";
import { restoreMasterLog, useMasterLocal, useMasterLog } from "./master-local";

export function useInfra() {
  // 監査ログ: the newest events go into the saved records, and come back first when the page opens.
  const events = useAudit();
  const auditSaved = useMemo(() => auditForSave(events), [events]);
  // マスタ管理: the history of the hospital's fields, and what it makes of them (for the order checks).
  const masterLog = useMasterLog();
  const masterOv = useMasterLocal();
  return {
    masterLog,
    masterOv,
    /** For useWorkspace (the names must stay the same). */
    states: {
      audit: [auditSaved, auditRestore],
      masterLog: [masterLog, restoreMasterLog],
    } as Record<string, [unknown, (v: never) => void]>,
  };
}
