"use client";

import { PatientAvatar } from "./PatientAvatar";
import { ArrowDown, ArrowUp, Search, SlidersHorizontal, X } from "lucide-react";
import { useMemo, useState } from "react";
import { upcomingToday } from "@/lib/calendar";
import { abs } from "@/lib/flowsheet";
import { hospitalDay } from "@/lib/dates";
import { currentEntries, ordersOf, type SessionChanges } from "@/lib/record";
import { flagsFor, type Flag, type FlagTone } from "@/lib/patient-flags";
import type { Patient } from "@/lib/types";
import { WARD_PLANS, doctorFor, emptyBeds, floorOf, nurseFor, type BedAssignment, type Floor, type WardPlan, type WardState } from "@/lib/ward";
import { PickSelect, type ChartSummary, type Pick } from "./WardMap";
import { ageSex } from "@/lib/person";
import { periodNote, rangesText } from "@/lib/dpc-brief";
import { activeCount, choicesOf, DAY_BUCKETS, DPC_CHOICES, EMPTY_FILTER, flagKey, matches, type FilterFacts, type ListFilter } from "@/lib/patient-filter";
import { useDpcBriefs, type DpcBriefs } from "@/lib/use-dpc-briefs";
import type { CalendarDate } from "@/lib/dates";

interface Props {
  /** The beds to list (a floor, 受け持ち, a department, all wards …) and the patient lookup. */
  ward: WardState;
  title: string;
  /** A pulldown in the header (◯階・科・主治医). */
  pick?: Pick;
  /** How the rows are grouped at first. */
  defaultGroup?: GroupBy;
  /** The floor listed: its empty beds and today's and tomorrow's admissions and discharges. */
  floor?: Floor;
  nowTime: string;
  changes: Record<string, SessionChanges>;
  summaries: Record<string, ChartSummary>;
  /** 指示受けがまだ, per patient. */
  waiting: Record<string, number>;
  /** Consent state per patient. */
  consentState?: Record<string, { admission: boolean; pending: string[] }>;
  /** Doses past due without a 実施 record, per patient. */
  marPending?: Record<string, number>;
  /** Results not yet seen by the doctor (and how many are panic values). */
  resultState?: Record<string, { unseen: number; panic: number }>;
  /** More marks per patient from outside the record (指示簿: call criteria met, 指示受けがまだ). */
  extraFlags?: Record<string, Flag[]>;
  /** The record the 算定 calculation gets for a patient, to show its DPC の入院期間 (null: not shown). */
  dpcPayload?: (patientId: string) => object | null;
  today?: CalendarDate;
  onOpen: (patientId: string) => void;
}

