"use client";

import { displayText } from "@/lib/display-text";
import { Users } from "lucide-react";
import { useState } from "react";
import { ASSIGN_RULES, ASSIGN_SOURCES, assign, assignIssues, copyPlan, emptySheet, loads, maxLoad, type AssignSheet, type Bed } from "@/lib/assignments";
import type { RosterNurse } from "@/lib/roster";
import type { Room } from "@/lib/ward";
import { currentShift, shiftKey, type ShiftName } from "@/lib/ward-status";
import { useMe } from "./RoleContext";
import { PickSelect, type Pick } from "./WardMap";

const SHIFTS: { day: number; shift: ShiftName; label: string }[] = [
  { day: -1, shift: "night", label: "昨日の夜勤" },
  { day: 0, shift: "day", label: "今日の日勤" },
  { day: 0, shift: "night", label: "今日の夜勤" },
  { day: 1, shift: "day", label: "明日の日勤" },
];
const short = (name: string) => name.replace(/^(看護師長|准看護師|看護師) /, "");

interface Props {
  pick: Pick;
  /** The floor has a 勤務表 (5階東 only in this demo). */
  hasRoster: boolean;
  rooms: Room[];
  beds: Bed[];
  nurses: RosterNurse[];
  crewOf: (day: number, shift: ShiftName) => RosterNurse[];
  sheetOf: (day: number, shift: ShiftName) => AssignSheet | undefined;
  nowTime: string;
  canEdit: boolean;
  onChange: (day: number, shift: ShiftName, sheet: AssignSheet, what: string) => void;
}

