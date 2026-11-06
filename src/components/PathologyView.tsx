"use client";

import { displayText } from "@/lib/display-text";
import { ClipboardList, FilePen, HelpCircle, ListChecks, Microscope } from "lucide-react";
import { useState } from "react";
import { auditLog } from "@/lib/audit";
import type { CalendarDate } from "@/lib/dates";
import { abs } from "@/lib/flowsheet";
import { openHelp } from "@/lib/help/events";
import { PATH_RULES, PATH_STEPS, caseTitle, daysIn, nextNumber, nextStep, pathResultItems, pathStatus, reportProblems, versionOf, type PathCase, type PathStatus } from "@/lib/pathology";
import type { Ack } from "@/lib/results";
import type { WorkPatient } from "@/lib/worksheet";
import { DenyNote, useDeny, useMe } from "./RoleContext";

interface Props {
  people: WorkPatient[];
  cases: PathCase[];
  onCases: (f: (cs: PathCase[]) => PathCase[]) => void;
  /** The attending's 確認 of each report (誰がいつ読んだか). */
  acks: Record<string, Ack>;
  nowTime: string;
  today: CalendarDate;
}

type Tab = "work" | "report" | "list";
const TABS: { key: Tab; label: string; icon: typeof Microscope }[] = [
  { key: "work", label: "受付・工程", icon: ClipboardList },
  { key: "report", label: "報告書", icon: FilePen },
  { key: "list", label: "結果の一覧", icon: ListChecks },
];



const STATUS_STYLE: Record<PathStatus, string> = { 受付待ち: "text-ink-soft", 工程中: "font-bold text-ai", 報告待ち: "font-bold text-yamabuki", 報告済み: "text-wakatake" };
const card = "rounded-lg border border-rule bg-sheet";
const field = "rounded border border-rule bg-paper px-1.5 py-0.5 outline-none focus:border-ai";

/** 病理: the requests, the technologists' steps, the pathologist's report, and who read it. */
export function PathologyView(p: Props) {
  const [tab, setTab] = useState<Tab>("work");
  const waiting = p.cases.filter((c) => pathStatus(c) === "受付待ち" || pathStatus(c) === "工程中").length;
  const toReport = p.cases.filter((c) => pathStatus(c) === "報告待ち").length;
  const badge: Partial<Record<Tab, number>> = { work: waiting, report: toReport };
  return (
    <div data-help-section={`department:path:${tab}`} className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b border-rule bg-sheet px-5 py-2">
        <h1 className="flex items-center gap-1.5 text-base font-bold">
          <Microscope size={17} />
          病理
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
        <button type="button" onClick={() => openHelp(`department:path:${tab}`)} className="ml-auto flex items-center gap-1 rounded border border-rule px-2 py-0.5 text-xs text-ink-soft hover:text-ai">
          <HelpCircle size={13} />
          使い方
        </button>
      </div>

      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto bg-paper p-4 text-[13px]">
        <div className="mx-auto max-w-[1100px] space-y-3">
          {tab === "work" && <Work {...p} />}
          {tab === "report" && <Report {...p} />}
          {tab === "list" && <List {...p} />}
          <div className="rounded-md border border-rule bg-sheet p-3 text-[11px] text-ink-soft">
            <p>{PATH_RULES.numbering}</p>
            <p className="mt-1">{PATH_RULES.report}</p>
            <p className="mt-1">{PATH_RULES.frozen}</p>
            <p className="mt-1">{PATH_RULES.important}</p>

          </div>
        </div>
      </div>
    </div>
  );
}

const who = (people: WorkPatient[], pid: string) => {
  const x = people.find((y) => y.patient.id === pid);
  return x ? `${x.room}　${x.patient.name}` : pid;
};
const at = (nowTime: string) => ({ day: 0, time: nowTime });

/** The request as the laboratory reads it. */
function RequestLines({ c }: { c: PathCase }) {
  return (
    <div className="text-[12px]">
      <p>
        臨床診断・経過：{c.clinical}　<span className="text-ink-soft">知りたいこと：</span>
        {c.question}
      </p>
      <p className="text-ink-soft">
        容器 {c.containers}個{c.fixed ? `　固定開始 ${c.fixed.day === 0 ? "今日" : c.fixed.day === -1 ? "昨日" : `${-c.fixed.day}日前`} ${c.fixed.time}` : ""}
        {c.frozen ? `　術中迅速：${c.frozen.room} ${c.frozen.at.time}ごろ　結果の連絡先 ${c.frozen.phone}` : ""}　依頼 {c.ordered.time} {displayText(c.ordered.by)}
      </p>
    </div>
  );
}

