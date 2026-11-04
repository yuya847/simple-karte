"use client";

// The records of the system itself (監査ログ・マスタ管理・スキャン・署名), for the workspace. WardApp spreads
// `states` into useWorkspace so they are saved with the other records of the day.

import { useMemo, useState } from "react";
import { auditForSave, auditRestore, useAudit } from "./audit";
import { restoreMasterLog, useMasterLocal, useMasterLog } from "./master-local";
import { validScans, type ScanDoc } from "./scans";
import { validSignatures, type SignRecord } from "./esign";

export function useInfra() {
  // 監査ログ: the newest events go into the saved records, and come back first when the page opens.
  const events = useAudit();
  const auditSaved = useMemo(() => auditForSave(events), [events]);
  // マスタ管理: the history of the hospital's fields, and what it makes of them (for the order checks).
  const masterLog = useMasterLog();
  const masterOv = useMasterLocal();
  // スキャン取込: the documents taken in today (kept small; see scans.ts for the limits).
  const [scans, setScans] = useState<ScanDoc[]>([]);
  // 電子署名（模擬）: the signatures (no keys: they stay in the browser that made them).
  const [signatures, setSignatures] = useState<SignRecord[]>([]);
  return {
    masterLog,
    masterOv,
    scans,
    setScans,
    signatures,
    setSignatures,
    /** For useWorkspace (the names must stay the same). */
    states: {
      audit: [auditSaved, auditRestore],
      masterLog: [masterLog, restoreMasterLog],
      scans: [scans, (v: unknown) => setScans(validScans(v))],
      signatures: [signatures, (v: unknown) => setSignatures(validSignatures(v))],
    } as Record<string, [unknown, (v: never) => void]>,
  };
}
