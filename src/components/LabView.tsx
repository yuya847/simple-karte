"use client";

import { displayText } from "@/lib/display-text";
import { ExecutionHistory, ExecutionUndo } from "./ExecutionUndo";
import { cancelReception } from "@/lib/lab-desk";

import { ClipboardPen, FlaskConical, HelpCircle, Microscope, PhoneCall, ScanLine } from "lucide-react";
import { openHelp } from "@/lib/help/events";
import { useRef, useState } from "react";
import { auditLog } from "@/lib/audit";
import { abs } from "@/lib/flowsheet";
import { cultureQueue } from "@/lib/lab-culture";
import { specimenId,PLACE_NAME,drawRows,entryPlan,receive,redrawCode,rejectText,scanSpecimen,statusCounts,versionOf,whenText,type DrawRow,type DrawStatus,type LabDesk,type SpecimenScan } from "@/lib/lab-desk";
import type { AdminRecord } from "@/lib/mar";
import { callScript, hitLine, labBoard, partialReportLabel, placeOf, uncalled, type Ack, type PanicCall, type PanicLimit, type ResultItem } from "@/lib/results";
import { ANALYTES } from "@/lib/master";
import type { WorkPatient } from "@/lib/worksheet";
import { DenyNote, useDeny, useMe } from "./RoleContext";
import { LabCulture } from "./LabCulture";
import { LabEntry } from "./LabEntry";
import { PlaceMark } from "./LabMarks";
import { PanicCard } from "./PanicCard";

interface Props {
  /** The ward's patients, and today's visits of 救急外来・外来 with lab orders (ids "er:◯" / "opd:◯"). */
  onOpen?: (id: string) => void;
  people: WorkPatient[];
  /** Results of these patients (shown: from today on, and any panic value not reported yet). */
  items: ResultItem[];
  calls: Record<string, PanicCall>;
  /** The doctor's 確認 (with the response for a panic value), to check that someone acted. */
  acks: Record<string, Ack>;
  limits: PanicLimit[];
  limitsSource: string;
  nowTime: string;
  attending: string;
  onCall: (c: PanicCall) => void;
  /** 与薬・実施の記録: the ward records each draw there (ワークシートの照合). */
  records: Record<string, AdminRecord>;
  sessionStart: number;
  /** What the laboratory did in this session: samples taken in, results, tries to reach a doctor. */
  desk: LabDesk;
  onDesk: (f: (d: LabDesk) => LabDesk) => void;
}

type Tab = "receive" | "enter" | "culture" | "results";
const TABS: { key: Tab; label: string; icon: typeof ScanLine }[] = [
  { key: "receive", label: "検体の受付", icon: ScanLine },
  { key: "enter", label: "結果の入力", icon: ClipboardPen },
  { key: "culture", label: "培養", icon: Microscope },
  { key: "results", label: "結果とパニック値", icon: PhoneCall },
];

/** How to use each tab (the technologist's day), shown at the top (can be folded). */


/** A day in words (今日・明日・昨日・◯日前). */
const dayLabel = (d: number) => (d === 0 ? "今日" : d === 1 ? "明日" : d === -1 ? "昨日" : d < 0 ? `${-d}日前` : `${d}日後`);

