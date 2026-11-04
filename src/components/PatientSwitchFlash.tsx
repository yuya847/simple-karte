"use client";

import { useEffect, useRef, useState } from "react";
import { UserRound } from "lucide-react";

/**
 * 取違い防止: when the chart's patient changes, the new patient's name, age, room and ID swing in large over
 * the chart for a moment, so a switch is never missed. Click or key dismisses it early; it never blocks input
 * for long (gone after SHOW_MS). With prefers-reduced-motion the card still appears, without the motion.
 */
const SHOW_MS = 1400;

export function PatientSwitchFlash({ patient }: { patient: { id: string; name: string; kana?: string; age: number; sex: string; room?: string; ward?: string } }) {
  const [shown, setShown] = useState<typeof patient | null>(null);
  const last = useRef<string | null>(null);
  useEffect(() => {
    if (last.current === patient.id) return;
    last.current = patient.id;
    setShown(patient);
    const t = setTimeout(() => setShown(null), SHOW_MS);
    return () => clearTimeout(t);
  }, [patient]);
  if (!shown) return null;
  const idShown = shown.id.replace(/^(er|opd):/, "");
  return (
    <div role="status" aria-live="polite" onClick={() => setShown(null)} className="karte-switch pointer-events-auto fixed inset-0 z-[70] flex items-start justify-center bg-ink/20 pt-[18vh] print:hidden">
      <div className="karte-switch-card flex items-center gap-5 rounded-2xl border-4 border-ai bg-sheet px-8 py-6 shadow-[0_24px_60px_-20px_rgba(38,34,28,0.6)]">
        <div className="grid h-16 w-16 place-items-center rounded-full bg-ai-soft text-ai">
          <UserRound size={36} />
        </div>
        <div>
          <div className="text-[12px] font-bold text-ai">患者が切り替わりました</div>
          {shown.kana && <div className="text-[12px] text-ink-faint">{shown.kana}</div>}
          <div className="text-4xl font-bold leading-tight">{shown.name}</div>
          <div className="nums mt-1 flex flex-wrap gap-x-4 text-[15px] text-ink-soft">
            <span>
              {shown.age}歳{shown.sex}
            </span>
            {shown.room && (
              <span>
                {shown.ward ? `${shown.ward} ` : ""}
                {shown.room}
              </span>
            )}
            <span>ID {idShown}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
