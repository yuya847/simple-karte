"use client";

import { useState } from "react";
import { addDays, formatShort, type CalendarDate } from "@/lib/dates";
import { examAt, findRegion } from "@/lib/exams";
import type { HistoryEntry, ImagingOrder, ImagingStudy, Patient } from "@/lib/types";

/** Radiology studies with their reports. Images are schematic placeholders, not real images. */
export function ImagingPanel({ patient, today, entries = [], nowAbs = 0 }: { patient: Patient; today: CalendarDate; entries?: HistoryEntry[]; nowAbs?: number }) {
  // Studies ordered in this app: done (time passed) ones wait for the report; ahead ones are booked.
  const ordered: ImagingStudy[] = entries.flatMap((e) => {
    if (e.kind !== "order" || e.order.type !== "imaging" || e.status === "中止") return [];
    const o = e.order as ImagingOrder;
    const at = examAt(o, e.day * 1440 + Number(e.time.slice(0, 2)) * 60 + Number(e.time.slice(3)));
    const done = at <= nowAbs;
    return [
      {
        id: e.id,
        day: Math.floor(at / 1440),
        modality: o.modality === "ポータブルX線" ? "X線" : o.modality,
        region: `${findRegion(o.region)?.name ?? o.region}${o.contrast ? `（${o.contrast}）` : ""}`,
        report: done ? "撮影済み。読影をお待ちください（この試作では読影レポートは架空の記録だけです）。" : `予約：${o.when.priority === "至急" ? "至急" : `${o.when.time ?? ""}`}　目的：${o.purpose}`,
        reader: done ? "（読影待ち）" : "（未実施）",
      },
    ];
  });
  const studies = [...patient.imaging, ...ordered].sort((a, b) => b.day - a.day);
  const [selectedId, setSelectedId] = useState(studies[0]?.id);
  const selected = studies.find((s) => s.id === selectedId);

  if (studies.length === 0) return <p className="text-sm text-ink-faint">検査なし</p>;

  return (
    <div className="grid grid-cols-[180px_1fr] gap-4">
      <ul className="space-y-1">
        {studies.map((s) => (
          <li key={s.id}>
            <button
              type="button"
              onClick={() => setSelectedId(s.id)}
              className={`nums w-full rounded-md px-2 py-1.5 text-left text-[13px] ${s.id === selectedId ? "bg-ai text-white" : "hover:bg-paper"}`}
            >
              <div className={`text-[11px] ${s.id === selectedId ? "text-white/80" : "text-ink-faint"}`}>{formatShort(addDays(today, s.day))}</div>
              {s.modality} {s.region}
            </button>
          </li>
        ))}
      </ul>
      {selected && (
        <div>
          <Schematic study={selected} />
          <h4 className="mt-3 text-sm font-bold">読影レポート</h4>
          <p className="mt-1 text-[13px] leading-relaxed">{selected.report}</p>
          <p className="mt-1 text-[11px] text-ink-faint">{selected.reader}</p>
        </div>
      )}
    </div>
  );
}

function Schematic({ study }: { study: ImagingStudy }) {
  const chest = study.region.includes("胸部");
  return (
    <figure className="overflow-hidden rounded-md bg-[#141414]">
      <svg viewBox="0 0 320 240" className="block h-auto w-full" role="img" aria-label="模式図（実際の画像ではありません）">
        <defs>
          <radialGradient id="glow" cx="50%" cy="45%" r="60%">
            <stop offset="0%" stopColor="#5a5a5a" />
            <stop offset="100%" stopColor="#1a1a1a" />
          </radialGradient>
        </defs>
        <rect width="320" height="240" fill="url(#glow)" />
        {chest ? (
          <g fill="#0c0c0c" opacity="0.85">
            <ellipse cx="118" cy="122" rx="46" ry="78" />
            <ellipse cx="202" cy="122" rx="46" ry="78" />
            <ellipse cx="172" cy="150" rx="34" ry="40" fill="#8a8a8a" opacity="0.5" />
            <rect x="152" y="30" width="16" height="190" fill="#9a9a9a" opacity="0.35" />
          </g>
        ) : (
          <g fill="#a0a0a0" opacity="0.55">
            <rect x="120" y="20" width="22" height="200" rx="10" />
            <rect x="170" y="20" width="12" height="200" rx="6" />
            <ellipse cx="150" cy="120" rx="70" ry="104" fill="#6a6a6a" opacity="0.35" />
          </g>
        )}
        <text x="10" y="20" fill="#d0d0d0" fontSize="11">
          {study.modality} {study.region}
        </text>
        <text x="10" y="230" fill="#9a9a9a" fontSize="10">
          模式図（架空。実際の画像ではありません）
        </text>
      </svg>
    </figure>
  );
}
