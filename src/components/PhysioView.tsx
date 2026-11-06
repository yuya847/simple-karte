"use client";
import { physioWithCalculated } from "@/lib/physio-calculations";
import { displayText } from "@/lib/display-text";
import { ExecutionHistory, ExecutionUndo } from "./ExecutionUndo";
import { cancelExecution } from "@/lib/mar";

import { ClipboardList, FilePen, HeartPulse, HelpCircle, ListChecks } from "lucide-react";
import { useState } from "react";
import { auditLog } from "@/lib/audit";
import { openHelp } from "@/lib/help/events";
import { derivedValues, fieldsOf, physioResultItems, physioRows, reportProblems, valuesLine, versionOf, type PhysioDesk, type PhysioRow, type PhysioStatus, type PhysioWork } from "@/lib/physio-desk";
import type { Ack } from "@/lib/results";
import type { WorkPatient } from "@/lib/worksheet";
import { DenyNote, useDeny, useMe } from "./RoleContext";

interface Props {
  people: WorkPatient[];
  desk: PhysioDesk;
  onDesk: (f: (d: PhysioDesk) => PhysioDesk) => void;
  /** The ordering doctor's 確認 of each report. */
  acks: Record<string, Ack>;
  nowTime: string;
}

type Tab = "work" | "report" | "list";
const TABS: { key: Tab; label: string; icon: typeof HeartPulse }[] = [
  { key: "work", label: "受付・実施", icon: ClipboardList },
  { key: "report", label: "結果とレポート", icon: FilePen },
  { key: "list", label: "結果の一覧", icon: ListChecks },
];



