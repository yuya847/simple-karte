"use client";

import { BedDouble, CalendarDays, ChartColumn, Download, Printer, Stethoscope } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { auditLog } from "@/lib/audit";
import {
  BASIC_ALOS_RULES,
  basicAlos,
  CENSUS_FORMULA,
  CENSUS_SOURCES,
  censusStays,
  dayCsv,
  dayReport,
  deptCounts,
  lastMonths,
  monthCsv,
  opdCounts,
  periodReport,
  UNIT_NOTE,
  type CensusPatient,
  type DayRow,
  type PeriodRow,
} from "@/lib/census";
import { addDays, formatShort, isoDate, type CalendarDate } from "@/lib/dates";
import { liaisonHistory, monthPeriods, todayVisits } from "@/lib/liaison";
import type { BedAssignment, Floor } from "@/lib/ward";
import { Fictional, saveFile, Sources, SubTabs, usePrintSheet } from "./DeskParts";
import { useMe } from "./RoleContext";

type Tab = "day" | "month" | "alos" | "dept";

/** Days of the fictional record (more than the three whole months before this month). */
const HISTORY_DAYS = 130;

/**
 * 統計・日報: counted by code from who was in which ward on which day (today's records, and a fictional record
 * before today) and from the outpatient day counts. 日報・月報 print on A4 and save as CSV.
 */
export function StatsView({
  today,
  nowTime,
  floors,
  beds,
  moves,
  patient,
  opd,
  er,
}: {
  today: CalendarDate;
  nowTime: string;
  floors: Floor[];
  /** The beds as first placed today (before moves), with today's discharges still in them. */
  beds: BedAssignment[];
  moves: Record<string, { room: string; bed: string }>;
  patient: (id: string) => CensusPatient | undefined;
  opd: { department: string; kind: "初診" | "再診"; arrived?: string }[];
  er: { arrival: string; status: string }[];
}) {
  const me = useMe();
  const [tab, setTab] = useState<Tab>("day");
  const [day, setDay] = useState(0);
  const [month, setMonth] = useState(0);
  const [print, sheet] = usePrintSheet();
  const iso = isoDate(today);
  const stays = useMemo(() => censusStays({ today, days: HISTORY_DAYS, floors, beds, moves, patient }), [iso, floors, beds, moves, patient]); // eslint-disable-line react-hooks/exhaustive-deps
  const history = useMemo(() => {
    const [y, m, d] = iso.split("-").map(Number);
    return liaisonHistory({ y, m, d }, HISTORY_DAYS);
  }, [iso]);
  const visits = [...history.visits, ...todayVisits(opd, er)];
  const periods = monthPeriods(today, 3);
  const fmt = (d: number) => formatShort(addDays(today, d));
  const dayTitle = day === 0 ? `${fmt(0)} ${nowTime} 時点` : fmt(day);
  const save = (name: string, csv: string, what: string) => {
    saveFile(name, csv);
    auditLog({ role: me.role, actor: me.name, action: `${what}を CSV で保存した`, detail: name });
  };

  return (
    <section aria-label="統計・日報" className="scroll-thin min-h-0 flex-1 overflow-auto bg-paper">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-rule bg-sheet px-5 py-3">
        <h1 className="flex items-center gap-1.5 text-lg font-bold">
          <ChartColumn size={18} className="text-ai" />
          統計・日報
          <Fictional />
        </h1>
        <SubTabs
          label="統計の画面"
          value={tab}
          onChange={setTab}
          tabs={[
            { key: "day", label: "日報", icon: CalendarDays },
            { key: "month", label: "月報", icon: ChartColumn },
            { key: "alos", label: "平均在院日数（入院基本料）", icon: BedDouble },
            { key: "dept", label: "診療科別", icon: Stethoscope },
          ]}
        />
      </header>
      <div className="space-y-4 px-5 py-4 text-[13px]">
        {tab === "day" && (
          <DayTab
            title={dayTitle}
            report={dayReport(stays, floors, day)}
            opd={opdCounts(visits, { label: "", from: day, to: day })}
            picker={
              <select value={day} onChange={(e) => setDay(Number(e.target.value))} aria-label="日" className="rounded border border-rule bg-sheet px-1.5 py-0.5">
                {Array.from({ length: 31 }, (_, i) => -i).map((d) => (
                  <option key={d} value={d}>
                    {fmt(d)}
                    {d === 0 ? "（今日・いま）" : ""}
                  </option>
                ))}
              </select>
            }
            onPrint={(node) => print(node)}
            onCsv={(csv) => save(`日報_${isoDate(addDays(today, day))}.csv`, csv, "日報")}
          />
        )}
        {tab === "month" && (
          <MonthTab
            title={periods[month].label}
            report={periodReport(stays, floors, periods[month])}
            opd={opdCounts(visits, periods[month])}
            picker={
              <select value={month} onChange={(e) => setMonth(Number(e.target.value))} aria-label="月" className="rounded border border-rule bg-sheet px-1.5 py-0.5">
                {periods.map((p, i) => (
                  <option key={p.label} value={i}>
                    {p.label}
                  </option>
                ))}
              </select>
            }
            onPrint={(node) => print(node)}
            onCsv={(csv) => save(`月報_${periods[month].label.replace(/（.*）/, "")}.csv`, csv, "月報")}
          />
        )}
        {tab === "alos" && <AlosTab stays={stays} floors={floors} today={today} />}
        {tab === "dept" && <DeptTab stays={stays} visits={visits} period={periods[month]} label={periods[month].label} />}
        <p className="text-[11px] text-ink-faint">
          病棟・患者・件数はすべて架空です。今日の数は、カルテのある患者・今日の入院・実施した退院・病棟の移動・ほかのチームの患者（ベッドの表示）から数えます。今日より前の入退院は、今日のベッドの様子から日をさかのぼって作った架空の記録で、外来の数は地域医療連携の画面と同じ架空の外来の日計です。計算はすべてコードで行い、AI は使いません。
        </p>
      </div>
      {sheet}
    </section>
  );
}

