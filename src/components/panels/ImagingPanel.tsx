"use client";

import { useMemo } from "react";
import type { CalendarDate } from "@/lib/dates";
import { collectStudies } from "@/lib/pacs/studies";
import type { RisDesk } from "@/lib/ris";
import type { HistoryEntry, Patient } from "@/lib/types";
import { PacsViewer } from "../pacs/PacsViewer";

/**
 * 放射線画像：検査の一覧・画像（PACS ビューア）・読影レポート。
 * 画像は、公開データ（Wikimedia Commons ほか）の教材用の画像を架空の患者に割り当てたもの（src/lib/pacs/photos.ts。この患者のものではない）か、
 * コードで作った架空の合成画像。どちらも実在の患者の画像ではない。放射線部の記録（ris）があれば、画像は放射線部が
 * PACS へ送ったあとに出て、読影レポートも放射線部のもの。ないときは、新しいオーダーは時刻を過ぎると画像が出て「読影待ち」になる。
 */
export function ImagingPanel({ patient, today, entries = [], nowAbs = 0, focus, ris }: { patient: Patient; today: CalendarDate; entries?: HistoryEntry[]; nowAbs?: number; focus?: string; ris?: RisDesk }) {
  const studies = useMemo(() => collectStudies(patient, entries, nowAbs, ris), [patient, entries, nowAbs, ris]);
  if (studies.length === 0) return <p className="text-sm text-ink-faint">検査なし</p>;
  return <PacsViewer key={`${patient.id}-${focus ?? ""}`} patient={patient} today={today} studies={studies} focus={focus} />;
}
