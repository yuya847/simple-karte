"use client";

import { PatientAvatar } from "./PatientAvatar";
import { ArrowDown, ArrowUp, Search, SlidersHorizontal, X } from "lucide-react";
import { useMemo, useState } from "react";
import { upcomingToday } from "@/lib/calendar";
import { abs } from "@/lib/flowsheet";
import { addDays, formatShort, hospitalDay } from "@/lib/dates";
import { currentEntries, ordersOf, type SessionChanges } from "@/lib/record";
import { flagsFor, type Flag, type FlagTone } from "@/lib/patient-flags";
import type { Patient } from "@/lib/types";
import { WARD_PLANS, doctorFor, floorOf, nurseFor, type BedAssignment, type WardPlan, type WardState } from "@/lib/ward";
import { expectedOf, isUnknownBed, markOf, markText, type Expected, type WardAsOf } from "@/lib/ward-asof";
import { AsOfBand, DayNav, type DayNavProps } from "./DayNav";
import { PickSelect, type ChartSummary, type Pick } from "./WardMap";
import { ageSex } from "@/lib/person";
import { periodNote, rangesText } from "@/lib/dpc-brief";
import { activeCount, choicesOf, DAY_BUCKETS, DPC_CHOICES, EMPTY_FILTER, flagKey, matches, type FilterFacts, type ListFilter } from "@/lib/patient-filter";
import { doctorNames, relationMark, relationOf, type PatientDoctors, type Relation } from "@/lib/patient-doctors";
import { useDpcBriefs, type DpcBriefs } from "@/lib/use-dpc-briefs";
import { useEmphasizeTeam } from "@/lib/use-emphasis";
import { EmphasisToggle } from "./EmphasisToggle";
import type { CalendarDate } from "@/lib/dates";
import type { OrderEntry } from "@/lib/types";

interface Props {
  /** The beds to list (a floor, 受け持ち, a department, all wards …) and the patient lookup. */
  ward: WardState;
  title: string;
  /** A pulldown in the header (◯階・科・主治医). */
  pick?: Pick;
  /** How the rows are grouped at first. */
  defaultGroup?: GroupBy;
  /** 日付の移動 in the header (a floor's list). */
  dayNav?: DayNavProps;
  /** The day shown, when `ward.beds` came from bedsAsOf (its marks are shown; another day gets a band). */
  asOf?: WardAsOf;
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
  /** The viewer's own team (受け持ち): it stands out while 「受け持ちを目立たせる」 is on. Everyone when not given. */
  mine?: (patientId: string) => boolean;
  /** 主治医・担当医・コンサルト医 of a patient with the record as it stands (the attending alone when not given). */
  doctorsOf?: (patientId: string, entries: OrderEntry[]) => PatientDoctors;
  /** The viewer's name when a doctor: each row shows how they relate to the patient (主治医／担当／コンサルト). */
  viewer?: string;
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
  /** The viewer's own team. */
  mine: boolean;
  /** The plan's mark on the bed（入院予定 14:00・退院予定 10:00・空く予定）, as text. */
  mark?: string;
  /** Someone expected on the bed who has no chart yet. */
  expected?: Expected;
}

/** What a row shows from the record, worked out once per change of the record (not on each keystroke). */
interface RowWork {
  entries: OrderEntry[];
  flags: Flag[];
  upcoming: string[];
  leaving: boolean;
  doctors?: PatientDoctors;
}

const roomKey = (b: BedAssignment) => `${b.room}-${b.bed}`;
const everyone = () => true;

/**
 * Ward patient list. Every patient opens on click or Enter. With 「受け持ちを目立たせる」 (the default) the
 * viewer's team gets the full row and the others a short gray one; without it, everyone gets the full row.
 */