const th = "px-2 py-1.5 font-normal";
const num = "nums px-2 py-1 text-right";

function Actions({ onPrint, onCsv }: { onPrint: () => void; onCsv: () => void }) {
  return (
    <>
      <button type="button" onClick={onPrint} className="flex items-center gap-1 rounded-md border border-rule bg-sheet px-2.5 py-1 hover:border-ai hover:text-ai">
        <Printer size={14} />
        印刷
      </button>
      <button type="button" onClick={onCsv} className="flex items-center gap-1 rounded-md border border-rule bg-sheet px-2.5 py-1 hover:border-ai hover:text-ai">
        <Download size={14} />
        CSV で保存
      </button>
      <span className="text-[11px] text-ink-faint">CSV は Excel でそのまま開けます（UTF-8・BOM 付き）。保存したことは監査ログに残ります。</span>
    </>
  );
}

function DayTable({ report }: { report: { rows: DayRow[]; total: DayRow } }) {
  return (
    <table className="w-full border-collapse bg-sheet text-[12px] print:text-[9pt]">
      <thead>
        <tr className="border-b border-rule text-left text-ink-soft">
          <th className={th}>病棟</th>
          {["病床数", "前日在院", "入院", "転入", "退院", "死亡", "転出", "在院", "空床", "在院÷病床"].map((h) => (
            <th key={h} className={`${th} text-right`}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {[...report.rows, report.total].map((r) => (
          <tr key={r.floor} className={`border-b border-rule-soft ${r === report.total ? "font-bold" : ""}`}>
            <td className="px-2 py-1">{r.floor}</td>
            {[r.beds, r.prev, r.admit, r.transferIn, r.discharge, r.death, r.transferOut, r.census, r.empty].map((v, i) => (
              <td key={i} className={num}>
                {v}
              </td>
            ))}
            <td className={num}>{r.rate}%</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function OpdTable({ rows, perDay }: { rows: { dept: string; first: number; revisit: number; ambulance: number; days?: number }[]; perDay?: boolean }) {
  const sum = (k: "first" | "revisit" | "ambulance") => rows.reduce((n, r) => n + r[k], 0);
  return (
    <table className="w-full border-collapse bg-sheet text-[12px] print:text-[9pt]">
      <thead>
        <tr className="border-b border-rule text-left text-ink-soft">
          <th className={th}>外来の診療科</th>
          <th className={`${th} text-right`}>初診</th>
          <th className={`${th} text-right`}>再診</th>
          <th className={`${th} text-right`}>救急車</th>
          <th className={`${th} text-right`}>計</th>
          {perDay && <th className={`${th} text-right`}>診療日数</th>}
          {perDay && <th className={`${th} text-right`}>1日平均</th>}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.dept} className="border-b border-rule-soft">
            <td className="px-2 py-1">{r.dept}</td>
            <td className={num}>{r.first}</td>
            <td className={num}>{r.revisit}</td>
            <td className={num}>{r.ambulance}</td>
            <td className={num}>{r.first + r.revisit + r.ambulance}</td>
            {perDay && <td className={num}>{r.days}</td>}
            {perDay && <td className={num}>{r.days ? Math.round(((r.first + r.revisit + r.ambulance) / r.days) * 10) / 10 : "—"}</td>}
          </tr>
        ))}
        <tr className="font-bold">
          <td className="px-2 py-1">計</td>
          <td className={num}>{sum("first")}</td>
          <td className={num}>{sum("revisit")}</td>
          <td className={num}>{sum("ambulance")}</td>
          <td className={num}>{sum("first") + sum("revisit") + sum("ambulance")}</td>
          {perDay && <td />}
          {perDay && <td />}
        </tr>
      </tbody>
    </table>
  );
}

function DayTab({ title, report, opd, picker, onPrint, onCsv }: { title: string; report: { rows: DayRow[]; total: DayRow }; opd: { dept: string; first: number; revisit: number; ambulance: number }[]; picker: ReactNode; onPrint: (node: ReactNode) => void; onCsv: (csv: string) => void }) {
  const body = (
    <>
      <h2 className="mb-1 font-bold">入院（病棟ごと）</h2>
      <DayTable report={report} />
      <h2 className="mb-1 mt-3 font-bold">外来</h2>
      {opd.length ? <OpdTable rows={opd} /> : <p className="text-ink-faint">この日の外来の記録はありません（土曜・日曜は救急外来だけ）。</p>}
    </>
  );
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {picker}
        <Actions onPrint={() => onPrint(<Sheet title={`日報　${title}`}>{body}</Sheet>)} onCsv={() => onCsv(dayCsv(title, report, opd))} />
      </div>
      {body}
      <p className="text-[11px] text-ink-soft">在院は24時に病棟にいる患者（今日は、いま病棟にいる患者）。全病棟の行の転入・転出は、病棟の間の移動です。</p>
    </>
  );
}

function MonthTable({ report }: { report: { rows: PeriodRow[]; total: PeriodRow; alos: number | null } }) {
  return (
    <table className="w-full border-collapse bg-sheet text-[12px] print:text-[9pt]">
      <thead>
        <tr className="border-b border-rule text-left text-ink-soft">
          <th className={th}>病棟</th>
          {["病床数", "日数", "在院患者延数", "1日平均在院", "新入院", "退院（死亡を含む）", "うち死亡", "転入", "転出", "病床利用率"].map((h) => (
            <th key={h} className={`${th} text-right`}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {[...report.rows, report.total].map((r) => (
          <tr key={r.floor} className={`border-b border-rule-soft ${r === report.total ? "font-bold" : ""}`}>
            <td className="px-2 py-1">{r.floor}</td>
            {[r.beds, r.days, r.patientDays, r.avgCensus ?? "—", r.admit, r.discharge, r.death, r.transferIn, r.transferOut].map((v, i) => (
              <td key={i} className={num}>
                {v}
              </td>
            ))}
            <td className={num}>{r.utilization === null ? "—" : `${r.utilization}%`}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function MonthTab({ title, report, opd, picker, onPrint, onCsv }: { title: string; report: { rows: PeriodRow[]; total: PeriodRow; alos: number | null }; opd: { dept: string; first: number; revisit: number; ambulance: number; days: number }[]; picker: ReactNode; onPrint: (node: ReactNode) => void; onCsv: (csv: string) => void }) {
  const body = (
    <>
      <h2 className="mb-1 font-bold">入院（病棟ごと）</h2>
      <MonthTable report={report} />
      <p className="mt-2 text-sm">
        全病棟の平均在院日数（病院報告の式）：<b className="nums text-lg">{report.alos ?? "—"}</b>日
        <span className="ml-2 text-[11px] text-ink-soft">
          ＝ {report.total.patientDays} ÷｛1/2 ×（{report.total.admit} ＋ {report.total.discharge}）｝
        </span>
      </p>
      <h2 className="mb-1 mt-3 font-bold">外来（診療科ごと）</h2>
      <OpdTable rows={opd} perDay />
    </>
  );
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {picker}
        <Actions onPrint={() => onPrint(<Sheet title={`月報　${title}`}>{body}</Sheet>)} onCsv={() => onCsv(monthCsv(title, report, opd))} />
      </div>
      {body}
      <ul className="space-y-0.5 text-[11px] text-ink-soft">
        <li>{CENSUS_FORMULA.utilization}。病床数はこの試作の病棟のベッドの数（定床）です。</li>
        <li>{CENSUS_FORMULA.hospitalAlos}。</li>
        <li>「病床稼働率」は病院報告にない言葉で、病院ごとに式が違うため、この画面は病院報告の病床利用率を出します。</li>
        <li>入院基本料の施設基準の平均在院日数は式が違います（「平均在院日数（入院基本料）」のタブ）。</li>
        <li>今日の外来は、この試作の外来の画面にいる患者（総合診療科と、ほかの科の予約）と救急外来だけを数えます。</li>
      </ul>
      <Sources items={CENSUS_SOURCES.hospitalReport} />
    </>
  );
}

function AlosTab({ stays, floors, today }: { stays: ReturnType<typeof censusStays>; floors: Floor[]; today: CalendarDate }) {
  const p = lastMonths(today, 3);
  const unit = floors.map((f) => f.name);
  const all = basicAlos(stays, unit, p);
  return (
    <>
      <p className="text-[12px] text-ink-soft">直近3か月（{p.label}）の記録から、別添6 別紙4 の式で計算します。{UNIT_NOTE}</p>
      <div className="rounded-lg border border-rule bg-sheet p-3">
        <h2 className="font-bold">一般病棟（急性期一般入院料４）の平均在院日数</h2>
        <p className="text-[12px] text-ink-soft">{CENSUS_FORMULA.basicAlos}</p>
        <p className="nums mt-1 text-sm">
          {all.patientDays} ÷｛（{all.newIn} ＋ {all.newOut}）÷ 2｝＝ {all.newIn + all.newOut ? (all.patientDays / ((all.newIn + all.newOut) / 2)).toFixed(2) : "—"} → 切り上げて <b className="text-2xl">{all.value ?? "—"}</b>日
        </p>
        <p className="mt-1 text-[12px] text-ink-soft">
          ① 在院患者延日数 {all.patientDays}・② 新入棟 {all.newIn}・新退棟 {all.newOut}。別表第二で計算から除いた入院 {all.excluded}件（短期滞在手術等基本料３、入院した日から5日まで）。
        </p>
      </div>
      <table className="w-full border-collapse bg-sheet text-[12px]">
        <thead>
          <tr className="border-b border-rule text-left text-ink-soft">
            <th className={th}>病棟ごと（参考）</th>
            <th className={`${th} text-right`}>① 延日数</th>
            <th className={`${th} text-right`}>新入棟</th>
            <th className={`${th} text-right`}>新退棟</th>
            <th className={`${th} text-right`}>除いた入院</th>
            <th className={`${th} text-right`}>平均在院日数</th>
          </tr>
        </thead>
        <tbody>
          {floors.map((f) => {
            const r = basicAlos(stays, [f.name], p);
            return (
              <tr key={f.name} className="border-b border-rule-soft">
                <td className="px-2 py-1">{f.name}</td>
                <td className={num}>{r.patientDays}</td>
                <td className={num}>{r.newIn}</td>
                <td className={num}>{r.newOut}</td>
                <td className={num}>{r.excluded}</td>
                <td className={num}>{r.value ?? "—"}日</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="text-[11px] text-ink-soft">病棟ごとの値は、それぞれの病棟を1つとして同じ決まりで数えた参考です（病棟の間の移動は、その病棟の入棟・退棟になります）。基準に合っているかを判断するのは人です。</p>
      <ul className="list-disc space-y-0.5 pl-5 text-[12px]">
        {BASIC_ALOS_RULES.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
      <Sources items={CENSUS_SOURCES.basic} />
    </>
  );
}

function DeptTab({ stays, visits, period, label }: { stays: ReturnType<typeof censusStays>; visits: Parameters<typeof opdCounts>[0]; period: { label: string; from: number; to: number }; label: string }) {
  const rows = deptCounts(stays, 0, period);
  return (
    <>
      <h2 className="font-bold">入院の診療科別（今日の在院と、{label}の入院・退院・延数）</h2>
      <table className="w-full border-collapse bg-sheet text-[12px]">
        <thead>
          <tr className="border-b border-rule text-left text-ink-soft">
            <th className={th}>診療科</th>
            <th className={`${th} text-right`}>いま在院</th>
            <th className={`${th} text-right`}>新入院</th>
            <th className={`${th} text-right`}>退院（死亡を含む）</th>
            <th className={`${th} text-right`}>在院患者延数</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.dept} className="border-b border-rule-soft">
              <td className="px-2 py-1">{r.dept}</td>
              <td className={num}>{r.census}</td>
              <td className={num}>{r.admit}</td>
              <td className={num}>{r.discharge}</td>
              <td className={num}>{r.patientDays}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h2 className="font-bold">外来の診療科別（{label}）</h2>
      <OpdTable rows={opdCounts(visits, period)} perDay />
      <p className="text-[11px] text-ink-soft">月は「月報」のタブで選んだ月です。入院の診療科は、病棟を移っても入院したときの診療科で数えます（転科は数えていません）。</p>
    </>
  );
}

function Sheet({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h1 className="mb-2 text-base font-bold">
        {title}　架空総合病院（架空）
      </h1>
      {children}
      <p className="mt-2 text-[8pt]">架空の記録からコードで数えたものです。</p>
    </div>
  );
}