export type GroupBy = "room" | "floor" | "department" | "doctor" | "nurse";
const GROUPS: { key: GroupBy; label: string }[] = [
  { key: "room", label: "部屋順" },
  { key: "floor", label: "病棟" },
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
export function PatientList({ ward, title, pick, defaultGroup = "room", floor, nowTime, changes, summaries, waiting, consentState = {}, marPending = {}, resultState = {}, extraFlags = {}, dpcPayload, today, onOpen }: Props) {
  const [groupBy, setGroupBy] = useState<GroupBy>(defaultGroup);
  const [q, setQ] = useState("");
  const [cond, setCond] = useState<ListFilter>(EMPTY_FILTER);
  const [showCond, setShowCond] = useState(false);
  const dpc = useDpcBriefs(
    ward.beds.flatMap((b) => (b.patientId ? [b.patientId] : [])),
    dpcPayload ?? (() => null),
    today ?? null,
    nowTime,
    !!dpcPayload && !!today,
  );
  const [sort, setSort] = useState<{ key: SortKey; asc: boolean }>({ key: "room", asc: true });
  const [cursor, setCursor] = useState(0);
  const nowAbs = abs(0, nowTime);

  const flagsOf = (p: Patient): Flag[] => {
    const entries = ordersOf(currentEntries(p, changes[p.id]));
    return [...(extraFlags[p.id] ?? []), ...flagsFor(p, entries, nowAbs, waiting[p.id] ?? 0, consentState[p.id], marPending[p.id] ?? 0, resultState[p.id])];
  };
  const factsOf = (r: Row): FilterFacts => {
    const p = r.patient;
    const brief = p ? dpc[p.id] : undefined;
    const entries = p ? ordersOf(currentEntries(p, changes[p.id])) : [];
    const leaving = entries.some((e) => e.status === "有効" && e.order.type === "procedure" && e.order.leave?.kind === "退院" && e.order.leave.from.day >= 0 && e.order.leave.from.day <= 1);
    return {
      floor: floorOf(r.bed.room),
      department: p?.department ?? r.bed.other?.department ?? "",
      doctor: p?.attending ?? doctorFor(r.bed.other?.department ?? ""),
      nurse: nurseFor(r.bed.room),
      day: r.day,
      dpc: brief && brief !== "loading" && brief.ok && brief.hokatsu ? brief.period : null,
      flags: p ? [...new Set(flagsOf(p).map((f) => flagKey(f.label)))] : [],
      mine: !!p,
      discharge: leaving || WARD_PLANS.some((x) => x.kind === "退院" && x.room === r.bed.room && x.bed === r.bed.bed),
    };
  };

  const all: Row[] = ward.beds.map((b) => {
    const patient = b.patientId ? ward.patient(b.patientId) : undefined;
    return { bed: b, patient, kana: patient?.kana ?? b.other?.name ?? "", day: patient ? hospitalDay(patient.admittedOn, 0) : null };
  });
  const facts = all.map(factsOf);
  const choices = choicesOf(facts);
  const nCond = activeCount(cond);
  const rows: Row[] = useMemo(() => {
    const filtered = all.filter((r, i) => {
      if (!matches(facts[i], cond)) return false;
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
    // `all` and `facts` are rebuilt from these props on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ward, q, sort, cond, dpc, changes, waiting, resultState, extraFlags, consentState, marPending, nowTime]);

  const groupOf = (r: Row): string => {
    if (groupBy === "floor") return floorOf(r.bed.room);
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
  const inFloor = (room: string) => !!floor && floor.rooms.some((r) => r.no === room);
  const admittedToday = ward.beds.filter((b) => b.patientId && ward.patient(b.patientId)?.admittedOn === 0 && inFloor(b.room));
  const plansHere = WARD_PLANS.filter((p) => inFloor(p.room));
  const empties = floor ? emptyBeds(ward.beds, floor.rooms) : [];
  const reserved = plansHere.filter((p) => p.kind === "入院" && empties.some((e) => e.room.no === p.room && e.bed === p.bed));
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
          {title}
          <span className="ml-2 rounded border border-dashed border-ink-faint px-1.5 py-0.5 align-middle text-[10px] font-normal text-ink-soft">架空</span>
          <span className="nums ml-2 text-sm font-normal text-ink-soft">{rows.length === all.length ? `${rows.length}人` : `${rows.length}人（全${all.length}人）`}</span>
        </h1>
        {pick && <PickSelect pick={pick} />}
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
        <button
          type="button"
          onClick={() => setShowCond((v) => !v)}
          aria-expanded={showCond}
          className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-sm ${nCond ? "border-ai bg-ai-soft font-bold text-ai" : "border-rule text-ink-soft hover:text-ink"}`}
        >
          <SlidersHorizontal size={14} />
          条件で絞る{nCond ? `（${nCond}）` : ""}
        </button>
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

      {(showCond || nCond > 0) && (
        <CondBar cond={cond} choices={choices} onChange={(c) => (setCond(c), setCursor(0))} />
      )}

      <div className={`flex flex-wrap gap-x-6 gap-y-1 border-b border-rule bg-sheet px-5 py-2 text-[12px] ${floor ? "" : "hidden"}`}>
        {([0, 1] as const).map((d) => {
          const plans = plansHere.filter((p) => p.day === d);
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
              <th className="px-3 py-2 font-normal" title="DPC の入院期間（算定の DPC と同じ計算。医療資源病名を主治医が選ぶまでは仮）">DPC</th>
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
                  <td colSpan={12} className="sticky left-0 border-b border-rule bg-tab/60 px-3 py-1 text-[12px] font-bold text-ink-soft">
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
                    flags={flagsOf(r.patient)}
                    dpc={dpc[r.patient.id]}
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
                      {r.bed.other ? ageSex(r.bed.other) : ""}
                    </td>
                    <td className="px-3 py-1.5">—</td>
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
            {!q.trim() && !nCond &&
              reserved.map((p) => (
                <tr key={`plan-${p.name}`} className="border-b border-dashed border-rule text-ai">
                  <td className="px-3 py-1.5">
                    {p.room}
                    {p.bed && `-${p.bed}`}
                  </td>
                  <td className="px-3 py-1.5">{p.name}</td>
                  <td className="px-3 py-1.5">
                    {ageSex(p)}
                  </td>
                  <td className="px-3 py-1.5 font-bold">{planText(p)}</td>
                  <td className="px-3 py-1.5" colSpan={8}>
                    {p.department}　{p.note}
                  </td>
                </tr>
              ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={12} className="px-3 py-6 text-center text-ink-faint">
                  {nCond ? "条件に合う患者はいません" : "見つかりません"}
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
  dpc,
  onOpen,
}: {
  row: Row;
  patient: Patient;
  focused: boolean;
  upcoming: string[];
  flags: Flag[];
  dpc?: DpcBriefs[string];
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
        <div className="flex items-center gap-2">
          <PatientAvatar sex={p.sex} age={p.age} size={30} className="rounded-full" />
          <div>
            <div className="text-[10px] text-ink-faint">{p.kana}</div>
            <button type="button" onClick={onOpen} className="font-bold text-ai hover:underline">
              {p.name}
            </button>
          </div>
        </div>
      </td>
      <td className="whitespace-nowrap px-3 py-2">
        {ageSex(p)}
      </td>
      <td className="whitespace-nowrap px-3 py-2">
        <b>{row.day}日目</b>
        {p.admittedOn === 0 && <div className="text-[10px] font-bold text-ai">新入院</div>}
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-[12px]">
        <DpcCell b={dpc} />
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

function DpcCell({ b }: { b?: DpcBriefs[string] }) {
  if (!b) return <span className="text-ink-faint">—</span>;
  if (b === "loading") return <span className="text-ink-faint">計算中</span>;
  if (!b.ok) return <span className="text-[11px] text-ink-faint" title={b.reason}>コードなし</span>;
  const tip = `${b.code} ${b.name}${b.days ? `\n${rangesText(b.days)}` : ""}${b.provisional ? "\n医療資源を最も投入した傷病名を主治医がまだ選んでいないため、仮のコードで数えています" : ""}`;
  return (
    <div title={tip}>
      <b className={b.period === "Ⅲ" || b.period === "超え" ? "text-shu" : ""}>{b.hokatsu && b.period ? (b.period === "超え" ? "期間超え" : `期間${b.period}`) : "対象外"}</b>
      {b.provisional && <span className="ml-1 rounded border border-dashed border-ink-faint px-0.5 text-[10px] text-ink-soft">仮</span>}
      <div className="text-[11px] text-ink-soft">{periodNote(b)}</div>
    </div>
  );
}

function CondBar({ cond, choices, onChange }: { cond: ListFilter; choices: ReturnType<typeof choicesOf>; onChange: (c: ListFilter) => void }) {
  const set = (x: Partial<ListFilter>) => onChange({ ...cond, ...x });
  const sel = "rounded border border-rule bg-sheet px-1.5 py-0.5 text-[12px]";
  const pick = (label: string, value: string, options: string[], on: (v: string) => void) =>
    options.length > 1 || value ? (
      <label className="flex items-center gap-1">
        <span className="text-ink-faint">{label}</span>
        <select value={value} onChange={(e) => on(e.target.value)} className={`${sel} ${value ? "border-ai font-bold text-ai" : ""}`}>
          <option value="">すべて</option>
          {options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </label>
    ) : null;
  return (
    <div role="group" aria-label="条件" className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-b border-rule bg-sheet px-5 py-2 text-[12px]">
      {pick("病棟", cond.floor, choices.floors, (v) => set({ floor: v }))}
      {pick("診療科", cond.department, choices.departments, (v) => set({ department: v }))}
      {pick("主治医", cond.doctor, choices.doctors, (v) => set({ doctor: v }))}
      {pick("担当看護師", cond.nurse, choices.nurses, (v) => set({ nurse: v }))}
      {pick("入院日数", cond.days ? DAY_BUCKETS.find((b) => b.key === cond.days)!.label : "", DAY_BUCKETS.map((b) => b.label), (v) => set({ days: DAY_BUCKETS.find((b) => b.label === v)?.key ?? "" }))}
      {pick("DPC", cond.dpc ? (cond.dpc === "なし" ? "期間なし" : cond.dpc === "超え" ? "期間超え" : `期間${cond.dpc}`) : "", DPC_CHOICES.map((c) => (c === "なし" ? "期間なし" : c === "超え" ? "期間超え" : `期間${c}`)), (v) => set({ dpc: DPC_CHOICES.find((c) => (c === "なし" ? "期間なし" : c === "超え" ? "期間超え" : `期間${c}`) === v) ?? "" }))}
      {pick("印", cond.flag, choices.flags, (v) => set({ flag: v }))}
      <label className="flex items-center gap-1 text-ink-soft">
        <input type="checkbox" checked={cond.mine} onChange={(e) => set({ mine: e.target.checked })} />
        自分のチームだけ
      </label>
      <label className="flex items-center gap-1 text-ink-soft">
        <input type="checkbox" checked={cond.discharge} onChange={(e) => set({ discharge: e.target.checked })} />
        今日・明日に退院
      </label>
      {activeCount(cond) > 0 && (
        <button type="button" onClick={() => onChange(EMPTY_FILTER)} className="ml-auto inline-flex items-center gap-0.5 text-ink-faint hover:text-ink">
          <X size={12} />
          条件を消す
        </button>
      )}
    </div>
  );
}
