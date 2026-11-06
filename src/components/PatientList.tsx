"use client";
import { expiryFlags, expiryKey, rxExpiries } from "@/lib/rx-expiry";
import { roomLabel } from "@/lib/place-label";

import { displayText } from "@/lib/display-text";
import { ArrowDown, ArrowUp, Columns3, Search, SlidersHorizontal, X } from "lucide-react";
import { useContext, useMemo, useState } from "react";
import { upcomingToday } from "@/lib/calendar";
import { abs } from "@/lib/flowsheet";
import { addDays, formatShort, hospitalDay } from "@/lib/dates";
import { currentEntries, ordersOf, type SessionChanges } from "@/lib/record";
import { flagsFor, type Flag } from "@/lib/patient-flags";
import { WARD_PLANS, doctorFor, floorOf, nurseFor, type BedAssignment, type WardState } from "@/lib/ward";
import { expectedOf, isUnknownBed, markOf, markText, type WardAsOf } from "@/lib/ward-asof";
import { AsOfBand, DayNav, type DayNavProps } from "./DayNav";
import { PickSelect, type ChartSummary, type Pick } from "./WardMap";
import { ageSex } from "@/lib/person";
import { activeCount, choicesOf, DAY_BUCKETS, DPC_CHOICES, EMPTY_FILTER, flagKey, matches, type FilterFacts, type ListFilter } from "@/lib/patient-filter";
import { doctorNames, type PatientDoctors } from "@/lib/patient-doctors";
import { useDpcBriefs } from "@/lib/use-dpc-briefs";
import { useEmphasizeTeam } from "@/lib/use-emphasis";
import { EmphasisToggle } from "./EmphasisToggle";
import { LIST_COLUMNS, showsColumn, toggleColumn, type ListPrefs } from "@/lib/list-prefs";
import { useListPrefs } from "@/lib/use-list-prefs";
import { useFavorites } from "@/lib/use-favorites";
import { planText, roomKey, visibleColumns, type Row, type SortKey } from "./patient-columns";
import type { CalendarDate } from "@/lib/dates";
import type { OrderEntry } from "@/lib/types";

import { NoteOverviewContext, patientTodoDone } from "./NoteOverview";
import { noteOverview } from "@/lib/note-overview";

interface Props {
  expiryDone?: Record<string, { id: string }[]>;
  /** The beds to list (a floor, 受け持ち, a department, all wards …) and the patient lookup. */
  ward: WardState;
  title: string;
  /** A pulldown in the header (病棟: 全病棟 or one ward; チーム). */
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
  /** Opens the chart with 患者基本情報 on top (the card icon after the name). */
  onInfo?: (patientId: string) => void;
}

/** What this person chose in this browser: the columns and row height (「表示」) and the starred patients (☆). */
interface Prefs {
  prefs: ListPrefs;
  onPrefs: (p: ListPrefs) => void;
  favorites: string[];
  onToggleFavorite: (id: string) => void;
}

export type GroupBy = "room" | "floor" | "department" | "doctor" | "nurse" | "favorite";
const GROUPS: { key: GroupBy; label: string }[] = [
  { key: "room", label: "部屋順" },
  { key: "floor", label: "病棟" },
  { key: "department", label: "診療科" },
  { key: "doctor", label: "主治医" },
  { key: "nurse", label: "担当看護師" },
  { key: "favorite", label: "お気に入り順" },
];

/** What a row shows from the record, worked out once per change of the record (not on each keystroke). */
interface RowWork {
  entries: OrderEntry[];
  flags: Flag[];
  upcoming: string[];
  leaving: boolean;
  doctors?: PatientDoctors;
}

const everyone = () => true;

/**
 * Ward patient list. Every patient opens on click or Enter. With 「受け持ちを目立たせる」 (the default) the
 * viewer's team gets the full row and the others a short gray one; without it, everyone gets the full row.
 * The columns, the row height and the stars are this person's, kept in this browser (list-prefs, favorites).
 */
export function PatientList(props: Props) {
  const [prefs, onPrefs] = useListPrefs();
  const [favorites, onToggleFavorite] = useFavorites();
  return <PatientListView {...props} prefs={prefs} onPrefs={onPrefs} favorites={favorites} onToggleFavorite={onToggleFavorite} />;
}