function Work({ people, cases, onCases, nowTime, today }: Props) {
  const me = useMe();
  const deny = useDeny()("path.process");
  const [note, setNote] = useState<Record<string, string>>({});
  const open = cases.filter((c) => pathStatus(c) === "受付待ち" || pathStatus(c) === "工程中").sort((a, b) => (a.kind === "術中迅速" ? -1 : 0) - (b.kind === "術中迅速" ? -1 : 0));
  const nowAbs = abs(0, nowTime);
  const record = (c: PathCase) => {
    const step = nextStep(c);
    if (!step || step === "報告") return;
    if (step === "受付") {
      const number = nextNumber(cases, c.kind, today.y);
      onCases((cs) => cs.map((x) => (x.id === c.id ? { ...x, received: { ...at(nowTime), by: me.name, number } } : x)));
      auditLog({ role: me.role, actor: me.name, action: "確定（病理の受付）", patient: who(people, c.patientId), detail: `${caseTitle(c)}　受付番号 ${number}` });
    } else {
      const n = note[c.id]?.trim();
      onCases((cs) => cs.map((x) => (x.id === c.id ? { ...x, steps: [...x.steps, { step, ...at(nowTime), by: me.name, ...(n ? { note: n } : {}) }] } : x)));
      auditLog({ role: me.role, actor: me.name, action: `確定（病理：${step}）`, patient: who(people, c.patientId), detail: `${c.received?.number ?? ""}　${caseTitle(c)}${n ? `　${n}` : ""}` });
    }
    setNote({ ...note, [c.id]: "" });
  };
  return (
    <section className="space-y-2">
      <DenyNote action="path.process" />
      {open.length === 0 && <p className={`${card} px-4 py-3 text-ink-soft`}>受付・工程の途中の検体はありません。</p>}
      {open.map((c) => {
        const step = nextStep(c);
        const days = daysIn(c, nowAbs);
        return (
          <article key={c.id} className={`${card} p-3 ${c.kind === "術中迅速" ? "border-shu/50" : ""}`}>
            <header className="flex flex-wrap items-baseline gap-x-3">
              <b>{who(people, c.patientId)}</b>
              <span className={c.kind === "術中迅速" ? "font-bold text-shu" : ""}>{caseTitle(c)}</span>
              {c.received && <span className="nums font-mono">{c.received.number}</span>}
              <span className={STATUS_STYLE[pathStatus(c)]}>{pathStatus(c)}</span>
              {days !== null && <span className="nums text-ink-soft">受付から{days}日</span>}
            </header>
            <RequestLines c={c} />
            <ol className="mt-1 flex flex-wrap gap-2 text-[12px]">
              <li className={c.received ? "text-wakatake" : "text-ink-faint"}>受付{displayText(c.received ? ` ${c.received.time} ${c.received.by}` : "")}</li>
              {PATH_STEPS[c.kind].map((s) => {
                const done = c.steps.find((x) => x.step === s);
                return (
                  <li key={s} className={done ? "text-wakatake" : "text-ink-faint"}>
                    → {s}
                    {displayText(done ? ` ${done.time} ${done.by}${done.note ? `（${done.note}）` : ""}` : "")}
                  </li>
                );
              })}
              <li className="text-ink-faint">→ 報告</li>
            </ol>
            {step && step !== "報告" && (
              <p className="mt-1 flex flex-wrap items-center gap-2 text-[12px]">
                {step !== "受付" && <input value={note[c.id] ?? ""} onChange={(e) => setNote({ ...note, [c.id]: e.target.value })} placeholder={step === "標本作製" ? "メモ（例：HE 染色、パパニコロウ染色）" : "メモ（任意）"} aria-label={`${step}のメモ`} className={`${field} w-64`} disabled={!!deny} />}
                <button type="button" disabled={!!deny} onClick={() => record(c)} className="rounded bg-ai px-2.5 py-0.5 font-bold text-white disabled:opacity-40">
                  {step === "受付" ? "受付（番号を付ける）" : `${step}が済んだ`}
                </button>
              </p>
            )}
          </article>
        );
      })}
    </section>
  );
}

