"use client";
import { roomLabel } from "@/lib/place-label";

import { IdCard, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { hospitalDay } from "@/lib/dates";
import type { Patient } from "@/lib/types";
import { ageSex } from "@/lib/person";

interface Props {
  beds?: { patientId?: string; room: string; bed: string }[];
  patients: Patient[];
  openIds: string[];
  onOpen: (id: string) => void;
  /** Opens the chart with 患者基本情報 (住所・連絡先・家族 …) on top. */
  onInfo?: (id: string) => void;
  onClose: () => void;
}

/** Ward patient list. Type to filter, ↑↓ to move, Enter to open in a tab. */
export function PatientPicker({ beds, patients, openIds, onOpen, onInfo, onClose }: Props) {
  const [q, setQ] = useState("");
  const [cursor, setCursor] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => input.current?.focus(), []);

  const list = useMemo(() => {
    const s = q.trim();
    if (!s) return patients;
    return patients.filter((p) => [p.name, p.kana, p.room, p.id, p.admissionDiagnosis, ...(beds ?? []).filter((b) => b.patientId === p.id).map((b) => roomLabel(b.room, b.bed))].some((f) => f.toUpperCase().includes(s.normalize("NFKC").toUpperCase())));
  }, [q, patients, beds]);

  const at = Math.min(cursor, Math.max(list.length - 1, 0));

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-ink/30 pt-[12vh]" onClick={onClose}>
      <div
        role="dialog"
        aria-label="患者を開く"
        className="w-[min(640px,92vw)] overflow-hidden rounded-xl border border-rule bg-sheet shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-rule px-4 py-3">
          <Search size={16} className="text-ink-faint" />
          <input
            ref={input}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setCursor(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setCursor(Math.min(at + 1, list.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setCursor(Math.max(at - 1, 0));
              } else if (e.key === "Enter" && list[at]) {
                onOpen(list[at].id);
              } else if (e.key === "Escape") {
                onClose();
              }
            }}
            placeholder="名前・カナ・部屋・ID で探す"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-ink-faint"
          />
          <span className="text-[11px] text-ink-faint">5階東病棟・受け持ち</span>
        </div>
        <ul className="max-h-[50vh] overflow-y-auto py-1">
          {list.map((p, i) => (
            <li key={p.id} className={`flex items-center ${i === at ? "bg-ai-soft" : ""}`}>
              <button
                type="button"
                onMouseEnter={() => setCursor(i)}
                onClick={() => onOpen(p.id)}
                className="nums grid min-w-0 flex-1 grid-cols-[3.5rem_7rem_4.5rem_1fr_auto] items-center gap-3 px-4 py-2 text-left text-sm"
              >
                <span className="text-ink-soft">{p.room}</span>
                <span className="font-bold">{p.name}</span>
                <span className="text-xs text-ink-soft">
                  {ageSex(p)}
                </span>
                <span className="truncate text-xs text-ink-soft">
                  {p.admissionDiagnosis}　入院{hospitalDay(p.admittedOn, 0)}日目
                </span>
                <span className="text-[11px] text-ink-faint">{openIds.includes(p.id) ? "開いている" : ""}</span>
              </button>
              {onInfo && (
                <button type="button" onClick={() => onInfo(p.id)} aria-label={`${p.name}の患者基本情報を開く`} title="患者基本情報（住所・連絡先・家族・保険・入院前の情報収集）を開く" className="mr-2 rounded p-1 text-ink-faint hover:bg-paper hover:text-ai pointer-coarse:p-2">
                  <IdCard size={15} />
                </button>
              )}
            </li>
          ))}
          {list.length === 0 && <li className="px-4 py-3 text-sm text-ink-faint">見つかりません</li>}
        </ul>
        <div className="border-t border-rule px-4 py-2 text-[11px] text-ink-faint">↑↓ で選ぶ・Enter で開く・Esc で閉じる。</div>
      </div>
    </div>
  );
}
