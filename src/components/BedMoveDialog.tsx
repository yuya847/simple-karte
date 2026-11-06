"use client";
import { roomLabel } from "@/lib/place-label";
import { DayInput } from "./DayInput";
import { TimeInput } from "@/components/TimeInput";

import { ArrowRight, X } from "lucide-react";
import { useState } from "react";
import { bedProblem } from "@/lib/admission";
import { FLOORS, floorOf, isolationFor, occupant, type WardState } from "@/lib/ward";
import type { Patient } from "@/lib/types";
import { BedPicker } from "./BedPicker";
import { DenyNote, useDeny } from "./RoleContext";

export interface BedMove {
  patientId: string;
  from: { room: string; bed: string };
  to: { room: string; bed: string };
  kind: "転床" | "転棟";
  reason: string;
  /** Booked for a later time (from the 移動・食事 calendar): the time of day. */
  time?: string;
  day?: number;
}

/**
 * 転棟・転床: choose the floor and an empty bed (shared rooms are single-sex), write the reason, and
 * confirm. A patient on contact precautions going into a shared room is asked about (cohorting).
 */
export function BedMoveDialog({ patient, from, initial, allBeds, onCancel, onMove, reserve }: { patient: Patient; from: { room: string; bed: string }; initial?: { room: string; bed: string }; allBeds: WardState; onCancel: () => void; onMove: (m: BedMove) => void; reserve?: { label: string; day?: number } }) {
  const [time, setTime] = useState("");
  const deny = useDeny()("bed.move");
  const [floor, setFloor] = useState(initial ? floorOf(initial.room) : floorOf(from.room));
  const allRooms = FLOORS.flatMap((f) => f.rooms);
  // Why a bed cannot take this patient (taken, or a shared room of the other sex), or null.
  const problemOf = (b: { room: string; bed: string }) => {
    const r = allRooms.find((x) => x.no === b.room);
    if (!r) return "その部屋はありません";
    if (occupant(allBeds.beds, b.room, b.bed)) return "空いていません";
    return bedProblem({ beds: allBeds.beds, patient: allBeds.patient }, r, patient.sex);
  };
  const dropped = initial ? problemOf(initial) : null;
  const [to, setTo] = useState<{ room: string; bed: string } | null>(initial && !dropped ? initial : null);
  const [day, setDay] = useState(reserve?.day ?? 0);
  const [reason, setReason] = useState("");
  const [ok, setOk] = useState(false);
  const rooms = FLOORS.find((f) => f.name === floor)!.rooms;
  const room = to ? allRooms.find((r) => r.no === to.room) : undefined;
  const toProblem = to ? problemOf(to) : null;
  const iso = isolationFor(patient.infections);
  const askIso = !!iso && room?.kind === "4床室";
  const kind: BedMove["kind"] = to && floorOf(to.room) !== floorOf(from.room) ? "転棟" : "転床";
  const label = (b: { room: string; bed: string }) => `${floorOf(b.room)} ${roomLabel(b.room, b.bed)}`;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/30 p-4" role="dialog" aria-label="転棟・転床">
      <div className="w-full max-w-2xl rounded-lg border border-rule bg-sheet p-4 text-[13px] shadow-xl">
        <div className="mb-3 flex items-center gap-2">
          <h2 className="text-base font-bold">
            転棟・転床{reserve ? `の予約（${reserve.label}）` : ""}：{patient.name}
          </h2>
          <button type="button" onClick={onCancel} aria-label="閉じる" className="ml-auto rounded p-1 text-ink-faint hover:text-ink">
            <X size={16} />
          </button>
        </div>
        <p className="nums mb-2 flex items-center gap-2">
          {label(from)}
          <ArrowRight size={14} />
          <b className={to ? "text-ai" : "text-ink-faint"}>{to ? `${label(to)}（${kind}）` : "移動先を選ぶ"}</b>
        </p>
        {initial && dropped && (
          <p className="mb-2 rounded bg-shu-soft px-2 py-1 font-bold text-shu">
            {roomLabel(initial.room, initial.bed)} には移せません：{dropped}。下から空いているベッドを選んでください。
          </p>
        )}
        <label className="mb-2 flex items-center gap-1.5 text-ink-soft">
          病棟
          <select
            value={floor}
            onChange={(e) => {
              setFloor(e.target.value);
              setTo(null);
            }}
            aria-label="移動先の病棟"
            className="rounded border border-rule bg-paper px-2 py-1 font-bold text-ink"
          >
            {FLOORS.map((f) => (
              <option key={f.name}>{f.name}</option>
            ))}
          </select>
        </label>
        <BedPicker ward={{ beds: allBeds.beds, patient: allBeds.patient }} rooms={rooms} sex={patient.sex} value={to} onChange={setTo} />
        <label className="mt-3 flex items-center gap-1.5">
          理由
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="例：重症観察のためナースステーションの近くへ" className="flex-1 rounded border border-rule bg-paper px-2 py-1" />
        </label>
        {reserve && (
          <label className="mt-2 flex items-center gap-1.5">
            <DayInput label="移動の日付" value={day} onChange={setDay} />
            時刻
            <TimeInput value={time} onChange={(e) => setTime(e.target.value)} aria-label="移動の時刻" className="rounded border border-rule bg-paper px-1 py-0.5" />
            <span className="text-[11px] text-ink-faint">予約は下書きになり、確定したあと当日に病棟で「実施」します。</span>
          </label>
        )}
        {askIso && (
          <label className="mt-2 flex items-center gap-1.5 text-yamabuki">
            <input type="checkbox" checked={ok} onChange={() => setOk(!ok)} className="accent-yamabuki" />
            {iso}の患者を4床室へ移します（同じ菌の患者を同じ部屋にする場合など）。承知して移す
          </label>
        )}
        <div className="mt-4 flex items-center gap-2">
          <DenyNote action="bed.move" />
          <button type="button" onClick={onCancel} className="ml-auto rounded-md border border-rule px-3 py-1.5 text-ink-soft">
            やめる
          </button>
          <button
            type="button"
            disabled={!to || !!toProblem || !reason.trim() || (askIso && !ok) || (!!reserve && !time) || (!reserve && !!deny)}
            onClick={() => to && onMove({ patientId: patient.id, from, to, kind, reason: reason.trim(), ...(reserve ? { time, day } : {}) })}
            className="rounded-md bg-ai px-4 py-1.5 font-bold text-white disabled:opacity-40"
          >
            {reserve ? `${kind}の予約を保存する` : `${kind}を確定`}
          </button>
        </div>
      </div>
    </div>
  );
}
