"use client";

import { ArrowDown, ArrowUp, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { upcomingToday } from "@/lib/calendar";
import { abs } from "@/lib/flowsheet";
import { hospitalDay } from "@/lib/dates";
import { currentEntries, ordersOf, type SessionChanges } from "@/lib/record";
import type { Patient } from "@/lib/types";
import { WARD_NAME, isolationFor, type BedAssignment, type WardState } from "@/lib/ward";
import type { ChartSummary } from "./WardMap";

interface Props {
  ward: WardState;
  nowTime: string;
  changes: Record<string, SessionChanges>;
  summaries: Record<string, ChartSummary>;
  onOpen: (patientId: string) => void;
}

type SortKey = "room" | "name" | "day";

interface Row {
  bed: BedAssignment;
  patient?: Patient;
  kana: string;
  day: number | null;
}

const roomKey = (b: BedAssignment) => `${b.room}-${b.bed}`;

/** Ward patient list. Our patients open on click or Enter; other teams' rows are context only. */
export function PatientList({ ward, nowTime, changes, summaries, onOpen }: Props) {
  const [scope, setScope] = useState<"mine" | "all">("mine");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; asc: boolean }>({ key: "room", asc: true });
  const [cursor, setCursor] = useState(0);
  const nowAbs = abs(0, nowTime);

  const rows: Row[] = useMemo(() => {
    const all = ward.beds.map((b) => {
      const patient = b.patientId ? ward.patient(b.patientId) : undefined;
      return { bed: b, patient, kana: patient?.kana ?? b.other?.name ?? "", day: patient ? hospitalDay(patient.admittedOn, 0) : null };
    });
    const filtered = all
      .filter((r) => scope === "all" || r.patient)
      .filter((r) => {
        const s = q.trim();
        if (!s) return true;
        const fields = [r.bed.room, r.patient?.name, r.patient?.kana, r.patient?.admissionDiagnosis, r.patient?.id, r.bed.other?.name, r.bed.other?.department];
        return fields.some((f) => f?.includes(s));
      });
    const dir = sort.asc ? 1 : -1;
    return filtered.sort((a, b) => {
      if (sort.key === "name") return dir * a.kana.localeCompare(b.kana, "ja");
      if (sort.key === "day") return dir * ((a.day ?? -1) - (b.day ?? -1));
      return dir * roomKey(a.bed).localeCompare(roomKey(b.bed));
    });
  }, [ward, scope, q, sort]);

  const openable = rows.filter((r) => r.patient);
  const at = Math.min(cursor, Math.max(openable.length - 1, 0));

  const header = (key: SortKey, label: string) => (
    <button
      type="button"
      onClick={() => setSort((s) => ({ key, asc: s.key === key ? !s.asc : true }))}
      className="inline-flex items-center gap-0.5 hover:text-ink"
      aria-label={`${label}で並べ替え`}
    >
      {label}
      {sort.key === key && (sort.asc ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
    </button>
  );

  return (
    <section aria-label="患者一覧" className="flex min-h-0 flex-1 flex-col bg-paper">
      <header className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-rule bg-sheet px-5 py-3">
        <h1 className="text-lg font-bold">
          {WARD_NAME} 患者一覧
          <span className="ml-2 rounded border border-dashed border-ink-faint px-1.5 py-0.5 align-middle text-[10px] font-normal text-ink-soft">架空</span>
        </h1>
        <div role="tablist" className="flex rounded-md border border-rule p-0.5 text-sm">
          {(
            [
              ["mine", `受け持ち（${ward.beds.filter((b) => b.patientId).length}）`],
              ["all", `病棟全体（${ward.beds.length}）`],
            ] as const
          ).map(([v, label]) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={scope === v}
              onClick={() => setScope(v)}
              className={`rounded px-2.5 py-0.5 ${scope === v ? "bg-ink font-bold text-white" : "text-ink-soft hover:text-ink"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 rounded-md border border-rule bg-sheet px-2 py-1">
          <Search size={14} className="text-ink-faint" />
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setCursor(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setCursor(Math.min(at + 1, openable.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setCursor(Math.max(at - 1, 0));
              } else if (e.key === "Enter" && openable[at]?.patient) {
                onOpen(openable[at].patient!.id);
              }
            }}
            placeholder="名前・部屋・病名で探す（↑↓・Enter）"
            className="w-64 bg-transparent text-sm outline-none placeholder:text-ink-faint"
          />
        </label>
      </header>

      <div className="scroll-thin min-h-0 flex-1 overflow-auto">
        <table className="nums w-full min-w-[1100px] border-collapse text-[13px]">
          <thead className="sticky top-0 z-10 bg-paper text-left text-[11px] text-ink-faint shadow-[0_1px_0_var(--color-rule)]">
            <tr>
              <th className="px-3 py-2 font-normal">{header("room", "病室")}</th>
              <th className="px-3 py-2 font-normal">{header("name", "氏名")}</th>
              <th className="px-3 py-2 font-normal">性・年齢</th>
              <th className="px-3 py-2 font-normal">{header("day", "入院")}</th>
              <th className="px-3 py-2 font-normal">病名</th>
              <th className="px-3 py-2 font-normal">注意</th>
              <th className="px-3 py-2 font-normal">最新バイタル</th>
              <th className="px-3 py-2 font-normal">このあと（今日）</th>
              <th className="px-3 py-2 font-normal">新しい結果</th>
              <th className="px-3 py-2 font-normal">指示</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) =>
              r.patient ? (
                <MyRow
                  key={roomKey(r.bed)}
                  row={r}
                  patient={r.patient}
                  focused={openable[at] === r}
                  upcoming={upcomingToday(ordersOf(currentEntries(r.patient, changes[r.patient.id])), nowAbs)}
                  summary={summaries[r.patient.id]}
                  onOpen={() => onOpen(r.patient!.id)}
                />
              ) : (
                <tr key={roomKey(r.bed)} className="border-b border-rule-soft text-ink-faint" title="他チームの患者（架空）。この試作ではカルテを開けません。">
                  <td className="px-3 py-1.5">
                    {r.bed.room}
                    {r.bed.bed && `-${r.bed.bed}`}
                  </td>
                  <td className="px-3 py-1.5">{r.bed.other?.name}</td>
                  <td className="px-3 py-1.5">
                    {r.bed.other?.sex}・{r.bed.other?.age}歳
                  </td>
                  <td className="px-3 py-1.5">—</td>
                  <td className="px-3 py-1.5" colSpan={2}>
                    他チーム：{r.bed.other?.department}
                  </td>
                  <td className="px-3 py-1.5" colSpan={4}>
                    {r.bed.other?.note}
                  </td>
                </tr>
              ),
            )}
            {rows.length === 0 && (
              <tr>
                <td colSpan={10} className="px-3 py-6 text-center text-ink-faint">
                  見つかりません
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function MyRow({
  row,
  patient: p,
  focused,
  upcoming,
  summary,
  onOpen,
}: {
  row: Row;
  patient: Patient;
  focused: boolean;
  upcoming: string[];
  summary?: ChartSummary;
  onOpen: () => void;
}) {
  const latest = p.vitals.at(-1);
  const isolation = isolationFor(p.infections);
  const newResults = [
    ...p.cultures.filter((c) => c.reportedOn === 0).map((c) => `${c.specimen}培養`),
    ...(p.labs.some((l) => l.day === 0) ? ["採血"] : []),
  ];
  return (
    <tr
      onClick={onOpen}
      className={`cursor-pointer border-b border-rule-soft bg-sheet align-top hover:bg-ai-soft/40 ${focused ? "outline outline-2 -outline-offset-2 outline-ai" : ""}`}
    >
      <td className="px-3 py-2 font-bold">
        {row.bed.room}
        {row.bed.bed && <span className="text-ink-faint">-{row.bed.bed}</span>}
      </td>
      <td className="px-3 py-2">
        <div className="text-[10px] text-ink-faint">{p.kana}</div>
        <button type="button" onClick={onOpen} className="font-bold text-ai hover:underline">
          {p.name}
        </button>
      </td>
      <td className="whitespace-nowrap px-3 py-2">
        {p.sex}・{p.age}歳
      </td>
      <td className="whitespace-nowrap px-3 py-2">
        <b>{row.day}日目</b>
        {p.admittedOn === 0 && <div className="text-[10px] font-bold text-ai">新入院</div>}
      </td>
      <td className="px-3 py-2">{p.admissionDiagnosis}</td>
      <td className="px-3 py-2">
        <div className="flex max-w-56 flex-wrap gap-1 text-[10px] font-bold">
          {isolation && <span className="rounded bg-fuji-soft px-1 text-fuji">{isolation}</span>}
          {p.allergies.map((a) => (
            <span key={a} className="rounded bg-shu-soft px-1 text-shu">
              {a}
            </span>
          ))}
          {p.cautions.map((c) => (
            <span key={c} className="rounded bg-yamabuki-soft px-1 text-yamabuki">
              {c}
            </span>
          ))}
        </div>
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-[12px]">
        {latest && (
          <>
            <div>
              BT {latest.bt?.toFixed(1)}　HR {latest.hr}　BP {latest.sbp}/{latest.dbp}
            </div>
            <div className="text-ink-soft">
              SpO2 {latest.spo2}%（{latest.o2}）<span className="ml-1 text-ink-faint">{latest.time}</span>
            </div>
          </>
        )}
      </td>
      <td className="px-3 py-2 text-[12px]">
        {upcoming.length === 0 ? (
          <span className="text-ink-faint">—</span>
        ) : (
          <ul>
            {upcoming.slice(0, 4).map((u) => (
              <li key={u} className="whitespace-nowrap">
                {u}
              </li>
            ))}
            {upcoming.length > 4 && <li className="text-ink-faint">ほか {upcoming.length - 4}件</li>}
          </ul>
        )}
      </td>
      <td className="px-3 py-2 text-[12px]">
        {newResults.length ? newResults.map((r) => <div key={r} className="font-bold text-ai">{r}（今日）</div>) : <span className="text-ink-faint">—</span>}
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-[12px]">
        {summary?.drafts ? <div className="font-bold text-yamabuki">下書き {summary.drafts}件</div> : null}
        {summary?.confirmedToday ? <div className="text-wakatake">今日確定 {summary.confirmedToday}件</div> : null}
        {!summary?.drafts && !summary?.confirmedToday && <span className="text-ink-faint">—</span>}
      </td>
    </tr>
  );
}
