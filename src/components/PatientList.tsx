"use client";

import { ArrowDown, ArrowUp, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { upcomingToday } from "@/lib/calendar";
import { abs } from "@/lib/flowsheet";
import { hospitalDay } from "@/lib/dates";
import { currentEntries, ordersOf, type SessionChanges } from "@/lib/record";
import { flagsFor, type Flag, type FlagTone } from "@/lib/patient-flags";
import type { Patient } from "@/lib/types";
import { WARD_NAME, WARD_PLANS, doctorFor, emptyBeds, nurseFor, type BedAssignment, type WardPlan, type WardState } from "@/lib/ward";
import type { ChartSummary } from "./WardMap";

interface Props {
  ward: WardState;
  nowTime: string;
  changes: Record<string, SessionChanges>;
  summaries: Record<string, ChartSummary>;
  /** 指示受けがまだ, per patient. */
  waiting: Record<string, number>;
  /** Consent state per patient. */
  consentState?: Record<string, { admission: boolean; pending: string[] }>;
  /** Doses past due without a 実施 record, per patient. */
  marPending?: Record<string, number>;
  onOpen: (patientId: string) => void;
}

type GroupBy = "room" | "department" | "doctor" | "nurse";
const GROUPS: { key: GroupBy; label: string }[] = [
  { key: "room", label: "部屋順" },
  { key: "department", label: "診療科" },
  { key: "doctor", label: "主治医" },
  { key: "nurse", label: "担当看護師" },
];

const TONE: Record<FlagTone, string> = {
  shu: "bg-shu-soft text-shu",
  fuji: "bg-fuji-soft text-fuji",
  ai: "bg-ai-soft text-ai",
  yamabuki: "bg-yamabuki-soft text-yamabuki",
  wakatake: "bg-wakatake-soft text-wakatake",
  ink: "bg-tab text-ink-soft",
};

function Flags({ flags }: { flags: Flag[] }) {
  return (
    <div className="flex max-w-60 flex-wrap gap-1 text-[10px] font-bold">
      {flags.map((f) => (
        <span key={f.label} title={f.title} className={`whitespace-nowrap rounded px-1 ${TONE[f.tone]}`}>
          {f.label}
        </span>
      ))}
    </div>
  );
}

const planText = (p: WardPlan) => `${p.day === 0 ? "今日" : "明日"} ${p.time} ${p.kind}`;

type SortKey = "room" | "name" | "day";

interface Row {
  bed: BedAssignment;
  patient?: Patient;
  kana: string;
  day: number | null;
}

const roomKey = (b: BedAssignment) => `${b.room}-${b.bed}`;

/** Ward patient list. Our patients open on click or Enter; other teams' rows are context only. */
export function PatientList({ ward, nowTime, changes, summaries, waiting, consentState = {}, marPending = {}, onOpen }: Props) {
  const [scope, setScope] = useState<"mine" | "all">("mine");
  const [groupBy, setGroupBy] = useState<GroupBy>("room");
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

  const groupOf = (r: Row): string => {
    if (groupBy === "department") return r.patient?.department ?? r.bed.other?.department ?? "";
    if (groupBy === "doctor") return r.patient?.attending ?? doctorFor(r.bed.other?.department ?? "");
    if (groupBy === "nurse") return nurseFor(r.bed.room);
    return "";
  };
  const grouped: { key: string; rows: Row[] }[] = [];
  if (groupBy === "room") grouped.push({ key: "", rows });
  else {
    for (const r of [...rows].sort((a, b) => groupOf(a).localeCompare(groupOf(b), "ja"))) {
      const k = groupOf(r);
      const g = grouped.find((x) => x.key === k);
      if (g) g.rows.push(r);
      else grouped.push({ key: k, rows: [r] });
    }
  }
  const ordered = grouped.flatMap((g) => g.rows);
  const openable = ordered.filter((r) => r.patient);
  const planFor = (b: BedAssignment) => WARD_PLANS.filter((p) => p.kind === "退院" && p.room === b.room && p.bed === b.bed);
  const admittedToday = ward.beds.filter((b) => b.patientId && ward.patient(b.patientId)?.admittedOn === 0);
  const empties = emptyBeds(ward.beds);
  const reserved = WARD_PLANS.filter((p) => p.kind === "入院" && empties.some((e) => e.room.no === p.room && e.bed === p.bed));
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
        <div role="radiogroup" aria-label="まとめ方" className="flex rounded-md border border-rule p-0.5 text-sm">
          {GROUPS.map((g) => (
            <button
              key={g.key}
              type="button"
              role="radio"
              aria-checked={groupBy === g.key}
              onClick={() => setGroupBy(g.key)}
              className={`rounded px-2.5 py-0.5 ${groupBy === g.key ? "bg-ink font-bold text-white" : "text-ink-soft hover:text-ink"}`}
            >
              {g.label}
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

      <div className="flex flex-wrap gap-x-6 gap-y-1 border-b border-rule bg-sheet px-5 py-2 text-[12px]">
        {([0, 1] as const).map((d) => {
          const plans = WARD_PLANS.filter((p) => p.day === d);
          const viaEr = d === 0 ? admittedToday : [];
          return (
            <div key={d} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
              <b className="text-ink-soft">{d === 0 ? "今日" : "明日"}</b>
              <span>
                入院 {plans.filter((p) => p.kind === "入院").length + viaEr.length}　退院 {plans.filter((p) => p.kind === "退院").length}
              </span>
              {plans.map((p) => (
                <span key={p.name} className={p.kind === "入院" ? "text-ai" : "text-wakatake"}>
                  {p.time} {p.kind} {p.room}
                  {p.bed && `-${p.bed}`} {p.name}
                </span>
              ))}
              {viaEr.map((b) => (
                <span key={b.patientId} className="text-ai">
                  救急から入院 {b.room}
                  {b.bed && `-${b.bed}`} {ward.patient(b.patientId!)?.name}
                </span>
              ))}
            </div>
          );
        })}
        <span className="ml-auto text-ink-soft">
          空床 {empties.length}（うち入院予定 {reserved.length}）
        </span>
      </div>

      <div className="scroll-thin min-h-0 flex-1 overflow-auto">
        <table className="nums w-full min-w-[1180px] border-collapse text-[13px]">
          <thead className="sticky top-0 z-10 bg-paper text-left text-[11px] text-ink-faint shadow-[0_1px_0_var(--color-rule)]">
            <tr>
              <th className="px-3 py-2 font-normal">{header("room", "病室")}</th>
              <th className="px-3 py-2 font-normal">{header("name", "氏名")}</th>
              <th className="px-3 py-2 font-normal">性・年齢</th>
              <th className="px-3 py-2 font-normal">{header("day", "入院")}</th>
              <th className="px-3 py-2 font-normal">病名</th>
              <th className="px-3 py-2 font-normal">担当</th>
              <th className="px-3 py-2 font-normal">印（記録から）</th>
              <th className="px-3 py-2 font-normal">最新バイタル</th>
              <th className="px-3 py-2 font-normal">このあと（今日）</th>
              <th className="px-3 py-2 font-normal">新しい結果</th>
              <th className="px-3 py-2 font-normal">指示</th>
            </tr>
          </thead>
          <tbody>
            {grouped.map((g) => [
              g.key ? (
                <tr key={`g-${g.key}`}>
                  <td colSpan={11} className="sticky left-0 border-b border-rule bg-tab/60 px-3 py-1 text-[12px] font-bold text-ink-soft">
                    {g.key}
                    <span className="ml-2 font-normal">{g.rows.length}人</span>
                  </td>
                </tr>
              ) : null,
              ...g.rows.map((r) =>
                r.patient ? (
                  <MyRow
                    key={roomKey(r.bed)}
                    row={r}
                    patient={r.patient}
                    focused={openable[at] === r}
                    upcoming={upcomingToday(ordersOf(currentEntries(r.patient, changes[r.patient.id])), nowAbs)}
                    flags={flagsFor(r.patient, ordersOf(currentEntries(r.patient, changes[r.patient.id])), nowAbs, waiting[r.patient.id] ?? 0, consentState[r.patient.id], marPending[r.patient.id] ?? 0)}
                    plans={planFor(r.bed)}
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
                    <td className="px-3 py-1.5">他チーム：{r.bed.other?.department}</td>
                    <td className="px-3 py-1.5 text-[11px]">
                      <div>{doctorFor(r.bed.other?.department ?? "")}</div>
                      <div>{nurseFor(r.bed.room)}</div>
                    </td>
                    <td className="px-3 py-1.5" colSpan={5}>
                      {[...planFor(r.bed).map(planText), r.bed.other?.note].filter((x) => x && x !== "明日退院").join("　")}
                    </td>
                  </tr>
                ),
              ),
            ])}
            {scope === "all" &&
              WARD_PLANS.filter((p) => p.kind === "入院" && empties.some((e) => e.room.no === p.room && e.bed === p.bed)).map((p) => (
                <tr key={`plan-${p.name}`} className="border-b border-dashed border-rule text-ai">
                  <td className="px-3 py-1.5">
                    {p.room}
                    {p.bed && `-${p.bed}`}
                  </td>
                  <td className="px-3 py-1.5">{p.name}</td>
                  <td className="px-3 py-1.5">
                    {p.sex}・{p.age}歳
                  </td>
                  <td className="px-3 py-1.5 font-bold">{planText(p)}</td>
                  <td className="px-3 py-1.5" colSpan={7}>
                    {p.department}　{p.note}
                  </td>
                </tr>
              ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={11} className="px-3 py-6 text-center text-ink-faint">
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
  flags,
  plans,
  summary,
  onOpen,
}: {
  row: Row;
  patient: Patient;
  focused: boolean;
  upcoming: string[];
  flags: Flag[];
  plans: WardPlan[];
  summary?: ChartSummary;
  onOpen: () => void;
}) {
  const latest = p.vitals.at(-1);
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
      <td className="whitespace-nowrap px-3 py-2 text-[11px] text-ink-soft">
        <div>{p.attending}</div>
        <div>{nurseFor(row.bed.room)}</div>
      </td>
      <td className="px-3 py-2">
        <Flags flags={[...plans.map((x) => ({ label: planText(x), tone: "wakatake" as const })), ...flags]} />
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
