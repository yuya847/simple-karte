"use client";

import { displayText } from "@/lib/display-text";
import { ClipboardPen } from "lucide-react";
import { useEffect, useRef, useState, type MouseEvent, type PointerEvent } from "react";
import {
  FREEDOM,
  OBSERVE,
  PRECAUTIONS,
  RESCUE_KINDS,
  RESCUE_NOTE,
  SEVERITY,
  SHIFT_LABEL,
  applyToMany,
  changedRows,
  currentShift,
  draftRows,
  inForce,
  lastBefore,
  shiftKey,
  statusCounts,
  statusIssues,
  type PatientStatus,
  type Precaution,
  type RescueKind,
  type ShiftName,
  type StatusBook,
  type StatusSheet,
} from "@/lib/ward-status";
import { pickRange } from "./OrderSheet";
import { useMe } from "./RoleContext";
import { PickSelect, type Pick } from "./WardMap";

export interface StatusPatient {
  id: string;
  name: string;
  room: string;
  infections: string[];
  rescue?: RescueKind;
}

type Field = "severity" | "observe" | "freedom" | "rescue";
const FIELDS: { key: Field; label: string; options: { key: string; note: string }[] }[] = [
  { key: "severity", label: "重症度", options: [...SEVERITY] },
  { key: "observe", label: "観察の程度", options: [...OBSERVE] },
  { key: "freedom", label: "生活の自由度", options: [...FREEDOM] },
  { key: "rescue", label: "救護区分", options: RESCUE_KINDS.map((k) => ({ key: k, note: RESCUE_NOTE[k] })) },
];

/** One field of the row as a patch (the value is one of the field's options). */
const patchOf = (k: Field, v: string | undefined) => ({ [k]: v }) as Partial<Omit<PatientStatus, "precautions">>;

const SHIFTS: { day: number; shift: ShiftName; label: string }[] = [
  { day: -1, shift: "night", label: "昨日の夜勤" },
  { day: 0, shift: "day", label: "今日の日勤" },
  { day: 0, shift: "night", label: "今日の夜勤" },
];