function Report({ people, cases, onCases, nowTime }: Props) {
  const me = useMe();
  const deny = useDeny()("path.report");
  const ready = cases.filter((c) => pathStatus(c) === "報告待ち");
  const done = cases.filter((c) => pathStatus(c) === "報告済み");
  const [pick, setPick] = useState<string | null>(null);
  const target = cases.find((c) => c.id === pick) ?? ready[0] ?? null;
  return (
    <section className="space-y-3">
      <DenyNote action="path.report" />
      <div className="flex flex-wrap items-center gap-2 text-[12px]">
        <span className="text-ink-soft">報告待ち：</span>
        {ready.length === 0 && <span className="text-ink-faint">なし</span>}
        {ready.map((c) => (
          <button key={c.id} type="button" onClick={() => setPick(c.id)} className={`rounded border px-2 py-0.5 ${target?.id === c.id ? "border-ai bg-ai-soft font-bold text-ai" : "border-rule"}`}>
            {c.received?.number} {who(people, c.patientId).split("　")[1]}
          </button>
        ))}
        <span className="ml-3 text-ink-soft">訂正・追加報告：</span>
        {done.map((c) => (
          <button key={c.id} type="button" onClick={() => setPick(c.id)} className={`rounded border px-2 py-0.5 ${target?.id === c.id ? "border-ai bg-ai-soft font-bold text-ai" : "border-rule text-ink-soft"}`}>
            {c.received?.number} {who(people, c.patientId).split("　")[1]}
          </button>
        ))}
      </div>
      {target ? <ReportForm key={target.id} c={target} people={people} onCases={onCases} nowTime={nowTime} me={me} denied={!!deny} /> : <p className={`${card} px-4 py-3 text-ink-soft`}>報告を書く検体はありません。</p>}
    </section>
  );
}

function ReportForm({ c, people, onCases, nowTime, me, denied }: { c: PathCase; people: WorkPatient[]; onCases: Props["onCases"]; nowTime: string; me: ReturnType<typeof useMe>; denied: boolean }) {
  const [diagnosis, setDiagnosis] = useState(c.report?.diagnosis ?? "");
  const [findings, setFindings] = useState(c.report?.findings ?? "");
  const [comment, setComment] = useState(c.report?.comment ?? "");
  const [important, setImportant] = useState(c.report?.important ?? false);
  const [reason, setReason] = useState("");
  const [to, setTo] = useState("");
  const problems = reportProblems(c, { diagnosis, reason });
  const needCall = c.kind === "術中迅速" || important;
  const confirm = () => {
    if (problems.length) return;
    const r = { ...at(nowTime), diagnosis: diagnosis.trim(), findings: findings.trim(), ...(comment.trim() ? { comment: comment.trim() } : {}), by: me.name, important, ...(c.report ? { reason: reason.trim() } : {}) };
    onCases((cs) => cs.map((x) => (x.id === c.id ? { ...x, report: r, ...(x.report ? { earlier: [...(x.earlier ?? []), x.report] } : {}), ...(needCall && to.trim() ? { called: { ...at(nowTime), by: me.name, to: to.trim() } } : {}) } : x)));
    auditLog({ role: me.role, actor: me.name, action: c.report ? "確定（病理の報告書を訂正・追加報告）" : "確定（病理の報告書）", patient: who(people, c.patientId), detail: `${c.received?.number ?? ""}　${diagnosis.trim().slice(0, 80)}${needCall && to.trim() ? `　${to.trim()}に直接伝えた` : ""}` });
  };
  return (
    <article className={`${card} space-y-1.5 p-3 text-[12px]`}>
      <header className="flex flex-wrap items-baseline gap-x-3">
        <b>{who(people, c.patientId)}</b>
        <span>{caseTitle(c)}</span>
        <span className="nums font-mono">{c.received?.number}</span>
        {c.report && <span className="text-ink-soft">いまの版：第{versionOf(c)}版（{c.report.time} {displayText(c.report.by)}）</span>}
      </header>
      <RequestLines c={c} />
      <label className="block">
        病理診断
        <textarea value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} rows={2} className={`${field} block w-full`} disabled={denied} />
      </label>
      <label className="block">
        所見
        <textarea value={findings} onChange={(e) => setFindings(e.target.value)} rows={4} className={`${field} block w-full`} disabled={denied} />
      </label>
      <label className="block">
        コメント（任意）
        <input value={comment} onChange={(e) => setComment(e.target.value)} className={`${field} block w-full`} disabled={denied} />
      </label>
      <label className="flex items-center gap-1">
        <input type="checkbox" checked={important} onChange={(e) => setImportant(e.target.checked)} disabled={denied} />
        重要な所見（主治医に直接伝える）
      </label>
      {needCall && (
        <label className="flex items-center gap-1">
          直接伝えた相手
          <input value={to} onChange={(e) => setTo(e.target.value)} placeholder={c.kind === "術中迅速" ? "術者（例：外科 佐々木）" : "主治医"} className={`${field} w-56`} disabled={denied} />
          <span className="text-ink-soft">（伝えたら入れる。あとで入れることもできる）</span>
        </label>
      )}
      {c.report && <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="訂正・追加報告の理由（例：免疫染色の結果を追加）" aria-label="訂正の理由" className={`${field} w-full`} disabled={denied} />}
      {problems.length > 0 && <p className="text-ink-soft">{problems.join(" ")}</p>}
      <button type="button" disabled={denied || problems.length > 0} onClick={confirm} className="rounded bg-ai px-3 py-0.5 font-bold text-white disabled:opacity-40">
        {c.report ? "訂正・追加報告を確定" : "報告書を確定"}
      </button>
      {c.called && (
        <p className="text-wakatake">
          直接伝えた：{c.called.time} {displayText(c.called.by)} → {c.called.to}
        </p>
      )}
    </article>
  );
}