const STATUS_STYLE: Record<PhysioStatus, string> = { 予約: "text-ink-soft", 受付済み: "font-bold text-ai", 実施済み: "font-bold text-yamabuki", 報告済み: "text-wakatake", 実施できなかった: "font-bold text-shu" };
const card = "rounded-lg border border-rule bg-sheet";
const field = "rounded border border-rule bg-paper px-1.5 py-0.5 outline-none focus:border-ai";
const whenText = (a: number) => {
  const d = Math.floor(a / 1440);
  const m = a - d * 1440;
  const t = `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  return `${d === 0 ? "今日" : d === 1 ? "明日" : d === -1 ? "昨日" : d < 0 ? `${-d}日前` : `${d}日後`} ${t}`;
};

/** 生理検査室: taking in, doing and reporting the physiological tests doctors ordered. */
export function PhysioView(p: Props) {
  const [tab, setTab] = useState<Tab>("work");
  const rows = physioRows(p.people, p.desk);
  const badge: Partial<Record<Tab, number>> = { work: rows.filter((r) => r.status === "予約" || r.status === "受付済み").length, report: rows.filter((r) => r.status === "実施済み").length };
  return (
    <div data-help-section={`department:physio:${tab}`} className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b border-rule bg-sheet px-5 py-2">
        <h1 className="flex items-center gap-1.5 text-base font-bold">
          <HeartPulse size={17} />
          生理検査室
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
              {!!badge[key] && <span className="nums rounded-full bg-ai-soft px-1.5 text-[11px] font-bold text-ai">{badge[key]}</span>}
            </button>
          ))}
        </div>
        <button type="button" onClick={() => openHelp(`department:physio:${tab}`)} className="ml-auto flex items-center gap-1 rounded border border-rule px-2 py-0.5 text-xs text-ink-soft hover:text-ai">
          <HelpCircle size={13} />
          使い方
        </button>
      </div>

      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto bg-paper p-4 text-[13px]">
        <div className="mx-auto max-w-[1100px] space-y-3">
          <DenyNote action="physio.exam" />
          {tab === "work" && <Work {...p} rows={rows} />}
          {tab === "report" && <Report {...p} rows={rows} />}
          {tab === "list" && <List {...p} rows={rows} />}
        </div>
      </div>
    </div>
  );
}

const put = (onDesk: Props["onDesk"], r: PhysioRow, f: (w: PhysioWork) => PhysioWork) =>
  onDesk((d) => ({ ...d, [r.orderId]: f(d[r.orderId] ?? { orderId: r.orderId, patientId: r.patientId, test: r.test }) }));

function Head({ r }: { r: PhysioRow }) {
  return (
    <header className="flex flex-wrap items-baseline gap-x-3">
      <span className="nums">
        {displayText(whenText(r.at))}
        {r.priority === "至急" && <span className="ml-1 rounded bg-shu px-1 text-[10px] font-bold text-white">至急</span>}
      </span>
      <b>
        {r.room}　{r.name}
      </b>
      <span className="font-bold">{r.testName}</span>
      <span className="text-ink-soft">
        {r.place}
        {r.transport ? `（${r.transport}）` : ""}　目的：{r.purpose}　{displayText(r.orderedBy)}
      </span>
      <span className={STATUS_STYLE[r.status]}>{r.status}</span>
    </header>
  );
}

function Work({ rows, onDesk, nowTime }: Props & { rows: PhysioRow[] }) {
  const me = useMe();
  const deny = useDeny()("physio.exam");
  const [reason, setReason] = useState<Record<string, string>>({});
  const open = rows.filter((r) => r.status !== "実施できなかった");
  const at = { day: 0, time: nowTime };
  const log = (r: PhysioRow, what: string, detail = "") => auditLog({ role: me.role, actor: me.name, action: `確定（生理検査の${what}）`, patient: r.name, detail: `${r.testName}${detail}` });
  return (
    <section className="space-y-2">
      {open.length === 0 && <p className={`${card} px-4 py-3 text-ink-soft`}>受付・実施を待っている検査はありません。</p>}
      {open.map((r) => (
        <article key={r.orderId} className={`${card} p-3 text-[12px]`}>
          <Head r={r} />
      <ExecutionHistory records={r.work?.cancellations} />
          {(r.work?.arrived || r.work?.done) && <ExecutionUndo action="physio.exam" patient={r.name} detail={r.testName} onUndo={(by, at, reason) => put(onDesk, r, (w) => cancelExecution(w, ["arrived", "done", "report"], by, at, reason))} />}
          {r.comment && <p className="text-ink-soft">コメント：{r.comment}</p>}
          <p className="mt-1 flex flex-wrap items-center gap-2">
            {r.status === "予約" ? (
              <button
                type="button"
                disabled={!!deny}
                onClick={() => {
                  put(onDesk, r, (w) => ({ ...w, arrived: { ...at, by: me.name } }));
                  log(r, "受付");
                }}
                className="rounded bg-ai px-2.5 py-0.5 font-bold text-white disabled:opacity-40"
              >
                {r.place === "ベッドサイド" ? "受付（病室へ向かう）" : "受付（来室した）"}
              </button>
            ) : (
              <>
                <span className="text-ink-soft">
                  受付 {r.work?.arrived?.time} {displayText(r.work?.arrived?.by)}
                </span>
                <button
                  type="button"
                  disabled={!!deny || !!r.work?.done}
                  onClick={() => {
                    put(onDesk, r, (w) => ({ ...w, done: { ...at, by: me.name } }));
                    log(r, "実施");
                  }}
                  className="rounded bg-wakatake px-2.5 py-0.5 font-bold text-white disabled:opacity-40"
                >
                  実施した
                </button>
              </>
            )}
            <input value={reason[r.orderId] ?? ""} onChange={(e) => setReason({ ...reason, [r.orderId]: e.target.value })} placeholder="できなかった理由（例：体調不良で延期）" aria-label="実施できなかった理由" className={`${field} ml-auto w-64`} disabled={!!deny} />
            <button
              type="button"
              disabled={!!deny || !(reason[r.orderId] ?? "").trim()}
              onClick={() => {
                put(onDesk, r, (w) => ({ ...w, notDone: { ...at, by: me.name, reason: reason[r.orderId].trim() } }));
                log(r, "中止（実施できなかった）", `　${reason[r.orderId].trim()}`);
              }}
              className="rounded border border-shu px-2 py-0.5 text-shu disabled:opacity-40"
            >
              実施できなかった
            </button>
          </p>
        </article>
      ))}
    </section>
  );
}

function Report({ rows, onDesk, nowTime }: Props & { rows: PhysioRow[] }) {
  const ready = rows.filter((r) => r.status === "実施済み" || r.status === "報告済み");
  const [pick, setPick] = useState<string | null>(null);
  const target = ready.find((r) => r.orderId === pick) ?? ready.find((r) => r.status === "実施済み") ?? null;
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-[12px]">
        {ready.length === 0 && <span className="text-ink-faint">実施した検査はありません。</span>}
        {ready.map((r) => (
          <button key={r.orderId} type="button" onClick={() => setPick(r.orderId)} className={`rounded border px-2 py-0.5 ${target?.orderId === r.orderId ? "border-ai bg-ai-soft font-bold text-ai" : "border-rule"} ${r.status === "報告済み" ? "text-ink-soft" : ""}`}>
            {r.name} {r.testName.replace(/（.*?）/, "")}
            {r.status === "報告済み" ? "（報告済み）" : ""}
          </button>
        ))}
      </div>
      {target && <ReportForm key={target.orderId} r={target} onDesk={onDesk} nowTime={nowTime} />}
    </section>
  );
}

function ReportForm({ r, onDesk, nowTime }: { r: PhysioRow; onDesk: Props["onDesk"]; nowTime: string }) {
  const me = useMe();
  const deny = useDeny()("physio.exam");
  const prev = r.work?.report;
  const [vals, setVals] = useState<Record<string, string>>(() => Object.fromEntries(Object.entries(prev?.values ?? {}).map(([k, v]) => [k, String(v)])));
  const [manual, setManual] = useState<Set<string>>(() => new Set(prev?.manualValues ?? Object.keys(prev?.values ?? {})));
  const effective = physioWithCalculated(r.test, vals, manual);
  const [findings, setFindings] = useState(prev?.findings ?? "");
  const [conclusion, setConclusion] = useState(prev?.conclusion ?? "");
  const [reason, setReason] = useState("");
  const values = Object.fromEntries(Object.entries(effective).filter(([, v]) => v.trim() !== "").map(([k, v]) => [k, Number(v)]));
  const problems = reportProblems(r.test, { values, findings, conclusion, reason }, !!prev);
  const derived = derivedValues(r.test, values);
  const confirm = () => {
    if (problems.length) return;
    const rep = { day: 0, time: nowTime, values, manualValues: [...manual], findings: findings.trim(), conclusion: conclusion.trim(), by: me.name, ...(prev ? { reason: reason.trim() } : {}) };
    put(onDesk, r, (w) => ({ ...w, report: rep, ...(w.report ? { earlier: [...(w.earlier ?? []), w.report] } : {}) }));
    auditLog({ role: me.role, actor: me.name, action: prev ? "確定（生理検査のレポートを訂正）" : "確定（生理検査のレポート）", patient: r.name, detail: `${r.testName}　${conclusion.trim().slice(0, 60)}` });
  };
  return (
    <article className={`${card} space-y-2 p-3 text-[12px]`}>
      <Head r={r} />
      {prev && (
        <p className="text-ink-soft">
          いまの版：第{versionOf(r.work!)}版（{prev.time} {displayText(prev.by)}）
        </p>
      )}
      {fieldsOf(r.test).length > 0 && (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-x-3 gap-y-1">
          {fieldsOf(r.test).map((f) => (
            <label key={f.key} className="flex items-center justify-between gap-1">
              <span>{f.label}</span>
              <span className="flex items-center gap-0.5">
                <input inputMode="decimal" value={effective[f.key] ?? ""} onChange={(e) => {
                  const value = e.target.value;
                  setManual((current) => { const next = new Set(current); if (value.trim()) next.add(f.key); else next.delete(f.key); return next; });
                  setVals({ ...vals, [f.key]: value });
                }} aria-label={f.label} className={`${field} nums w-20 text-right`} disabled={!!deny} />
                <span className="w-10 text-ink-soft">{f.unit}</span>
              </span>
            </label>
          ))}
        </div>
      )}
      {derived.length > 0 && (
        <p className="nums text-ai">
          {derived.map((d) => (
            <span key={d.label} className="mr-3 block">
              {d.label} {d.value}
              {d.unit}（{d.formula}）
            </span>
          ))}
        </p>
      )}
      <label className="block">
        所見
        <textarea value={findings} onChange={(e) => setFindings(e.target.value)} rows={3} className={`${field} block w-full`} disabled={!!deny} />
      </label>
      <label className="block">
        まとめ（一言で。医師の「未確認の結果」に出る）
        <input value={conclusion} onChange={(e) => setConclusion(e.target.value)} className={`${field} block w-full`} disabled={!!deny} />
      </label>
      {prev && <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="訂正の理由" aria-label="訂正の理由" className={`${field} w-full`} disabled={!!deny} />}
      {problems.length > 0 && (
        <ul className="list-disc pl-5 text-ink-soft">
          {problems.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      )}
      <button type="button" disabled={!!deny || problems.length > 0} onClick={confirm} className="rounded bg-ai px-3 py-0.5 font-bold text-white disabled:opacity-40">
        {prev ? "訂正を確定" : "レポートを確定"}
      </button>
    </article>
  );
}

function List({ rows, desk, acks }: Props & { rows: PhysioRow[] }) {
  const items = physioResultItems(desk);
  return (
    <table className={`${card} w-full border-collapse text-[12px]`}>
      <thead>
        <tr className="border-b border-rule text-left text-ink-soft">
          <th className="px-2 py-1 font-normal">予定</th>
          <th className="px-2 py-1 font-normal">患者</th>
          <th className="px-2 py-1 font-normal">検査</th>
          <th className="px-2 py-1 font-normal">状態</th>
          <th className="px-2 py-1 font-normal">まとめ・主な数値</th>
          <th className="px-2 py-1 font-normal">医師の確認</th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 && (
          <tr>
            <td colSpan={6} className="px-2 py-3 text-center text-ink-faint">
              今日の前後の生理検査はありません。
            </td>
          </tr>
        )}
        {[...rows].sort((a, b) => a.at - b.at).map((r) => {
          const item = items.find((i) => i.key.startsWith(`phy|${r.orderId}|`));
          const ack = item ? acks[item.key] : undefined;
          const rep = r.work?.report;
          return (
            <tr key={r.orderId} className="border-b border-rule-soft align-top">
              <td className="nums px-2 py-1">{displayText(whenText(r.at))}</td>
              <td className="px-2 py-1">
                {r.room}　{r.name}
              </td>
              <td className="px-2 py-1">{r.testName}</td>
              <td className={`px-2 py-1 ${STATUS_STYLE[r.status]}`}>
                {r.status}
                {r.work?.notDone && <span className="block font-normal">{displayText(r.work.notDone.reason)}</span>}
              </td>
              <td className="px-2 py-1">
                {rep ? (
                  <>
                    {rep.conclusion}
                    <span className="nums block text-ink-soft">{valuesLine(r.test, rep.values)}</span>
                  </>
                ) : (
                  "—"
                )}
              </td>
              <td className={`px-2 py-1 ${rep && !ack ? "font-bold text-yamabuki" : "text-ink-soft"}`}>{displayText(rep ? (ack ? `${ack.at.time} ${ack.by}` : rep.day < 0 ? "前の記録" : "まだ") : "—")}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/* Help migration source (references and dynamic wording):
<p >臨床検査技師として操作するには、右上の「自分」で「臨床検査技師」を選びます（デモではログインの代わり）。オーダは医師がカルテの「生理・内視鏡」から出し、レポートは医師がカルテの右端「参照 › 病理・生理」で読みます。</p>
*/
