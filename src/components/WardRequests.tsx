"use client";
import { roomLabel } from "@/lib/place-label";

import { displayText } from "@/lib/display-text";
import { BedDouble } from "lucide-react";
import { useState } from "react";
import { CHART_WARDS, type AdmissionRequest } from "@/lib/admission";
import { ageSex } from "@/lib/person";
import type { Room, WardState } from "@/lib/ward";
import { BedPicker } from "./BedPicker";
import { DenyNote, useDeny } from "./RoleContext";
import { setRequestDrag } from "./WardMap";

type Bed = { room: string; bed: string };

/**
 * 入院申込 waiting on this floor: the ward decides the bed and takes the patient in (病棟のカルテができる).
 * Shown above 病棟マップ and the floor's patient list.
 */
export function WardRequests({ floor, requests, ward, rooms, fmtDay, onAccept, dropped = null }: { floor: string; requests: AdmissionRequest[]; ward: WardState; rooms: Room[]; fmtDay: (d: number) => string; onAccept: (r: AdmissionRequest, bed: Bed) => void; dropped?: { id: string; bed: Bed } | null }) {
  const deny = useDeny()("bed.assign");
  const [open, setOpen] = useState<string | null>(null);
  const [bed, setBed] = useState<Bed | null>(null);
  // A request dropped on an empty bed of the map: it opens with that bed chosen (taking it in is still the button).
  const [seen, setSeen] = useState(dropped);
  if (dropped !== seen) {
    setSeen(dropped);
    if (dropped) {
      setOpen(dropped.id);
      setBed(dropped.bed);
    }
  }
  const mine = requests.filter((r) => r.status === "申込" && r.ward === floor).sort((a, b) => (a.urgency === b.urgency ? a.when.day - b.when.day : a.urgency === "緊急" ? -1 : 1));
  if (!mine.length) return null;
  const canChart = CHART_WARDS.includes(floor);
  return (
    <section aria-label="入院申込" className="shrink-0 border-b border-rule bg-yamabuki-soft/40 px-5 py-2 text-[12px]">
      <h2 className="mb-1 flex items-center gap-1.5 font-bold text-yamabuki">
        <BedDouble size={14} />
        入院申込（{mine.length}件）・ベッドを決めると入院になります
      </h2>
      <ul className="space-y-1.5">
        {mine.map((r) => (
          <li key={r.id} className="rounded-md border border-rule bg-sheet px-3 py-2">
            <div
              draggable={canChart && !deny}
              onDragStart={(e) => setRequestDrag(e.dataTransfer, r.id, r.sex)}
              className={`nums flex flex-wrap items-baseline gap-x-3 gap-y-0.5 ${canChart && !deny ? "cursor-grab active:cursor-grabbing" : ""}`}
            >
              <span className={`rounded px-1.5 font-bold ${r.urgency === "緊急" ? "bg-shu-soft text-shu" : "bg-paper text-ink-soft"}`}>{r.urgency}</span>
              <b>{r.name}</b>
              <span>{ageSex(r)}</span>
              <span>
                {fmtDay(r.when.day)} {r.when.time ?? ""}
              </span>
              <span>{r.diagnosis}（{r.purpose}）</span>
              <span className="text-ink-soft">
                {r.roomWish}・安静度 {r.rest}・{r.isolation === "なし" ? "感染対策なし" : r.isolation}
                {r.allergies.length > 0 && <b className="ml-1 text-shu">アレルギー {r.allergies.join("、")}</b>}
              </span>
              <span className="text-ink-faint">
                {displayText(r.from.kind === "er" ? "救急外来" : "外来")}・{displayText(r.by)}
              </span>
              {open !== r.id && (
                <button
                  type="button"
                  disabled={!canChart}
                  title={canChart ? undefined : "この試作で病棟のカルテを作れるのは5階東病棟だけです"}
                  onClick={() => {
                    setOpen(r.id);
                    setBed(null);
                  }}
                  className="ml-auto rounded-md bg-ai px-3 py-1 font-bold text-white disabled:opacity-40"
                >
                  ベッドを決める
                </button>
              )}
            </div>
            {r.note && <p className="mt-0.5 text-ink-soft">申し送り：{displayText(r.note)}</p>}
            {open === r.id && (
              <div className="mt-2 space-y-2">
                <BedPicker ward={ward} rooms={rooms} sex={r.sex} value={bed} onChange={setBed} />
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" disabled={!bed || !!deny} onClick={() => {
                      if (!bed) return;
                      onAccept(r, bed);
                      setOpen(null);
                    }} className="rounded-md bg-ai px-4 py-1.5 text-sm font-bold text-white disabled:opacity-40">
                    {bed ? `${roomLabel(bed.room, bed.bed)} で入院を受ける` : "ベッドを選んでください"}
                  </button>
                  <button type="button" onClick={() => setOpen(null)} className="rounded-md border border-rule px-3 py-1.5 text-ink-soft">
                    やめる
                  </button>
                  <DenyNote action="bed.assign" />
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
