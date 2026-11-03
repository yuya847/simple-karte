"use client";

import { bedProblem } from "@/lib/admission";
import type { Sex } from "@/lib/types";
import { ROOMS, emptyBeds, type Room, type WardState } from "@/lib/ward";

/**
 * Empty beds of a floor as buttons. Shared rooms are single-sex, so a bed in a room of the other sex
 * cannot be chosen (the reason is shown). Used to take in an admission and to move a patient.
 */
export function BedPicker({ ward, rooms = ROOMS, sex, value, onChange }: { ward: WardState; rooms?: Room[]; sex: Sex; value: { room: string; bed: string } | null; onChange: (v: { room: string; bed: string }) => void }) {
  const beds = emptyBeds(ward.beds, rooms);
  if (!beds.length) return <p className="text-[12px] text-shu">空いているベッドがありません。</p>;
  return (
    <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6">
      {beds.map(({ room, bed }) => {
        const problem = bedProblem(ward, room, sex);
        const chosen = value?.room === room.no && value.bed === bed;
        return (
          <button
            key={`${room.no}${bed}`}
            type="button"
            disabled={!!problem}
            aria-pressed={chosen}
            onClick={() => onChange({ room: room.no, bed })}
            title={problem ?? undefined}
            className={`nums rounded-md border px-2 py-1.5 text-left text-[12px] pointer-coarse:py-2.5 ${
              chosen ? "border-ai bg-ai text-white" : problem ? "cursor-not-allowed border-rule-soft text-ink-faint/60" : "border-rule bg-sheet hover:border-ai"
            }`}
          >
            <b>
              {room.no}
              {bed && `-${bed}`}
            </b>
            <div className={`text-[10px] ${chosen ? "text-white/80" : ""}`}>{problem ?? room.kind}</div>
          </button>
        );
      })}
    </div>
  );
}
