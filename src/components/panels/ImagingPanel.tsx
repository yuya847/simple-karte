"use client";

import { useMemo } from "react";
import type { CalendarDate } from "@/lib/dates";
import { collectStudies } from "@/lib/pacs/studies";
import type { HistoryEntry, Patient } from "@/lib/types";
import { PacsViewer } from "../pacs/PacsViewer";

/**
 * 放射線画像：検査の一覧・画像（PACS ビューア）・読影レポート。
 * 画像はすべてコードで作った架空の合成画像（実在の患者の画像ではない）。新しいオーダーは時刻を過ぎると画像が出て「読影待ち」になる。
 */
export function ImagingPanel({ patient, today, entries = [], nowAbs = 0 }: { patient: Patient; today: CalendarDate; entries?: HistoryEntry[]; nowAbs?: number }) {
  const studies = useMemo(() => collectStudies(patient, entries, nowAbs), [patient, entries, nowAbs]);
  if (studies.length === 0) return <p className="text-sm text-ink-faint">検査なし</p>;
  return <PacsViewer key={patient.id} patient={patient} today={today} studies={studies} />;
}
