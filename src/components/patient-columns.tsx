"use client";

// The columns of the ward patient list: one definition draws the heading, the full row (the viewer's team)
// and the gray row (the others), so 「表示」 can turn a column off in all three at once. 病室 and 氏名 are
// always shown; the rest are the ListColumn keys of list-prefs.ts.

import { displayText } from "@/lib/display-text";
import { IdCard } from "lucide-react";
import type { ReactNode } from "react";
import { PatientAvatar } from "./PatientAvatar";
import { StarButton } from "./StarButton";
import type { ChartSummary } from "./WardMap";
import type { ListColumn } from "@/lib/list-prefs";
import { relationMark, relationOf, type PatientDoctors, type Relation } from "@/lib/patient-doctors";
import type { Flag, FlagTone } from "@/lib/patient-flags";
import { ageSex } from "@/lib/person";
import { periodNote, rangesText } from "@/lib/dpc-brief";
import type { DpcBriefs } from "@/lib/use-dpc-briefs";
import type { Patient } from "@/lib/types";
import { doctorFor, nurseFor, type BedAssignment, type WardPlan } from "@/lib/ward";
import type { Expected } from "@/lib/ward-asof";

export type SortKey = "room" | "name" | "day";

export interface Row {
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

export const roomKey = (b: BedAssignment) => `${b.room}${b.bed}`;
export const planText = (p: WardPlan) => `${p.day === 0 ? "今日" : "明日"} ${p.time} ${p.kind}`;

const TONE: Record<FlagTone, string> = {
  shu: "bg-shu-soft text-shu",
  fuji: "bg-fuji-soft text-fuji",
  ai: "bg-ai-soft text-ai",
  yamabuki: "bg-yamabuki-soft text-yamabuki",
  wakatake: "bg-wakatake-soft text-wakatake",
  ink: "bg-tab text-ink-soft",
};

export function Flags({ flags }: { flags: Flag[] }) {
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

export function DpcCell({ b }: { b?: DpcBriefs[string] }) {
  if (!b) return <span className="text-ink-faint">—</span>;
  if (b === "loading") return <span className="text-ink-faint">計算中</span>;
  if (!b.ok) return <span className="text-[11px] text-ink-faint" title={displayText(b.reason)}>コードなし</span>;
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

/** The attending, then each 担当医・コンサルト医 on its own line (依頼中 in yellow). */
export function DoctorLines({ attending, doctors }: { attending: string; doctors?: PatientDoctors }) {
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
export function RelationMark({ viewer, doctors }: { viewer?: string; doctors: PatientDoctors }) {
  const r = viewer ? relationOf(viewer, doctors) : null;
  if (!r) return null;
  return (
    <span className={`ml-1 rounded px-1 text-[10px] font-bold ${RELATION_TONE[r]}`} title={`あなたはこの患者の${r}です`}>
      {relationMark(r)}
    </span>
  );
}

/** What a full row's cells get (a patient of the viewer's team, or everyone when 「受け持ちを目立たせる」 is off). */
export interface FullCell {
  row: Row;
  patient: Patient;
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
  /** 行の高さ「つめる」: no avatar or kana line. */
  compact: boolean;
  starred: boolean;
  onStar: () => void;
  onOpen: () => void;
  /** Opens the chart with 患者基本情報 (住所・連絡先・家族 …) on top. */
  onInfo?: () => void;
}

/** What a gray row's cells get (another team's patient, or a bed whose patient this prototype has no chart of). */
export interface GrayCell {
  row: Row;
  /** The day shown (0 = today). */
  day: number;
  doctors?: PatientDoctors;
  viewer?: string;
  starred: boolean;
  onStar: () => void;
  onOpen: () => void;
  onInfo?: () => void;
}

/** The small card icon after a name: opens 患者基本情報 (the chart opens under it). */
function InfoButton({ name, onInfo }: { name: string; onInfo?: () => void }) {
  if (!onInfo) return null;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onInfo();
      }}
      aria-label={`${name}の患者基本情報を開く`}
      title="患者基本情報（住所・連絡先・家族・保険・入院前の情報収集）を開く"
      className="rounded p-0.5 text-ink-faint hover:bg-paper hover:text-ai pointer-coarse:p-1.5"
    >
      <IdCard size={14} />
    </button>
  );
}

export interface Column {
  key: "room" | "name" | ListColumn;
  label: string;
  /** The heading sorts the rows when given. */
  sort?: SortKey;
  /** The heading's tooltip. */
  title?: string;
  /** Classes of the full row's cell (besides the padding). */
  fullClass?: string;
  full: (c: FullCell) => ReactNode;
  /** The gray row's cell. Columns without one are covered by the row's note (the bed's mark, the ward's plans, the bed's note). */
  gray?: (c: GrayCell) => ReactNode;
  grayClass?: string;
}

export const COLUMNS: Column[] = [
  {
    key: "room",
    label: "病室",
    sort: "room",
    fullClass: "font-bold",
    full: ({ row }) => (
      <>
        {row.bed.room}
        {row.bed.bed && <span className="text-ink-faint">-{row.bed.bed}</span>}
      </>
    ),
    gray: ({ row }) => (
      <>
        {row.bed.room}
        {row.bed.bed && `-${row.bed.bed}`}
      </>
    ),
  },
  {
    key: "name",
    label: "氏名",
    sort: "name",
    full: ({ patient: p, compact, doctors, viewer, starred, onStar, onOpen, onInfo }) => (
      // The name never wraps (ユーザー 2026-11-06): the column keeps the width the longest name needs.
      <div className="flex items-center gap-2 whitespace-nowrap">
        {!compact && <PatientAvatar sex={p.sex} age={p.age} size={30} className="rounded-full" />}
        <div className="whitespace-nowrap">
          {!compact && <div className="text-[10px] text-ink-faint">{p.kana}</div>}
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
        <StarButton on={starred} name={p.name} onToggle={onStar} />
        <InfoButton name={p.name} onInfo={onInfo} />
      </div>
    ),
    gray: ({ row, doctors, viewer, starred, onStar, onOpen, onInfo }) =>
      row.patient ? (
        <span className="inline-flex items-center gap-1">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpen();
            }}
            className="text-ink-soft hover:text-ai hover:underline"
          >
            {row.patient.name}
          </button>
          <RelationMark viewer={viewer} doctors={doctors ?? { attending: row.patient.attending, others: [] }} />
          <StarButton on={starred} name={row.patient.name} onToggle={onStar} />
          <InfoButton name={row.patient.name} onInfo={onInfo} />
        </span>
      ) : (
        row.bed.other?.name
      ),
  },
  {
    key: "ageId",
    label: "年齢性別・ID",
    fullClass: "whitespace-nowrap",
    full: ({ patient: p }) => (
      <>
        <div>{ageSex(p)}</div>
        <div className="nums text-[11px] text-ink-faint">{p.id}</div>
      </>
    ),
    gray: ({ row }) => (row.patient ? ageSex(row.patient) : row.bed.other ? ageSex(row.bed.other) : ""),
  },
  {
    key: "day",
    label: "入院",
    sort: "day",
    fullClass: "whitespace-nowrap",
    full: ({ row, patient: p, day }) => (
      <>
        <b>{row.day}日目</b>
        {p.admittedOn === day && <div className="text-[10px] font-bold text-ai">新入院</div>}
      </>
    ),
    gray: ({ row, day }) => (
      <>
        {row.day ? `${row.day}日目` : "—"}
        {row.patient && row.patient.admittedOn === day && <span className="ml-1 text-[10px] font-bold text-ai">新入院</span>}
      </>
    ),
  },
  {
    key: "dpc",
    label: "DPC",
    title: "DPC（診断群分類）：カルテの病名と記録から、算定の DPC と同じ計算で出す分類と入院期間。医療資源を最も投入した傷病名を主治医が選ぶまでは仮",
    fullClass: "text-[12px]",
    full: ({ dpc }) => <DpcCell b={dpc} />,
    gray: () => "—",
  },
  {
    key: "team",
    label: "診療科・担当",
    fullClass: "whitespace-nowrap text-[11px] text-ink-soft",
    full: ({ row, patient: p, doctors }) => (
      <>
        <div className="font-bold text-ink">{p.department}</div>
        <DoctorLines attending={p.attending} doctors={doctors} />
        <div>{nurseFor(row.bed.room)}</div>
      </>
    ),
    grayClass: "text-[11px]",
    gray: ({ row, doctors }) => (
      <>
        <div className="font-bold">{row.patient?.department ?? row.bed.other?.department}</div>
        <DoctorLines attending={row.patient?.attending ?? doctorFor(row.bed.other?.department ?? "")} doctors={row.patient ? doctors : undefined} />
        <div>{nurseFor(row.bed.room)}</div>
      </>
    ),
  },
  {
    key: "flags",
    label: "印（記録から）",
    // The ward's plan and the 退院 order say the same thing: shown once. On another day the bed's mark comes first and the marks of today's record are left out.
    full: ({ mark, plans, flags, day }) => (
      <Flags flags={[...(mark ? [{ label: mark, tone: "wakatake" as const }] : []), ...plans.map((x) => ({ label: planText(x), tone: "wakatake" as const })), ...(day === 0 ? flags : [])].filter((f, i, xs) => xs.findIndex((y) => y.label === f.label) === i)} />
    ),
  },
  {
    key: "vitals",
    label: "最新バイタル",
    fullClass: "whitespace-nowrap text-[12px]",
    full: ({ patient: p, day }) => {
      const latest = day === 0 ? p.vitals.at(-1) : undefined;
      return (
        <>
          {day !== 0 && <span className="text-ink-faint">—</span>}
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
        </>
      );
    },
  },
  {
    key: "upcoming",
    label: "このあと（今日）",
    fullClass: "text-[12px]",
    full: ({ upcoming, day }) =>
      upcoming.length === 0 || day !== 0 ? (
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
      ),
  },
  {
    key: "results",
    label: "新しい結果",
    fullClass: "text-[12px]",
    full: ({ patient: p, day }) => {
      const newResults = day === 0 ? [...p.cultures.filter((c) => c.reportedOn === 0).map((c) => `${c.specimen}培養`), ...(p.labs.some((l) => l.day === 0) ? ["採血"] : [])] : [];
      return newResults.length ? newResults.map((r) => <div key={r} className="font-bold text-ai">{r}（今日）</div>) : <span className="text-ink-faint">—</span>;
    },
  },
  {
    key: "orders",
    label: "指示",
    fullClass: "whitespace-nowrap text-[12px]",
    full: ({ summary, day }) => {
      const today = day === 0;
      return (
        <>
          {today && summary?.drafts ? <div className="font-bold text-yamabuki">下書き {summary.drafts}件</div> : null}
          {today && summary?.confirmedToday ? <div className="text-wakatake">今日確定 {summary.confirmedToday}件</div> : null}
          {(!today || (!summary?.drafts && !summary?.confirmedToday)) && <span className="text-ink-faint">—</span>}
        </>
      );
    },
  },
];

/** The columns shown: 病室・氏名 always, the others unless turned off in 「表示」. */
export const visibleColumns = (hidden: ListColumn[]): Column[] => COLUMNS.filter((c) => c.key === "room" || c.key === "name" || !hidden.includes(c.key));