export function PatientList({ ward, title, pick, defaultGroup = "room", dayNav, asOf, nowTime, changes, summaries, waiting, consentState = {}, marPending = {}, resultState = {}, extraFlags = {}, dpcPayload, today, mine: mineOf = everyone, doctorsOf, viewer, onOpen }: Props) {
  const [groupBy, setGroupBy] = useState<GroupBy>(defaultGroup);
  const [q, setQ] = useState("");
  const [cond, setCond] = useState<ListFilter>(EMPTY_FILTER);
  const [showCond, setShowCond] = useState(false);
  const [emphasize, setEmphasize] = useEmphasizeTeam();
  const [sort, setSort] = useState<{ key: SortKey; asc: boolean }>({ key: "room", asc: true });
  const [cursor, setCursor] = useState(0);
  const nowAbs = abs(0, nowTime);
  // The day listed (0 = today): 入院◯日目 and 新入院 are counted for it.
  const viewDay = asOf?.day ?? 0;
  const fmtDay = useMemo(() => dayNav?.fmtDay ?? ((d: number) => (today ? formatShort(addDays(today, d)) : `${d}日後`)), [dayNav, today]);

  const all: Row[] = useMemo(
    () =>
      ward.beds
        .filter((b) => !isUnknownBed(b))
        .map((b) => {
          const patient = b.patientId ? ward.patient(b.patientId) : undefined;
          const mark = markOf(b);
          const expected = expectedOf(b);
          return {
            bed: b,
            patient,
            kana: patient?.kana ?? b.other?.name ?? expected?.name ?? "",
            day: patient ? hospitalDay(patient.admittedOn, viewDay) : null,
            mine: !!patient && mineOf(patient.id),
            mark: mark ? markText(mark, viewDay, fmtDay) : undefined,
            expected,
          };
        }),
    [ward, mineOf, viewDay, fmtDay],
  );
  const full = (r: Row) => !!r.patient && (!emphasize || r.mine);
  // The DPC column is fetched for the full rows only (the gray rows show none).
  const payloadOf = useMemo(() => dpcPayload ?? (() => null), [dpcPayload]);
  const dpc = useDpcBriefs(
    all.flatMap((r) => (r.patient && full(r) ? [r.patient.id] : [])),
    payloadOf,
    today ?? null,
    nowTime,
    !!dpcPayload && !!today,
  );
  const work: Map<string, RowWork> = useMemo(
    () =>
      new Map(
        all.flatMap((r) => {
          const p = r.patient;
          if (!p) return [];
          const entries = ordersOf(currentEntries(p, changes[p.id]));
          const flags = [...(extraFlags[p.id] ?? []), ...flagsFor(p, entries, nowAbs, waiting[p.id] ?? 0, consentState[p.id], marPending[p.id] ?? 0, resultState[p.id])];
          const leaving = entries.some((e) => e.status === "有効" && e.order.type === "procedure" && e.order.leave?.kind === "退院" && e.order.leave.from.day >= 0 && e.order.leave.from.day <= 1);
          return [[p.id, { entries, flags, upcoming: upcomingToday(entries, nowAbs), leaving, doctors: doctorsOf?.(p.id, entries) }]];
        }),
      ),
    [all, changes, extraFlags, nowAbs, waiting, consentState, marPending, resultState, doctorsOf],
  );
  const facts: FilterFacts[] = useMemo(
    () =>
      all.map((r) => {
        const p = r.patient;
        const brief = p ? dpc[p.id] : undefined;
        const w = p ? work.get(p.id) : undefined;
        return {
          floor: floorOf(r.bed.room),
          department: p?.department ?? r.bed.other?.department ?? r.expected?.department ?? "",
          doctor: p?.attending ?? doctorFor(r.bed.other?.department ?? r.expected?.department ?? ""),
          others: w?.doctors?.others.map((d) => d.name),
          nurse: nurseFor(r.bed.room),
          day: r.day,
          dpc: brief && brief !== "loading" && brief.ok && brief.hokatsu ? brief.period : null,
          flags: w ? [...new Set(w.flags.map((f) => flagKey(f.label)))] : [],
          mine: r.mine,
          discharge: !!w?.leaving || WARD_PLANS.some((x) => x.kind === "退院" && x.room === r.bed.room && x.bed === r.bed.bed),
        };
      }),
    [all, dpc, work],
  );
  const choices = choicesOf(facts);
  const nCond = activeCount(cond);
  const rows: Row[] = useMemo(() => {
    const filtered = all.filter((r, i) => {
      if (!matches(facts[i], cond)) return false;
      const s = q.trim();
      if (!s) return true;
      const fields = [r.bed.room, r.patient?.name, r.patient?.kana, r.patient?.admissionDiagnosis, r.patient?.id, r.bed.other?.name, r.bed.other?.department, r.expected?.name, r.expected?.department];
      return fields.some((f) => f?.includes(s));
    });
    const dir = sort.asc ? 1 : -1;
    return filtered.sort((a, b) => {
      if (sort.key === "name") return dir * a.kana.localeCompare(b.kana, "ja");
      if (sort.key === "day") return dir * ((a.day ?? -1) - (b.day ?? -1));
      return dir * roomKey(a.bed).localeCompare(roomKey(b.bed));
    });
  }, [all, facts, q, sort, cond]);

  // 主治医別: a patient is listed under each of their doctors (主治医・担当医・コンサルト医), so none is missed.
  const groupsOf = (r: Row): string[] => {
    if (groupBy === "floor") return [floorOf(r.bed.room)];
    if (groupBy === "department") return [r.patient?.department ?? r.bed.other?.department ?? r.expected?.department ?? ""];
    if (groupBy === "doctor") {
      const pd = r.patient ? work.get(r.patient.id)?.doctors : undefined;
      return pd ? doctorNames(pd) : [r.patient?.attending ?? doctorFor(r.bed.other?.department ?? r.expected?.department ?? "")];
    }
    if (groupBy === "nurse") return [nurseFor(r.bed.room)];
    return [""];
  };
  const grouped: { key: string; rows: Row[] }[] = [];
  if (groupBy === "room") grouped.push({ key: "", rows });
  else {
    for (const r of rows) {
      for (const k of groupsOf(r)) {
        const g = grouped.find((x) => x.key === k);
        if (g) g.rows.push(r);
        else grouped.push({ key: k, rows: [r] });
      }
    }
    grouped.sort((a, b) => a.key.localeCompare(b.key, "ja"));
  }
  const ordered = grouped.flatMap((g) => g.rows);
  // A row listed under two doctors is one patient (↑↓ and Enter step through each once).
  const openable = ordered.filter((r, i) => r.patient && ordered.indexOf(r) === i);
  // The ward's fixed 退院 plans, shown on today's rows (on another day the bed's mark says it).
  const planFor = (b: BedAssignment) => (viewDay === 0 ? WARD_PLANS.filter((p) => p.kind === "退院" && p.room === b.room && p.bed === b.bed) : []);
  // Rows that are people (a bed that is 空く予定 is a row too, but not a person).
  const people = (rs: Row[]) => rs.filter((r) => r.patient || r.bed.other || r.expected).length;
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
          <span className="nums ml-2 text-sm font-normal text-ink-soft">{rows.length === all.length ? `${people(rows)}人` : `${people(rows)}人（全${people(all)}人）`}</span>
        </h1>
        {pick && <PickSelect pick={pick} />}
        {dayNav && <DayNav {...dayNav} />}
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
        <EmphasisToggle on={emphasize} onChange={setEmphasize} />
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

      {asOf && <AsOfBand asOf={asOf} fmtDay={fmtDay} />}

      <div className="scroll-thin min-h-0 flex-1 overflow-auto">
        <table className="nums w-full min-w-[1180px] border-collapse text-[13px]">
          <thead className="sticky top-0 z-10 bg-paper text-left text-[11px] text-ink-faint shadow-[0_1px_0_var(--color-rule)]">
            <tr>
              <th className="px-3 py-2 font-normal">{header("room", "病室")}</th>
              <th className="px-3 py-2 font-normal">{header("name", "氏名")}</th>
              <th className="px-3 py-2 font-normal">年齢性別・ID</th>
              <th className="px-3 py-2 font-normal">{header("day", "入院")}</th>
              <th className="px-3 py-2 font-normal" title="DPC（診断群分類）：カルテの病名と記録から、算定の DPC と同じ計算で出す分類と入院期間。医療資源を最も投入した傷病名を主治医が選ぶまでは仮">DPC</th>
              <th className="px-3 py-2 font-normal">診療科・担当</th>
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
                r.patient && full(r) ? (
                  <MyRow
                    key={`${g.key}|${roomKey(r.bed)}`}
                    row={r}
                    patient={r.patient}
                    focused={openable[at] === r}
                    upcoming={work.get(r.patient.id)?.upcoming ?? []}
                    flags={work.get(r.patient.id)?.flags ?? []}
                    dpc={dpc[r.patient.id]}
                    plans={planFor(r.bed)}
                    mark={r.mark}
                    day={viewDay}
                    summary={summaries[r.patient.id]}
                    doctors={work.get(r.patient.id)?.doctors}
                    viewer={viewer}
                    onOpen={() => onOpen(r.patient!.id)}
                  />
                ) : r.expected ? (
                  // 入院予定: no chart yet, so a dotted row with what the plan says.
                  <tr key={roomKey(r.bed)} className="border-b border-dashed border-ai/50 text-ai" title="入院予定（予定から）。カルテは入院を受けたときにできます">
                    <td className="px-3 py-1.5">
                      {r.bed.room}
                      {r.bed.bed && `-${r.bed.bed}`}
                    </td>
                    <td className="px-3 py-1.5">{r.expected.name}</td>
                    <td className="px-3 py-1.5">{ageSex(r.expected)}</td>
                    <td className="px-3 py-1.5 font-bold">{r.mark}</td>
                    <td className="px-3 py-1.5">—</td>
                    <td className="px-3 py-1.5 text-[11px]">
                      <div className="font-bold">{r.expected.department}</div>
                      <div>{doctorFor(r.expected.department)}</div>
                      <div>{nurseFor(r.bed.room)}</div>
                    </td>
                    <td className="px-3 py-1.5" colSpan={5}>
                      {r.expected.note}
                    </td>
                  </tr>
                ) : !r.patient && !r.bed.other && r.mark ? (
                  // 空く予定: the bed a patient leaves before the day shown.
                  <tr key={roomKey(r.bed)} className="border-b border-dashed border-wakatake/50 text-wakatake">
                    <td className="px-3 py-1.5">
                      {r.bed.room}
                      {r.bed.bed && `-${r.bed.bed}`}
                    </td>
                    <td className="px-3 py-1.5 font-bold" colSpan={10}>
                      {r.mark ?? "空床"}
                    </td>
                  </tr>
                ) : (
                  <tr
                    key={`${g.key}|${roomKey(r.bed)}`}
                    onClick={r.patient ? () => onOpen(r.patient!.id) : undefined}
                    className={`border-b border-rule-soft text-ink-faint ${r.patient ? "cursor-pointer hover:bg-ai-soft/30" : ""} ${openable[at] === r ? "outline outline-2 -outline-offset-2 outline-ai" : ""}`}
                    title={r.patient ? "受け持ち以外の患者（架空）。押すとカルテが開きます（開いた記録は監査ログに残ります）" : "受け持ち以外の患者（架空）"}
                  >
                    <td className="px-3 py-1.5">
                      {r.bed.room}
                      {r.bed.bed && `-${r.bed.bed}`}
                    </td>
                    <td className="px-3 py-1.5">
                      {r.patient ? (
                        <>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onOpen(r.patient!.id);
                            }}
                            className="text-ink-soft hover:text-ai hover:underline"
                          >
                            {r.patient.name}
                          </button>
                          <RelationMark viewer={viewer} doctors={work.get(r.patient.id)?.doctors ?? { attending: r.patient.attending, others: [] }} />
                        </>
                      ) : (
                        r.bed.other?.name
                      )}
                    </td>
                    <td className="px-3 py-1.5">
                      {r.patient ? ageSex(r.patient) : r.bed.other ? ageSex(r.bed.other) : ""}
                    </td>
                    <td className="px-3 py-1.5">
                      {r.day ? `${r.day}日目` : "—"}
                      {r.patient && r.patient.admittedOn === viewDay && <span className="ml-1 text-[10px] font-bold text-ai">新入院</span>}
                    </td>
                    <td className="px-3 py-1.5">—</td>
                    <td className="px-3 py-1.5 text-[11px]">
                      <div className="font-bold">{r.patient?.department ?? r.bed.other?.department}</div>
                      <DoctorLines attending={r.patient?.attending ?? doctorFor(r.bed.other?.department ?? "")} doctors={r.patient ? work.get(r.patient.id)?.doctors : undefined} />
                      <div>{nurseFor(r.bed.room)}</div>
                    </td>
                    <td className="px-3 py-1.5" colSpan={5}>
                      {r.mark && <span className="mr-2 font-bold text-wakatake">{r.mark}</span>}
                      {[...planFor(r.bed).map(planText), r.bed.other?.note].filter((x) => x && !(x === "明日退院" && (planFor(r.bed).length || r.mark))).join("　")}
                    </td>
                  </tr>
                ),
              ),
            ])}
            {rows.length === 0 && (
              <tr>
                <td colSpan={11} className="px-3 py-6 text-center text-ink-faint">
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
  mark,
  day,
  summary,
  dpc,
  doctors,
  viewer,
  onOpen,
}: {
  row: Row;
  patient: Patient;
  focused: boolean;
  upcoming: string[];
  flags: Flag[];
  dpc?: DpcBriefs[string];
  plans: WardPlan[];
  /** The bed's mark on the day shown（退院予定 10:00）. */
  mark?: string;
  /** The day shown (0 = today). On another day, today's vitals, results and plans for today are not shown. */
  day: number;
  summary?: ChartSummary;
  doctors?: PatientDoctors;
  viewer?: string;
  onOpen: () => void;
}) {
  const today = day === 0;
  const latest = today ? p.vitals.at(-1) : undefined;
  const newResults = today
    ? [...p.cultures.filter((c) => c.reportedOn === 0).map((c) => `${c.specimen}培養`), ...(p.labs.some((l) => l.day === 0) ? ["採血"] : [])]
    : [];
  return (
    <tr
      onClick={onOpen}
      className={`cursor-pointer border-b border-rule-soft bg-sheet align-top hover:bg-ai-soft/40 ${focused ? "outline outline-2 -outline-offset-2 outline-ai" : ""} ${mark?.startsWith("退院予定") ? "opacity-70" : ""}`}
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
            <button
              type="button"
              onClick={(e) => {
                // The row opens it too: once is enough (each opening is written to the audit log).
                e.stopPropagation();
                onOpen();
              }}
              className="font-bold text-ai hover:underline"
            >
              {p.name}
            </button>
            <RelationMark viewer={viewer} doctors={doctors ?? { attending: p.attending, others: [] }} />
          </div>
        </div>
      </td>
      <td className="whitespace-nowrap px-3 py-2">
        <div>{ageSex(p)}</div>
        <div className="nums text-[11px] text-ink-faint">{p.id}</div>
      </td>
      <td className="whitespace-nowrap px-3 py-2">
        <b>{row.day}日目</b>
        {p.admittedOn === day && <div className="text-[10px] font-bold text-ai">新入院</div>}
      </td>
      <td className="px-3 py-2 text-[12px]">
        <DpcCell b={dpc} />
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-[11px] text-ink-soft">
        <div className="font-bold text-ink">{p.department}</div>
        <DoctorLines attending={p.attending} doctors={doctors} />
        <div>{nurseFor(row.bed.room)}</div>
      </td>
      <td className="px-3 py-2">
        {/* The ward's plan and the 退院 order say the same thing: shown once. On another day the bed's mark comes first and the marks of today's record are left out. */}
        <Flags flags={[...(mark ? [{ label: mark, tone: "wakatake" as const }] : []), ...plans.map((x) => ({ label: planText(x), tone: "wakatake" as const })), ...(today ? flags : [])].filter((f, i, xs) => xs.findIndex((y) => y.label === f.label) === i)} />
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-[12px]">
        {!today && <span className="text-ink-faint">—</span>}
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
        {upcoming.length === 0 || !today ? (
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
        {today && summary?.drafts ? <div className="font-bold text-yamabuki">下書き {summary.drafts}件</div> : null}
        {today && summary?.confirmedToday ? <div className="text-wakatake">今日確定 {summary.confirmedToday}件</div> : null}
        {(!today || (!summary?.drafts && !summary?.confirmedToday)) && <span className="text-ink-faint">—</span>}
      </td>
    </tr>
  );
}

/** The attending, then each 担当医・コンサルト医 on its own line (依頼中 in yellow). */
function DoctorLines({ attending, doctors }: { attending: string; doctors?: PatientDoctors }) {
  return (
    <>
      <div>{attending}</div>
      {doctors?.others.map((d) => (
        <div key={`${d.role}:${d.name}`} className={d.pending ? "text-yamabuki" : "text-ink-faint"}>
          {relationMark(d.role)} {d.name}
          {d.pending ? "（依頼中）" : ""}
        </div>
      ))}
    </>
  );
}

const RELATION_TONE: Record<Relation, string> = { 主治医: "bg-ai-soft text-ai", 担当医: "bg-wakatake-soft text-wakatake", コンサルト医: "bg-fuji-soft text-fuji" };

/** How the viewer (a doctor) relates to the patient: 主治医／担当／コンサルト. Nothing for other roles or no relation. */
function RelationMark({ viewer, doctors }: { viewer?: string; doctors: PatientDoctors }) {
  const r = viewer ? relationOf(viewer, doctors) : null;
  if (!r) return null;
  return (
    <span className={`ml-1 rounded px-1 text-[10px] font-bold ${RELATION_TONE[r]}`} title={`あなたはこの患者の${r}です`}>
      {relationMark(r)}
    </span>
  );
}

function DpcCell({ b }: { b?: DpcBriefs[string] }) {
  if (!b) return <span className="text-ink-faint">—</span>;
  if (b === "loading") return <span className="text-ink-faint">計算中</span>;
  if (!b.ok) return <span className="text-[11px] text-ink-faint" title={b.reason}>コードなし</span>;
  const tip = `${b.code} ${b.name}${b.days ? `\n${rangesText(b.days)}` : ""}${b.provisional ? "\n医療資源を最も投入した傷病名を主治医がまだ選んでいないため、仮のコードで数えています" : ""}`;
  return (
    <div title={tip} className="max-w-56 whitespace-normal">
      <div className="font-bold text-ink">
        {b.name}
        {b.provisional && <span className="ml-1 rounded border border-dashed border-ink-faint px-0.5 text-[10px] font-normal text-ink-soft">仮</span>}
      </div>
      <div className="nums text-[10px] text-ink-faint">{b.code}</div>
      <div className="text-[11px]">
        <b className={b.period === "Ⅲ" || b.period === "超え" ? "text-shu" : ""}>{b.hokatsu && b.period ? (b.period === "超え" ? "期間超え" : `期間${b.period}`) : "包括の対象外"}</b>
        <span className="ml-1 text-ink-soft">{b.hokatsu ? periodNote(b) : ""}</span>
      </div>
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