function List({ people, cases, acks, nowTime }: Props) {
  const nowAbs = abs(0, nowTime);
  const items = pathResultItems(cases);
  const sorted = [...cases].sort((a, b) => abs(b.ordered.day, b.ordered.time) - abs(a.ordered.day, a.ordered.time));
  return (
    <table className={`${card} w-full border-collapse text-[12px]`}>
      <thead>
        <tr className="border-b border-rule text-left text-ink-soft">
          <th className="px-2 py-1 font-normal">受付番号</th>
          <th className="px-2 py-1 font-normal">患者</th>
          <th className="px-2 py-1 font-normal">検体</th>
          <th className="px-2 py-1 font-normal">状態</th>
          <th className="px-2 py-1 font-normal">病理診断</th>
          <th className="px-2 py-1 font-normal">主治医の確認</th>
        </tr>
      </thead>
      <tbody>
        {sorted.map((c) => {
          const item = items.find((i) => i.key.startsWith(`path|${c.id}|`));
          const ack = item ? acks[item.key] : undefined;
          const days = daysIn(c, nowAbs);
          return (
            <tr key={c.id} className="border-b border-rule-soft align-top">
              <td className="nums px-2 py-1 font-mono">{c.received?.number ?? "—"}</td>
              <td className="px-2 py-1">{who(people, c.patientId)}</td>
              <td className="px-2 py-1">{caseTitle(c)}</td>
              <td className={`px-2 py-1 ${STATUS_STYLE[pathStatus(c)]}`}>
                {pathStatus(c)}
                {pathStatus(c) === "工程中" && `（次：${nextStep(c)}）`}
                {days !== null && <span className="block font-normal text-ink-soft">受付から{days}日</span>}
              </td>
              <td className="px-2 py-1">
                {c.report ? (
                  <>
                    {c.report.important && <b className="text-shu">【重要な所見】</b>}
                    {c.report.diagnosis}
                    <span className="block text-ink-soft">
                      {c.report.time} {displayText(c.report.by)}
                      {versionOf(c) > 1 && `（第${versionOf(c)}版）`}
                    </span>
                  </>
                ) : (
                  "—"
                )}
              </td>
              <td className={`px-2 py-1 ${c.report && !ack ? "font-bold text-yamabuki" : "text-ink-soft"}`}>{displayText(c.report ? (ack ? `${ack.at.time} ${ack.by}` : "まだ") : "—")}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/* Help migration source (references and dynamic wording):
<p >受付と工程は「臨床検査技師」で、報告書は「医師」（病理医として）で操作します（右上の「自分」。デモではログインの代わり）。依頼はカルテの右端「オーダ › その他 › 病理」から出します。</p>
*/