/** The list with its choices given (PatientList reads them for the person; tests pass them). */
export function PatientListView({ ward, title, pick, defaultGroup = "room", dayNav, asOf, nowTime, changes, summaries, waiting, consentState = {}, marPending = {}, resultState = {}, extraFlags = {}, expiryDone = {}, dpcPayload, today, mine: mineOf = everyone, doctorsOf, viewer, onOpen, onInfo, prefs, onPrefs, favorites, onToggleFavorite }: Props & Prefs) {
  const overview = useContext(NoteOverviewContext);
  const [groupBy, setGroupBy] = useState<GroupBy>(defaultGroup);
  const [q, setQ] = useState("");
  const [cond, setCond] = useState<ListFilter>(EMPTY_FILTER);
  const [showCond, setShowCond] = useState(false);
  const [showView, setShowView] = useState(false);
  const [emphasize, setEmphasize] = useEmphasizeTeam();
  const [sort, setSort] = useState<{ key: SortKey; asc: boolean }>({ key: "room", asc: true });
  const [cursor, setCursor] = useState(0);
  const nowAbs = abs(0, nowTime);
  // The day listed (0 = today): 入院◯日目 and 新入院 are counted for it.
  const viewDay = asOf?.day ?? 0;
  const fmtDay = useMemo(() => dayNav?.fmtDay ?? ((d: number) => (today ? formatShort(addDays(today, d)) : `${d}日後`)), [dayNav, today]);
  const columns = visibleColumns(prefs.hidden);
  const compact = prefs.density === "compact";
  const starred = (id: string) => favorites.includes(id);

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
  // The DPC column is fetched for the full rows only (the gray rows show none), and not while it is turned off.
  const payloadOf = useMemo(() => dpcPayload ?? (() => null), [dpcPayload]);
  const dpc = useDpcBriefs(
    all.flatMap((r) => (r.patient && full(r) ? [r.patient.id] : [])),
    payloadOf,
    today ?? null,
    nowTime,
    !!dpcPayload && !!today && showsColumn(prefs, "dpc"),
  );
  const work: Map<string, RowWork> = useMemo(
    () =>
      new Map(
        all.flatMap((r) => {
          const p = r.patient;
          if (!p) return [];
          const entries = ordersOf(currentEntries(p, changes[p.id]));
          const flags = [...(extraFlags[p.id] ?? []), ...flagsFor(p, entries, nowAbs, waiting[p.id] ?? 0, consentState[p.id], marPending[p.id] ?? 0, resultState[p.id])];
          const expiry = rxExpiries(p, entries, today).filter(r => !(expiryDone[p.id] ?? []).some(s => s.id === `${expiryKey(r)}:done`));
          const visibleFlags = [...flags.filter(f => !f.label.startsWith("処方切れ")), ...expiryFlags(expiry)];
          const leaving = entries.some((e) => e.status === "有効" && e.order.type === "procedure" && e.order.leave?.kind === "退院" && e.order.leave.from.day >= 0 && e.order.leave.from.day <= 1);
          return [[p.id, { entries, flags: visibleFlags, upcoming: upcomingToday(entries, nowAbs), leaving, doctors: doctorsOf?.(p.id, entries) }]];
        }),
      ),
    [all, changes, extraFlags, expiryDone, today, nowAbs, waiting, consentState, marPending, resultState, doctorsOf],
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
          favorite: !!p && favorites.includes(p.id),
        };
      }),
    [all, dpc, work, favorites],
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
      if (sort.key === "todo") return dir * (noteOverview(overview.entriesOf(b.patient?.id ?? ""), overview.role === "看護師" ? "看護師" : "医師", patientTodoDone(overview.done, b.patient?.id ?? "")).todos.length - noteOverview(overview.entriesOf(a.patient?.id ?? ""), overview.role === "看護師" ? "看護師" : "医師", patientTodoDone(overview.done, a.patient?.id ?? "")).todos.length);
      if (sort.key === "name") return dir * a.kana.localeCompare(b.kana, "ja");
      if (sort.key === "day") return dir * ((a.day ?? -1) - (b.day ?? -1));
      return dir * roomKey(a.bed).localeCompare(roomKey(b.bed));
    });
  }, [all, facts, q, sort, cond, overview]);

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
  else if (groupBy === "favorite") {
    // ☆ first, then everyone else (each part in the sort chosen).
    const fav = rows.filter((r) => r.patient && starred(r.patient.id));
    const rest = rows.filter((r) => !(r.patient && starred(r.patient.id)));
    grouped.push({ key: "お気に入り", rows: fav });
    if (rest.length) grouped.push({ key: "そのほか", rows: rest });
  } else {
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

  // The cells' padding follows 行の高さ; the gray rows are a little tighter, as before.
  const padFull = compact ? "px-3 py-0.5" : "px-3 py-2";
  const padGray = compact ? "px-3 py-0.5" : "px-3 py-1.5";
  // A gray row's note (the bed's mark, the ward's plan, the bed's note) and an 入院予定 row's note span the
  // columns that have no gray cell of their own (印 … 指示).
  const tail = columns.filter((c) => !c.gray).length;
  const nHidden = LIST_COLUMNS.filter((c) => !showsColumn(prefs, c.key)).length;

  return (
    <section aria-label="患者一覧" className="flex min-h-0 flex-1 flex-col bg-paper">
      <header className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-rule bg-sheet px-5 py-3">
        <h1 className="text-lg font-bold">
          {title}

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
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowView((v) => !v)}
            aria-expanded={showView}
            aria-haspopup="dialog"
            title="表示する列と行の高さ"
            className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-sm ${nHidden || compact ? "border-ai bg-ai-soft font-bold text-ai" : "border-rule text-ink-soft hover:text-ink"}`}
          >
            <Columns3 size={14} />
            表示{nHidden ? `（${LIST_COLUMNS.length - nHidden}/${LIST_COLUMNS.length}列）` : ""}
          </button>
          {showView && <ViewMenu prefs={prefs} onChange={onPrefs} onClose={() => setShowView(false)} />}
        </div>
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
        <table className={`nums w-full border-collapse text-[13px] ${nHidden ? "" : "min-w-[1180px]"}`}>
          <thead className="sticky top-0 z-10 bg-paper text-left text-[11px] text-ink-faint shadow-[0_1px_0_var(--color-rule)]">
            <tr>
              {columns.map((c) => (
                <th key={c.key} className="whitespace-nowrap px-3 py-2 font-normal" title={c.title}>
                  {c.sort ? header(c.sort, c.label) : c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grouped.map((g) => [
              g.key ? (
                <tr key={`g-${g.key}`}>
                  <td colSpan={columns.length} className="sticky left-0 border-b border-rule bg-tab/60 px-3 py-1 text-[12px] font-bold text-ink-soft">
                    {g.key}
                    <span className="ml-2 font-normal">{g.rows.length}人</span>
                  </td>
                </tr>
              ) : null,
              ...g.rows.map((r) =>
                r.patient && full(r) ? (
                  <tr
                    key={`${g.key}|${roomKey(r.bed)}`}
                    onClick={() => onOpen(r.patient!.id)}
                    className={`cursor-pointer border-b border-rule-soft bg-sheet align-top hover:bg-ai-soft/40 ${openable[at] === r ? "outline outline-2 -outline-offset-2 outline-ai" : ""} ${r.mark?.startsWith("退院予定") ? "opacity-70" : ""}`}
                  >
                    {columns.map((c) => (
                      <td key={c.key} className={`${padFull} ${c.fullClass ?? ""}`}>
                        {c.full({
                          row: r,
                          patient: r.patient!,
                          upcoming: work.get(r.patient!.id)?.upcoming ?? [],
                          flags: work.get(r.patient!.id)?.flags ?? [],
                          dpc: dpc[r.patient!.id],
                          plans: planFor(r.bed),
                          mark: r.mark,
                          day: viewDay,
                          summary: summaries[r.patient!.id],
                          doctors: work.get(r.patient!.id)?.doctors,
                          viewer,
                          compact,
                          starred: starred(r.patient!.id),
                          onStar: () => onToggleFavorite(r.patient!.id),
                          onOpen: () => onOpen(r.patient!.id),
                          onInfo: onInfo && (() => onInfo(r.patient!.id)),
                        })}
                      </td>
                    ))}
                  </tr>
                ) : r.expected ? (
                  // 入院予定: no chart yet, so a dotted row with what the plan says.
                  <tr key={roomKey(r.bed)} className="border-b border-dashed border-ai/50 text-ai" title="入院予定（予定から）。カルテは入院を受けたときにできます">
                    {columns.map((c) =>
                      c.key === "room" ? (
                        <td key={c.key} className={padGray}>
                          {roomLabel(r.bed.room, r.bed.bed)}
                        </td>
                      ) : c.key === "name" ? (
                        <td key={c.key} className={padGray}>
                          {r.expected!.name}
                        </td>
                      ) : c.key === "ageId" ? (
                        <td key={c.key} className={padGray}>
                          {ageSex(r.expected!)}
                        </td>
                      ) : c.key === "day" ? (
                        <td key={c.key} className={`${padGray} font-bold`}>
                          {r.mark}
                        </td>
                      ) : c.key === "dpc" ? (
                        <td key={c.key} className={padGray}>
                          —
                        </td>
                      ) : c.key === "team" ? (
                        <td key={c.key} className={`${padGray} text-[11px]`}>
                          <div className="font-bold">{r.expected!.department}</div>
                          <div>{doctorFor(r.expected!.department)}</div>
                          <div>{nurseFor(r.bed.room)}</div>
                        </td>
                      ) : null,
                    )}
                    {tail > 0 && (
                      <td className={padGray} colSpan={tail}>
                        {displayText(r.expected.note)}
                      </td>
                    )}
                  </tr>
                ) : !r.patient && !r.bed.other && r.mark ? (
                  // 空く予定: the bed a patient leaves before the day shown.
                  <tr key={roomKey(r.bed)} className="border-b border-dashed border-wakatake/50 text-wakatake">
                    <td className={padGray}>
                      {roomLabel(r.bed.room, r.bed.bed)}
                    </td>
                    <td className={`${padGray} font-bold`} colSpan={columns.length - 1}>
                      {r.mark ?? "空床"}
                    </td>
                  </tr>
                ) : (
                  <tr
                    key={`${g.key}|${roomKey(r.bed)}`}
                    onClick={r.patient ? () => onOpen(r.patient!.id) : undefined}
                    className={`border-b border-rule-soft text-ink-faint ${r.patient ? "cursor-pointer hover:bg-ai-soft/30" : ""} ${openable[at] === r ? "outline outline-2 -outline-offset-2 outline-ai" : ""}`}
                    title={r.patient ? "受け持ち以外の患者。押すとカルテが開きます（開いた記録は監査ログに残ります）" : "受け持ち以外の患者"}
                  >
                    {columns.map((c) =>
                      c.gray ? (
                        <td key={c.key} className={`${padGray} ${c.grayClass ?? ""}`}>
                          {c.gray({
                            row: r,
                            day: viewDay,
                            doctors: r.patient ? work.get(r.patient.id)?.doctors : undefined,
                            viewer,
                            starred: !!r.patient && starred(r.patient.id),
                            onStar: () => r.patient && onToggleFavorite(r.patient.id),
                            onOpen: () => r.patient && onOpen(r.patient.id),
                            onInfo: onInfo && r.patient ? () => onInfo(r.patient!.id) : undefined,
                          })}
                        </td>
                      ) : null,
                    )}
                    {tail > 0 && (
                      <td className={padGray} colSpan={tail}>
                        {r.mark && <span className="mr-2 font-bold text-wakatake">{r.mark}</span>}
                        {displayText([...planFor(r.bed).map(planText), r.bed.other?.note].filter((x) => x && !(x === "明日退院" && (planFor(r.bed).length || r.mark))).join("　"))}
                      </td>
                    )}
                  </tr>
                ),
              ),
            ])}
            {rows.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-3 py-6 text-center text-ink-faint">
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

/** 「表示」: the columns to show and the row height, for this person in this browser. */
function ViewMenu({ prefs, onChange, onClose }: { prefs: ListPrefs; onChange: (p: ListPrefs) => void; onClose: () => void }) {
  return (
    <>
      <div className="fixed inset-0 z-10" onClick={onClose} aria-hidden="true" />
      <div role="dialog" aria-label="表示" className="absolute left-0 top-full z-20 mt-1 w-64 rounded-md border border-rule bg-sheet p-3 text-[12px] shadow-lg">
        <div className="mb-1 flex items-baseline justify-between">
          <b className="text-ink-soft">列</b>
          {prefs.hidden.length > 0 && (
            <button type="button" onClick={() => onChange({ ...prefs, hidden: [] })} className="text-ink-faint hover:text-ink">
              すべて出す
            </button>
          )}
        </div>
        <p className="mb-1 text-[11px] text-ink-faint">病室・氏名はいつも出ます。</p>
        <ul className="grid grid-cols-2 gap-x-3 gap-y-1">
          {LIST_COLUMNS.map((c) => (
            <li key={c.key}>
              <label className="flex items-center gap-1.5">
                <input type="checkbox" checked={showsColumn(prefs, c.key)} onChange={() => onChange(toggleColumn(prefs, c.key))} />
                {c.label}
              </label>
            </li>
          ))}
        </ul>
        <div role="radiogroup" aria-label="行の高さ" className="mt-3 flex items-center gap-2">
          <b className="text-ink-soft">行の高さ</b>
          <div className="flex rounded-md border border-rule p-0.5">
            {(["normal", "compact"] as const).map((d) => (
              <button
                key={d}
                type="button"
                role="radio"
                aria-checked={prefs.density === d}
                onClick={() => onChange({ ...prefs, density: d })}
                className={`rounded px-2 py-0.5 ${prefs.density === d ? "bg-ink font-bold text-white" : "text-ink-soft hover:text-ink"}`}
              >
                {d === "normal" ? "ふつう" : "つめる"}
              </button>
            ))}
          </div>
        </div>
        <p className="mt-2 text-[11px] text-ink-faint">
          この選択は自分の名前で、この端末のみに保存されます。
        </p>
      </div>
    </>
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
      <label className="flex items-center gap-1 text-ink-soft" title="氏名の横の☆で登録した患者（この端末のみに保存）">
        <input type="checkbox" checked={cond.favorite} onChange={(e) => set({ favorite: e.target.checked })} />
        お気に入りだけ
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

/* Help migration source (references and dynamic wording):
<span >列を外しても記録は変わりません。外した列の印や結果はカルテで見られます。</span>
*/