function Plan({ rooms, beds, nurses, crew, sheet, prev, prevLabel, nowTime, canEdit, onChange }: { rooms: Room[]; beds: Bed[]; nurses: RosterNurse[]; crew: RosterNurse[]; sheet: AssignSheet; prev?: AssignSheet; prevLabel: string; nowTime: string; canEdit: boolean; onChange: (s: AssignSheet, what: string) => void }) {
  const me = useMe();
  const [nurse, setNurse] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [warn, setWarn] = useState<string | null>(null);
  const nameOf = (id: string) => nurses.find((n) => n.id === id)?.name ?? id;
  const ctx = { by: me.name, at: { day: 0, time: nowTime }, reason, nameOf, beds };
  const issues = assignIssues(sheet, beds, crew, nurses);
  const put = (keys: string[]) => {
    if (!canEdit || nurse === null) return;
    if (sheet.confirmed && !reason.trim()) return setWarn("確定したあとに変えるときは、先に「変える理由」を書いてください。");
    setWarn(null);
    // "" = 外す.
    const target = nurse === "" ? null : nurse;
    const next = assign(sheet, keys, target, ctx);
    if (JSON.stringify(next.beds) === JSON.stringify(sheet.beds)) return;
    onChange(next, `${keys.join("・")} → ${target ? nameOf(target) : "（外す）"}${sheet.confirmed ? `　理由：${reason.trim()}` : ""}`);
  };
  const lpns = crew.filter((n) => n.kind === "准看護師");
  const nurseIds = crew.filter((n) => n.kind === "看護師").map((n) => n.id);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-rule bg-sheet px-3 py-2 text-[12px]">
        <b className="mr-1">割り当てる看護師</b>
        {crew.length === 0 && <span className="text-yamabuki">勤務表では、この勤務帯に入っている看護師がいません。</span>}
        {loads(sheet, beds, crew).map(({ nurse: n, beds: bs }) => (
          <button key={n.id} type="button" disabled={!canEdit} aria-pressed={nurse === n.id} onClick={() => setNurse(n.id)} className={`rounded-md border px-2 py-1 text-left ${nurse === n.id ? "border-ink bg-ink text-white" : "border-rule bg-paper hover:border-ai"}`}>
            <b>{short(n.name)}</b>
            <span className="ml-1 text-[10px] opacity-80">
              {n.kind === "准看護師" ? "准" : ""}
              {n.newcomer ? "1年目" : ""}
              {n.head ? "師長" : ""}
            </span>
            <span className="nums ml-1">{bs.length}人</span>
          </button>
        ))}
        {canEdit && (
          <button type="button" aria-pressed={nurse === ""} onClick={() => setNurse("")} className={`rounded-md border border-dashed px-2 py-1 ${nurse === "" ? "border-ink bg-ink text-white" : "border-rule"}`}>
            外す
          </button>
        )}
        {canEdit && prev && !sheet.confirmed && (
          <button type="button" onClick={() => onChange(copyPlan(prev, crew), `${prevLabel}の分担を写した`)} className="ml-auto rounded border border-rule px-2 py-1 hover:border-ai">
            {prevLabel}の分担を写す（この勤務帯にいる看護師の分）
          </button>
        )}
      </div>
      {sheet.confirmed && canEdit && (
        <label className="flex flex-wrap items-center gap-2 text-[12px]">
          <b>変える理由</b>
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="例：入院の受け入れ・急変の対応・休憩の交代" className="w-80 rounded border border-rule bg-sheet px-2 py-1" />
          <span className="text-ink-faint">{ASSIGN_RULES.change}</span>
        </label>
      )}
      {warn && <p className="text-[12px] text-shu">{warn}</p>}
      <p className="hint text-[11px] text-ink-soft">上で看護師を選んでから、部屋の番号（部屋の全員）かベッド（1人）を押すと、その看護師の受け持ちになります。</p>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2">
        {rooms.map((r) => {
          const inRoom = r.beds.map((b) => ({ letter: b, bed: beds.find((x) => x.key === `${r.no}${b}`) }));
          return (
            <div key={r.no} className="rounded-md border border-rule bg-sheet">
              <button type="button" disabled={!canEdit || nurse === null} onClick={() => put(inRoom.flatMap((x) => (x.bed ? [x.bed.key] : [])))} className="nums w-full border-b border-rule-soft px-2 py-1 text-left text-[12px] font-bold hover:bg-ai-soft disabled:hover:bg-transparent">
                {displayText(r.no)}
                <span className="ml-1 text-[10px] font-normal text-ink-faint">{r.kind}</span>
              </button>
              <div className="space-y-0.5 p-1">
                {inRoom.map(({ letter, bed }) =>
                  bed ? (
                    <button key={letter || "single"} type="button" disabled={!canEdit || nurse === null} onClick={() => put([bed.key])} className="flex w-full items-baseline gap-1 rounded px-1 py-0.5 text-left text-[11px] hover:bg-ai-soft disabled:hover:bg-transparent">
                      <span className="w-3 text-ink-faint">{letter}</span>
                      <span className="flex-1 truncate">{bed.name}</span>
                      <b className={sheet.beds[bed.key] ? "text-ai" : "text-yamabuki"}>{sheet.beds[bed.key] ? short(nameOf(sheet.beds[bed.key])) : "未"}</b>
                    </button>
                  ) : (
                    <div key={letter || "single"} className="px-1 py-0.5 text-[11px] text-ink-faint">
                      {letter} 空床
                    </div>
                  ),
                )}
              </div>
            </div>
          );
        })}
      </div>
      {lpns.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-[12px]">
          {lpns.map((n) => (
            <label key={n.id} className="flex items-center gap-1">
              {n.name}に指示を出す看護師
              <select
                value={sheet.directs[n.id] ?? ""}
                disabled={!canEdit}
                onChange={(e) => onChange({ ...sheet, directs: { ...sheet.directs, [n.id]: e.target.value } }, `${n.name}に指示を出す看護師：${e.target.value ? nameOf(e.target.value) : "なし"}`)}
                className="rounded border border-rule bg-sheet px-1 py-0.5"
              >
                <option value="">（選ぶ）</option>
                {nurseIds.map((id) => (
                  <option key={id} value={id}>
                    {nameOf(id)}
                  </option>
                ))}
              </select>
            </label>
          ))}
          <span className="text-[11px] text-ink-faint">{ASSIGN_RULES.lpn}</span>
        </div>
      )}
      <div className="rounded-md border border-rule bg-sheet p-2 text-[12px]">
        {issues.length === 0 ? <p className="text-wakatake">✓ 患者全員に受け持ちがいます。</p> : issues.map((i) => <p key={i.text} className="text-yamabuki">{displayText(i.text)}</p>)}
        <p className="nums mt-1 text-ink-soft">
          掲示：この勤務帯の看護職員1人当たりの受け持ち数は <b className="text-ink">{maxLoad(sheet, beds, crew)}人</b>以内です（受け持ちの多い人の数。コードで数える）。
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-[12px]">
        {sheet.confirmed ? (
          <span className="font-bold text-wakatake">
            分担を確定 {sheet.confirmed.at.time} {displayText(sheet.confirmed.by)}
          </span>
        ) : (
          canEdit && (
            <button type="button" onClick={() => onChange({ ...sheet, confirmed: { by: me.name, at: { day: 0, time: nowTime } } }, `分担を確定（${issues.length ? `確かめが${issues.length}件残る` : "確かめは残っていない"}）`)} className="rounded-md bg-ai px-3 py-1 font-bold text-white">
              分担を確定（{me.name}）
            </button>
          )
        )}
        {!sheet.confirmed && <span className="text-ink-faint">確定するまでは下書きです。確かめが残っていても確定できます（決めるのはリーダーか看護師長です）。</span>}
      </div>
      {sheet.changes.length > 0 && (
        <section>
          <h3 className="mb-1 text-[12px] font-bold text-ink-soft">勤務中の変更（{sheet.changes.length}件）</h3>
          <table className="nums w-full border-collapse text-[12px]">
            <tbody>
              {sheet.changes.map((c, i) => (
                <tr key={i} className="border-b border-rule-soft">
                  <td className="w-14 px-1 py-0.5">{c.at.time}</td>
                  <td className="px-1">
                    {c.bed} {c.patient}
                  </td>
                  <td className="px-1">
                    {displayText(c.from ? short(c.from) : "（なし）")} → {c.to ? short(c.to) : "（外す）"}
                  </td>
                  <td className="px-1">{displayText(c.reason)}</td>
                  <td className="px-1 text-ink-faint">{displayText(c.by)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}

/**
 * 業務分担: the shift's nurses (from the 勤務表) assigned to rooms and beds by the leader or the 看護師長; code
 * counts and checks, and records each change after the plan is confirmed. Shown on the worksheet and the map.
 */
export function AssignBoard({ pick, hasRoster, rooms, beds, nurses, crewOf, sheetOf, nowTime, canEdit, onChange }: Props) {
  const [cur, setCur] = useState(() => currentShift(nowTime));
  const sheet = sheetOf(cur.day, cur.shift) ?? emptySheet();
  // 「写す」: the same shift the day before (the same nurse often keeps the same patients).
  const prev = sheetOf(cur.day - 1, cur.shift);
  return (
    <section aria-label="業務分担" className="scroll-thin min-h-0 flex-1 overflow-auto bg-paper p-5">
      <header className="mb-2 flex flex-wrap items-center gap-3">
        <h1 className="flex items-center gap-1.5 text-lg font-bold">
          <Users size={18} />
          業務分担（受け持ち）
        </h1>
        <PickSelect pick={pick} />
        <div role="radiogroup" aria-label="勤務帯" className="flex rounded-md border border-rule p-0.5">
          {SHIFTS.map((s) => (
            <button key={shiftKey(s.day, s.shift)} type="button" role="radio" aria-checked={cur.day === s.day && cur.shift === s.shift} onClick={() => setCur({ day: s.day, shift: s.shift })} className={`rounded px-2.5 py-0.5 text-xs ${cur.day === s.day && cur.shift === s.shift ? "bg-ink font-bold text-white" : "text-ink-soft"}`}>
              {s.label}
            </button>
          ))}
        </div>
        <span className="text-xs text-ink-faint">{ASSIGN_RULES.who}</span>
      </header>
      {hasRoster ? (
        <Plan key={`${pick.value}|${shiftKey(cur.day, cur.shift)}`} rooms={rooms} beds={beds} nurses={nurses} crew={crewOf(cur.day, cur.shift)} sheet={sheet} prev={prev} prevLabel={cur.shift === "day" ? "前の日の日勤" : "前の日の夜勤"} nowTime={nowTime} canEdit={canEdit} onChange={(s, what) => onChange(cur.day, cur.shift, s, what)} />
      ) : (
        <p className="rounded-lg border border-rule bg-sheet p-4 text-sm text-ink-soft">このデモで勤務表があるのは5階東だけです。5階東を選んでください。</p>
      )}
      <ul className="hint mt-3 space-y-0.5 text-[11px] text-ink-faint">
        {Object.values(ASSIGN_SOURCES).map((s) => (
          <li key={s.label}>
            <a href={s.url} target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline">
              {s.label}
            </a>
          </li>
        ))}
        <li>看護師は「勤務表と様式9」の勤務（日勤・夜勤）から出しています。分担を決めるのは人で、コードは数えて確かめるだけです（AI は使っていません）。</li>
      </ul>
    </section>
  );
}