/** 検査室: taking in samples, entering results, and phoning panic values. Code finds and checks; people do. */
export function LabView(p: Props) {
  const { people, items, calls, records, sessionStart, desk, nowTime } = p;
  const nowAbs = abs(0, nowTime);
  const waiting = uncalled(items, calls);
  const [tab, setTab] = useState<Tab>(() => (waiting.length ? "results" : "receive"));
  const [flash, setFlash] = useState("");
  const rows = drawRows(people, records, desk, sessionStart, nowAbs);
  // A sample with only cultures is reported in 培養, not counted here.
  const toEnterCount = rows.filter((r) => r.status === "受付済み" && entryPlan(r.codes).analytes.length > 0).length;
  const cultures = cultureQueue(people, desk, calls).filter((i) => i.next.length > 0 || i.waits).length;
  const badge: Partial<Record<Tab, number>> = { enter: toEnterCount, culture: cultures, results: waiting.length };
  const onPanic = (line: string) => {
    setFlash(`パニック値：${line}。オーダーした医師に連絡し、ここに記録してください。`);
    setTab("results");
  };
  return (
    <div data-help-section={`department:lab:${tab}`} className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b border-rule bg-sheet px-5 py-2">
        <h1 className="flex items-center gap-1.5 text-base font-bold">
          <FlaskConical size={17} />
          検査室（病棟・救急外来・外来）
        </h1>
        <div role="tablist" className="flex rounded-md border border-rule p-0.5 text-sm">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={`flex items-center gap-1 rounded px-2.5 py-0.5 ${tab === key ? "bg-ink font-bold text-white" : "text-ink-soft hover:text-ink"}`}
            >
              <Icon size={14} />
              {label}
              {!!badge[key] && <span className={`nums rounded-full px-1.5 text-[11px] font-bold ${key === "results" ? "bg-shu text-white" : "bg-ai-soft text-ai"}`}>{badge[key]}</span>}
            </button>
          ))}
        </div>
        <span className={`text-xs font-bold ${waiting.length ? "text-shu" : "text-wakatake"}`}>
          {waiting.length ? `パニック値の連絡がまだ ${waiting.length}件` : "パニック値はすべて報告済み"}
        </span>
        <button type="button" onClick={() => openHelp(`department:lab:${tab}`)} className="ml-auto flex items-center gap-1 rounded border border-rule px-2 py-0.5 text-xs text-ink-soft hover:text-ai">
          <HelpCircle size={13} />
          使い方
        </button>
      </div>

      {flash && (
        <p role="status" className="border-b border-shu/40 bg-shu-soft px-5 py-1.5 text-[12px] font-bold text-shu">
          {flash}
        </p>
      )}
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto bg-paper p-4 text-[13px]">
        {tab === "receive" && <Receive onOpen={p.onOpen} rows={rows} people={people} nowAbs={nowAbs} onDesk={p.onDesk} history={desk.cancellations} />}
        {tab === "enter" && (
          <LabEntry
            rows={rows}
            people={people}
            limits={p.limits}
            nowAbs={nowAbs}
            calls={calls}
            onDesk={p.onDesk}
            onPanic={onPanic}
          />
        )}
        {tab === "culture" && <LabCulture onReportPanic={() => setTab("results")} people={people} desk={desk} calls={calls} nowAbs={nowAbs} dayLabel={dayLabel} onDesk={p.onDesk} onPanic={onPanic} />}
        {tab === "results" && <Results {...p} items={labBoard(items, calls)} onReported={() => setFlash("")} />}
      </div>
    </div>
  );
}

const STATUS_STYLE: Record<DrawStatus, string> = {
  未採取: "text-ink-soft",
  採取しなかった: "font-bold text-shu",
  採取済み: "font-bold text-ai",
  受付済み: "font-bold text-wakatake",
  再採血: "font-bold text-yamabuki",
  報告済み: "text-ink-faint",
};

const TONE: Record<SpecimenScan["tone"], string> = {
  ok: "border-wakatake/50 bg-wakatake-soft text-wakatake",
  warn: "border-yamabuki/50 bg-yamabuki-soft text-yamabuki",
  stop: "border-shu/50 bg-shu-soft text-shu",
};