function Table({ patients, book, day, shift, nowTime, canType, onRegister }: { patients: StatusPatient[]; book: StatusBook; day: number; shift: ShiftName; nowTime: string; canType: boolean; onRegister: (sheet: StatusSheet, changed: string[]) => void }) {
  const me = useMe();
  const now = inForce(book, day, shift);
  const before = lastBefore(book, day, shift);
  const [rows, setRows] = useState<Record<string, PatientStatus>>(() => draftRows(patients, now));
  const [picked, setPicked] = useState<string[]>([]);
  // Pressing a row picks it (Shift: every row from the last one pressed); running down the check column picks
  // (or unpicks, when the first row was picked) every row it passes.
  const [anchor, setAnchor] = useState<string | null>(null);
  const drag = useRef<boolean | null>(null);
  useEffect(() => {
    const up = () => {
      drag.current = null;
    };
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, []);
  const pickOne = (id: string, on: boolean) => setPicked((x) => (on ? (x.includes(id) ? x : [...x, id]) : x.filter((y) => y !== id)));
  const pressRow = (id: string, e: MouseEvent) => {
    if (!canType || (e.target as Element).closest("select, button, input, a, label, [data-pick-cell]")) return;
    if (e.shiftKey && anchor) {
      const ids = pickRange(
        patients.map((p) => p.id),
        anchor,
        id,
      );
      setPicked((x) => [...new Set([...x, ...ids])]);
    } else pickOne(id, !picked.includes(id));
    setAnchor(id);
  };
  const startRun = (id: string, e: PointerEvent<HTMLTableCellElement>) => {
    if (!canType || e.button !== 0) return;
    e.preventDefault();
    // A finger keeps the pointer on the first cell unless released.
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    const on = !picked.includes(id);
    drag.current = on;
    pickOne(id, on);
    setAnchor(id);
  };
  const issues = statusIssues(rows, patients);
  const changed = changedRows(rows, now);
  const set = (ids: string[], patch: Parameters<typeof applyToMany>[2]) => setRows((r) => applyToMany(r, ids, patch));
  const sel = "rounded border border-rule bg-sheet px-1 py-0.5 text-[12px]";
  const counts = now ? statusCounts(now) : null;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-rule bg-sheet px-3 py-2 text-[12px]">
        {now ? (
          <span className="font-bold text-wakatake">
            登録済み {now.at.time} {displayText(now.by)}
          </span>
        ) : (
          <span className="text-yamabuki">この勤務帯はまだ登録していません</span>
        )}
        {before && canType && (
          <button type="button" onClick={() => setRows(draftRows(patients, before.sheet))} className="rounded border border-rule px-2 py-0.5 hover:border-ai">
            {before.day === -1 ? "昨日" : before.day === 0 ? "今日" : `${-before.day}日前`}の{SHIFT_LABEL[before.shift]}（{before.sheet.at.time} {displayText(before.sheet.by)}）から写す
          </button>
        )}
        {canType && (
          <span className="flex flex-wrap items-center gap-1">
            <span className="text-ink-soft">選んだ {picked.length}人に</span>
            {FIELDS.map((f) => (
              <select key={f.key} value="" disabled={!picked.length} onChange={(e) => e.target.value && set(picked, patchOf(f.key, e.target.value))} aria-label={`選んだ患者の${f.label}`} className={sel}>
                <option value="">{f.label}</option>
                {f.options.map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.key}
                  </option>
                ))}
              </select>
            ))}
            {PRECAUTIONS.map((p) => (
              <button key={p} type="button" disabled={!picked.length} onClick={() => set(picked, { precaution: { kind: p, on: true } })} className="rounded border border-rule px-1.5 py-0.5 disabled:opacity-40">
                ＋{p.replace("予防策", "")}
              </button>
            ))}
          </span>
        )}
        {canType && (
          <button
            type="button"
            disabled={!changed.length && !!now}
            onClick={() => {
              onRegister({ rows, by: me.name, at: { day: 0, time: nowTime } }, changed);
              setPicked([]);
            }}
            className="ml-auto rounded-md bg-ai px-3 py-1 font-bold text-white disabled:opacity-40"
          >
            {now ? `変えた ${changed.length}人を登録しなおす` : `${patients.length}人を登録する`}（{me.name}）
          </button>
        )}
      </div>
      <table className="nums w-full border-collapse rounded-lg bg-sheet text-[12px]">
        <thead>
          <tr className="border-b border-rule text-left text-ink-soft">
            <th className="w-8 px-1.5 py-1.5">
              <input type="checkbox" aria-label="全員を選ぶ" checked={picked.length === patients.length && patients.length > 0} onChange={(e) => setPicked(e.target.checked ? patients.map((p) => p.id) : [])} className="accent-ai" disabled={!canType} />
            </th>
            <th className="px-1.5">患者</th>
            {FIELDS.map((f) => (
              <th key={f.key} className="px-1.5">
                {f.label}
              </th>
            ))}
            <th className="px-1.5">感染経路別予防策</th>
            <th className="px-1.5">確かめ</th>
          </tr>
        </thead>
        <tbody>
          {patients.map((p) => {
            const r = rows[p.id] ?? { precautions: [] };
            const mine = issues.filter((x) => x.patientId === p.id);
            const on = picked.includes(p.id);
            return (
              <tr
                key={p.id}
                onMouseDown={(e) => {
                  if (e.shiftKey && canType) e.preventDefault();
                }}
                onClick={(e) => pressRow(p.id, e)}
                className={`border-b border-rule-soft align-top ${canType ? "cursor-pointer" : ""} ${on ? "bg-ai-soft/60" : changed.includes(p.id) && now ? "bg-yamabuki-soft/40" : ""}`}
              >
                <td
                  data-pick-cell
                  onPointerDown={(e) => startRun(p.id, e)}
                  onPointerEnter={() => {
                    if (drag.current !== null) pickOne(p.id, drag.current);
                  }}
                  className={`px-1.5 py-1 ${canType ? "touch-none" : ""}`}
                >
                  <input type="checkbox" aria-label={`${p.name}を選ぶ`} checked={on} onChange={() => pickOne(p.id, !on)} className="pointer-events-none accent-ai" disabled={!canType} />
                </td>
                <td className="whitespace-nowrap px-1.5 py-1">
                  {p.room} <b>{p.name}</b>
                  {p.infections.length > 0 && <div className="text-[10px] text-fuji">{p.infections.join("、")}</div>}
                </td>
                {FIELDS.map((f) => (
                  <td key={f.key} className="px-1.5 py-1">
                    <select value={r[f.key] ?? ""} disabled={!canType} onChange={(e) => setRows((all) => ({ ...all, [p.id]: { ...r, ...patchOf(f.key, e.target.value || undefined) } }))} aria-label={`${p.name}の${f.label}`} className={sel}>
                      <option value="">—</option>
                      {f.options.map((o) => (
                        <option key={o.key} value={o.key} title={displayText(o.note)}>
                          {o.key}
                        </option>
                      ))}
                    </select>
                  </td>
                ))}
                <td className="px-1.5 py-1">
                  <span className="flex flex-wrap gap-1">
                    {PRECAUTIONS.map((x: Precaution) => {
                      const on = r.precautions.includes(x);
                      return (
                        <button key={x} type="button" disabled={!canType} aria-pressed={on} onClick={() => set([p.id], { precaution: { kind: x, on: !on } })} className={`rounded border px-1 text-[11px] ${on ? "border-fuji bg-fuji text-white" : "border-rule text-ink-faint"}`}>
                          {x.replace("予防策", "")}
                        </button>
                      );
                    })}
                  </span>
                </td>
                <td className="px-1.5 py-1 text-[11px]">
                  {mine.length ? (
                    mine.map((x) =>
                      x.text.startsWith("未入力：") ? (
                        <span key={x.text} title={displayText(x.text)} className="inline-block whitespace-nowrap rounded bg-yamabuki-soft px-1 font-bold text-yamabuki">
                          未入力 {x.text.slice(4).split("・").length}
                        </span>
                      ) : (
                        <div key={x.text} className="text-yamabuki">
                          {displayText(x.text)}
                        </div>
                      ),
                    )
                  ) : (
                    <span className="text-wakatake">✓</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {counts && (
        <p className="nums rounded-md border border-rule-soft bg-sheet px-3 py-1.5 text-[12px] text-ink-soft">
          登録した数（{counts.total}人）：{SEVERITY.map((s) => `${s.key} ${counts.severity[s.key]}`).join("・")}　救護 {RESCUE_KINDS.map((k) => `${k} ${counts.rescue[k]}`).join("・")}　予防策 {PRECAUTIONS.map((k) => `${k.replace("予防策", "")} ${counts.precautions[k]}`).join("・")}　看護度{" "}
          {Object.entries(counts.degree)
            .sort()
            .map(([k, n]) => `${k} ${n}`)
            .join("・") || "—"}
        </p>
      )}
    </div>
  );
}

/**
 * 状態の一括登録: every patient of the floor for one shift — 重症度・看護度・救護区分・感染経路別予防策 —
 * chosen by the nurse and registered at once. Only 感染経路別予防策 follows a public source; the other
 * categories are the fictional hospital's, and the screen says so.
 */
export function StatusBoard({ pick, patients, book, nowTime, canType, onRegister }: { pick: Pick; patients: StatusPatient[]; book: StatusBook; nowTime: string; canType: boolean; onRegister: (day: number, shift: ShiftName, sheet: StatusSheet, changed: string[]) => void }) {
  const [cur, setCur] = useState(() => currentShift(nowTime));
  return (
    <section aria-label="状態の一括登録" className="scroll-thin min-h-0 flex-1 overflow-auto bg-paper p-5">
      <header className="mb-2 flex flex-wrap items-center gap-3">
        <h1 className="flex items-center gap-1.5 text-lg font-bold">
          <ClipboardPen size={18} />
          状態の一括登録
        </h1>
        <PickSelect pick={pick} />
        <div role="radiogroup" aria-label="勤務帯" className="flex rounded-md border border-rule p-0.5">
          {SHIFTS.map((s) => (
            <button key={shiftKey(s.day, s.shift)} type="button" role="radio" aria-checked={cur.day === s.day && cur.shift === s.shift} onClick={() => setCur({ day: s.day, shift: s.shift })} className={`rounded px-2.5 py-0.5 text-xs ${cur.day === s.day && cur.shift === s.shift ? "bg-ink font-bold text-white" : "text-ink-soft"}`}>
              {s.label}
            </button>
          ))}
        </div>
      </header>

      <Table key={`${shiftKey(cur.day, cur.shift)}|${pick.value}|${book[shiftKey(cur.day, cur.shift)]?.length ?? 0}`} patients={patients} book={book} day={cur.day} shift={cur.shift} nowTime={nowTime} canType={canType} onRegister={(sheet, changed) => onRegister(cur.day, cur.shift, sheet, changed)} />

    </section>
  );
}

/* Help migration source (references and dynamic wording):
<p >勤務帯ごとに、階の全員の状態を1つの表で入れて登録します。左の□で患者を選ぶと、同じ値をまとめて入れられます。前の勤務帯の登録を写してから直すこともできます。救護区分は院内連絡のベッドの情報にも入ります。</p>
<ul >
        <li>
          <a href={STATUS_SOURCES.record.url} target="_blank" rel="noreferrer" >
            {STATUS_SOURCES.record.label}
          </a>
        </li>
        <li>
          <a href={STATUS_SOURCES.precautions.url} target="_blank" rel="noreferrer" >
            {STATUS_SOURCES.precautions.label}
          </a>
        </li>
        <li>{STATUS_RULES.severity}</li>
        <li>{STATUS_RULES.degree}</li>
        <li>{STATUS_RULES.rescue}</li>
        <li>
          区分の言葉：
          {displayText([...FIELDS.slice(0, 3)].map((f) => `${f.label} ${f.options.map((o) => `${o.key}＝${o.note}`).join("、")}`).join("／"))}／救護区分 {RESCUE_KINDS.map((k) => `${k}＝${RESCUE_NOTE[k]}`).join("、")}
        </li>
      </ul>
*/