function Receive({ onOpen, rows, people, nowAbs, onDesk, history }: { onOpen?: (id: string) => void; rows: DrawRow[]; people: WorkPatient[]; nowAbs: number; onDesk: Props["onDesk"]; history?: LabDesk["cancellations"] }) {
  const me = useMe();
  const deny = useDeny()("lab.receive");
  const [code, setCode] = useState("");
  const box = useRef<HTMLInputElement>(null);
  const [scan, setScan] = useState<SpecimenScan | null>(null);
  const counts = statusCounts(rows);
  const [showReported, setShowReported] = useState(false);
  const visible = rows.filter((r) => showReported || r.status !== "報告済み").sort((a, b) => Number(b.urgent) - Number(a.urgent) || Number(b.place === "救急") - Number(a.place === "救急") || (["未採取", "採取済み", "受付済み", "再採血", "採取しなかった", "報告済み"].indexOf(a.status) - ["未採取", "採取済み", "受付済み", "再採血", "採取しなかった", "報告済み"].indexOf(b.status)) || a.at - b.at);
  const read = (input: string) => {
    const s = scanSpecimen(input, rows, people, nowAbs);
    setCode("");
    box.current?.focus();
    if (!s) return;
    setScan(s);
    const row = s.row;
    if (!s.ok || !row) return;
    onDesk((d) => receive(d, row, me.name, nowAbs));
    auditLog({ role: me.role, actor: me.name, action: "確定（検体の受付）", patient: row.name, detail: `${whenText(row.at)} ${row.tests}${row.status === "採取済み" ? "" : "（病棟の採取の記録なし）"}` });
  };
  return (
    <div className="mx-auto max-w-[1100px] space-y-3">
      <DenyNote action="lab.receive" />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          read(code);
        }}
        className="flex flex-wrap items-center gap-2 rounded-lg border border-rule bg-sheet p-3"
      >
        <ScanLine size={18} className="text-ai" />
        <label className="flex items-center gap-2 font-bold">
          検体ラベル
          <input
            ref={box}
            autoFocus
            disabled={!!deny}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="バーコードリーダーで読む（Enter）"
            aria-label="検体ラベルの番号"
            className="nums w-72 rounded border border-rule bg-paper px-2 py-1 font-normal"
          />
        </label>
        <button type="submit" disabled={!!deny || !code.trim()} className="rounded bg-ai px-3 py-1 font-bold text-white disabled:opacity-40">
          受付
        </button>
        <span className="nums ml-auto text-xs text-ink-soft">
          未採取 {counts.未採取}・採取済み {counts.採取済み}・受付済み {counts.受付済み}・報告済み {counts.報告済み}
          {counts.採取しなかった ? `・採取しなかった ${counts.採取しなかった}` : ""}
          {counts.再採血 ? `・再採血を依頼 ${counts.再採血}` : ""}
        </span>
        {scan && (
          <p role="status" className={`w-full rounded border px-2 py-1 text-[12px] font-bold ${TONE[scan.tone]}`}>
            {scan.message}
          </p>
        )}
      </form>

      <button type="button" className="text-xs text-ink-soft" onClick={() => setShowReported((v) => !v)}>{showReported ? "報告済みを閉じる" : `報告済み ${counts.報告済み}件を表示`}</button>
      <table className="w-full border-collapse text-[12px]">
        <thead>
          <tr className="border-b border-rule text-left text-ink-soft">
            <th className="py-1 pr-2 font-normal">採血の時刻</th>
            <th className="min-w-[9rem] whitespace-nowrap py-1 pr-2 font-normal">患者</th>
            <th className="py-1 pr-2 font-normal">検査</th>
            <th className="py-1 pr-2 font-normal">容器</th>
            <th className="py-1 pr-2 font-normal">ラベル</th>
            <th className="py-1 pr-2 font-normal">状態</th>
            <th className="w-14 py-1 font-normal" />
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={7} className="py-3 text-center text-ink-faint">
                今日と明日の朝の採血はありません。
              </td>
            </tr>
          )}
          {visible.map((r) => (
            <tr key={specimenId(r)} className="border-b border-rule-soft align-top">
              <td className="nums py-1 pr-2">
                {displayText(whenText(r.at))}
                {r.urgent && <span className="ml-1 rounded bg-shu px-1 text-[10px] font-bold text-white">至急</span>}
              </td>
              <td className="min-w-[9rem] whitespace-nowrap py-1 pr-2">
                <PlaceMark place={r.place} room={r.room} /> <button type="button" className="hover:text-ai hover:underline" onClick={() => onOpen?.(r.patientId)}>{r.name}</button>
              </td>
              <td className="py-1 pr-2">
                {r.redrawOf && <span className="mr-1 rounded bg-yamabuki px-1 text-[10px] font-bold text-white">再採血</span>}
                {r.tests}
                {r.redrawOf && <span className="block text-[10px] text-yamabuki">前の検体 {r.redrawOf.code}：{displayText(rejectText(r.redrawOf))}（{r.redrawOf.time} {displayText(r.redrawOf.by)}）</span>}
              </td>
              <td className="py-1 pr-2 text-ink-soft">{r.container}</td>
              <td className="nums py-1 pr-2 font-mono text-[11px] text-ink-soft">{r.code}</td>
              <td className={`py-1 pr-2 ${STATUS_STYLE[r.status]}`}>
                {r.report ? partialReportLabel({ day: 0, time: "", values: r.report.values, progress: { expected: r.report.expected ?? entryPlan(r.codes).analytes.map((a) => a.code), sequence: r.report.additions?.length ?? 1 } }) || r.status : r.status}
                <ExecutionHistory records={history?.filter((c) => (c.record.reception as { code?: string } | undefined)?.code === r.code)} />
                {r.reception && <ExecutionUndo action="lab.receive" patient={r.name} detail={`検体受付 ${r.code}`} onUndo={(by, at, reason) => onDesk((d) => cancelReception(d, specimenId(r), r.patientId, by, at, reason))} />}
                <span className="block text-[10px] font-normal text-ink-soft">{statusNote(r, nowAbs)}</span>
              </td>
              <td className="whitespace-nowrap py-1 text-right">
                {!deny && (r.status === "採取済み" || r.status === "未採取") && (
                  <button type="button" onClick={() => read(r.code)} className="whitespace-nowrap rounded border border-ai px-1.5 text-[11px] text-ai hover:bg-ai hover:text-white" title="デモ：この検体のラベルを読む">
                    読む
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function statusNote(r: DrawRow, nowAbs: number): string {
  if (r.status === "報告済み") return r.report ? `${r.report.reported.time} ${r.report.by}${versionOf(r.report) > 1 ? `（訂正 第${versionOf(r.report)}版）` : ""}` : "開始前に報告済み";
  if (r.status === "再採血" && r.rejection) return `${rejectText(r.rejection)} ${r.rejection.time} ${r.rejection.by} → 新しいラベル ${redrawCode(r.rejection)}`;
  if (r.status === "受付済み") return `${r.reception!.time} ${r.reception!.by}${r.reception!.collected ? "" : "（採取の記録なし）"}`;
  if (r.status === "採取済み") return r.collectedAt === "前の勤務" ? (r.place === "病棟" ? "前の勤務" : `${PLACE_NAME[r.place]}で採取`) : `${r.collectedAt ?? ""} ${r.collectedBy ?? ""}`.trim();
  if (r.status === "採取しなかった") return r.notDoneReason ?? "";
  return r.at <= nowAbs ? "時刻を過ぎた" : "予定";
}

function Results({ people, items, calls, acks, limits, nowTime, attending, onCall, desk, onDesk, onReported, onOpen }: Props & { onReported: () => void }) {
  const name = (pid: string) => people.find((x) => x.patient.id === pid);
  const sorted = [...items].sort((a, b) => a.day - b.day || (a.time || "99").localeCompare(b.time || "99"));
  const panic = sorted.filter((i) => i.panic.length > 0).sort((a, b) => Number(!!calls[a.key]) - Number(!!calls[b.key]));
  const when = (i: ResultItem) => (i.time ? whenText(abs(i.day, i.time)) : i.day === 0 ? "—" : whenText(i.day * 1440).replace(/ 00:00$/, ""));
  return (
    <div className="mx-auto max-w-[1100px]">
      <DenyNote action="panic.call" className="mb-2" />
      {panic.length > 0 && (
        <section className="mb-4 space-y-2">
          <h3 className="text-xs font-bold text-shu">パニック値</h3>
          {panic.map((i) => {
            const w = name(i.patientId);
            return (
              <PanicCard
                key={i.key}
                item={i}
                who={w ? `${placeOf(i.patientId) === "病棟" ? w.room : PLACE_NAME[placeOf(i.patientId)]} ${w.patient.name}さん` : i.patientId}
                name={w?.patient.name ?? i.patientId}
                when={when(i)}
                script={w ? callScript(i, w.patient, w.room) : []}
                call={calls[i.key]}
                ack={acks[i.key]}
                tries={desk.tries[i.key] ?? []}
                nowTime={nowTime}
                // A visit's sample: the doctor of that visit ordered it.
                attending={w && placeOf(i.patientId) !== "病棟" ? w.patient.attending : attending}
                onCall={(c) => {
                  onCall(c);
                  onReported();
                }}
                onDesk={onDesk}
              />
            );
          })}
        </section>
      )}

      <section>
        <h3 className="mb-1 text-xs font-bold text-ink-soft">今日からの結果（{items.length}件）</h3>
        <table className="w-full border-collapse text-[12px]">
          <thead>
            <tr className="border-b border-rule text-left text-ink-soft">
              <th className="py-1 pr-2 font-normal">時刻</th>
              <th className="min-w-[9rem] whitespace-nowrap py-1 pr-2 font-normal">患者</th>
              <th className="py-1 pr-2 font-normal">種類</th>
              <th className="py-1 font-normal">内容</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((i) => {
              const w = name(i.patientId);
              return (
                <tr key={i.key} className="border-b border-rule-soft align-top">
                  <td className="nums py-1 pr-2">{when(i)}</td>
                  <td className="min-w-[9rem] whitespace-nowrap py-1 pr-2">
                    <PlaceMark place={placeOf(i.patientId)} room={w?.room ?? ""} /> <button type="button" className="hover:text-ai hover:underline" onClick={() => onOpen?.(i.patientId)}>{w?.patient.name}</button>
                  </td>
                  <td className="py-1 pr-2">{i.title}</td>
                  <td className={`py-1 ${i.panic.length ? "font-bold text-shu" : ""}`}>
                    {displayText(i.panic.length ? `パニック値：${i.panic.map(hitLine).join("、")}` : i.detail)}
                    {i.corrected && <span className="block font-bold text-yamabuki">{i.corrected}</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="mt-4 rounded-md border border-rule bg-sheet p-3 text-[11px] text-ink-soft">
        <h3 className="mb-1 font-bold">パニック値</h3>
        <p className="nums">
          {limits
            .map((l) => {
              const a = ANALYTES.find((x) => x.code === l.code);
              return `${a?.name ?? l.code} ${[l.low !== undefined ? `${l.low}以下` : "", l.high !== undefined ? `${l.high}以上` : ""].filter(Boolean).join("・")}${a?.unit ? ` ${a.unit}` : ""}`;
            })
            .join("　")}
        </p>
      </section>
    </div>
  );
}

/* Help migration source (references and dynamic wording):
<p >臨床検査技師として操作するには、右上の「自分」で「臨床検査技師」を選びます（デモではログインの代わり）。採取の記録は看護師でワークシートの「照合」から、結果の確認と対応は医師でカルテの右上から行います。</p>
*/
