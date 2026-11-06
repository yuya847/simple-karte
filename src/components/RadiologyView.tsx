"use client";
import { risScheduleText } from "@/lib/ris";

// 放射線部（RIS）: 指示受け（受付・撮影室と装置の割り当て・造影と MRI の指示確認）→ 当日の予定（装置ごとのワークリスト）
// と病棟のポータブル回り → 撮影（照射録・線量・造影剤）→ 読影 → 一覧、線量の一覧, and the simulated modality. The orders come from the doctors' charts (画像検査); the claim reads what is
// recorded here (ris.ts withExamRecords). Patients, devices and numbers are fictional.

import { displayText } from "@/lib/display-text";
import { Activity, CalendarClock, ClipboardCheck, FilePen, ListChecks, MonitorCog, Radiation, Route, ScanLine } from "lucide-react";
import { useState } from "react";
import type { ConsentRecord } from "@/lib/consent";
import type { CalendarDate } from "@/lib/dates";
import type { Ack } from "@/lib/results";
import { doseGroups, doseText, drlFor, needsReading, risResultItems, risRows, unsignedRecords, type RisDesk, type RisRow } from "@/lib/ris";
import { portableRound, risTodo } from "@/lib/ris-take";
import type { WorkPatient } from "@/lib/worksheet";
import { SubTabs } from "./DeskParts";
import { ModalitySim } from "./ModalitySim";
import { PortableRound, RadiologyTake, Worklist } from "./RadiologyTake";
import { DenyNote } from "./RoleContext";
import { card, ExamForm, ReadingForm, SignButton, STATUS_TONE, type OnDesk } from "./RisExam";

interface Props {
  people: WorkPatient[];
  desk: RisDesk;
  onDesk: OnDesk;
  /** The ordering doctor's 既読 of each reading report. */
  acks: Record<string, Ack>;
  nowTime: string;
  today: CalendarDate;
  /** The ward's consent forms (同意 of a contrast study in 指示受け・指示確認). */
  consents?: ConsentRecord[];
}

type Tab = "take" | "worklist" | "portable" | "exam" | "modality" | "reading" | "dose" | "list";

/** 放射線部. The technologist starts at 指示受け. */
export function RadiologyView(p: Props) {
  const [examId, setExamId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("take");
  const rows = risRows(p.people, p.desk);
  const toRead = rows.filter((r) => r.work?.images && needsReading(r.order) && !r.work.report && !r.work.notDone);
  const todo = risTodo(rows);
  const badge = {
    take: todo.untaken + todo.unconfirmed,
    worklist: Math.max(0, todo.notDoneToday - todo.untaken),
    portable: portableRound(rows).length,
    exam: rows.filter((r) => r.status === "受付済み" || r.status === "撮影中" || (r.status !== "中止" && r.work?.done && !r.work.record && r.order.modality !== "MRI")).length,
    reading: toRead.length,
    list: unsignedRecords(rows).length,
  };
  return (
    <section aria-label="放射線部" className="scroll-thin min-h-0 flex-1 overflow-auto bg-paper">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-rule bg-sheet px-5 py-3">
        <h1 className="flex items-center gap-1.5 text-lg font-bold">
          <Radiation size={18} className="text-ai" />
          放射線部

        </h1>
        <SubTabs
          label="放射線部の画面"
          value={tab}
          onChange={setTab}
          tabs={[
            { key: "take", label: "指示受け", icon: ClipboardCheck, badge: badge.take },
            { key: "worklist", label: "当日の予定", icon: CalendarClock, badge: badge.worklist },
            { key: "portable", label: "ポータブル回り", icon: Route, badge: badge.portable },
            { key: "exam", label: "撮影・照射録", icon: ScanLine, badge: badge.exam },
            { key: "modality", label: "撮影装置（模擬）", icon: MonitorCog },
            { key: "reading", label: "読影", icon: FilePen, badge: badge.reading },
            { key: "dose", label: "線量", icon: Activity },
            { key: "list", label: "一覧・署名", icon: ListChecks, badge: badge.list },
          ]}
        />
      </header>
      <div className="mx-auto max-w-[1150px] space-y-3 px-5 py-4 text-[13px]">

        {tab === "take" && <RadiologyTake people={p.people} rows={rows} onDesk={p.onDesk} nowTime={p.nowTime} today={p.today} consents={p.consents} />}
        {tab === "worklist" && <Worklist rows={rows} onDesk={p.onDesk} nowTime={p.nowTime} today={p.today} />}
        {tab === "portable" && <PortableRound rows={rows} onDesk={p.onDesk} nowTime={p.nowTime} onExam={(id) => { setExamId(id); setTab("exam"); }} />}
        {tab === "exam" && <Exam key={examId} {...p} rows={rows} initialPick={examId} />}
        {tab === "modality" && (
          <>
            <DenyNote action="ris.exam" />
            <ModalitySim rows={rows} onDesk={p.onDesk} nowTime={p.nowTime} today={p.today} />
          </>
        )}
        {tab === "reading" && <Reading {...p} rows={toRead} done={rows.filter((r) => r.work?.report)} />}
        {tab === "dose" && <Dose rows={rows} />}
        {tab === "list" && <List {...p} rows={rows} />}
      </div>
    </section>
  );
}

function Exam({ rows, onDesk, nowTime, today, initialPick }: Props & { rows: RisRow[]; initialPick: string | null }) {
  const ready = rows.filter((r) => r.status !== "依頼" && r.status !== "中止" || r.work?.cancellations?.length);
  const [pick, setPick] = useState<string | null>(initialPick ?? ready[0]?.orderId ?? null);
  const target = ready.find((r) => r.orderId === pick) ?? ready[0] ?? null;
  return (
    <section className="space-y-3">
      <DenyNote action="ris.exam" />
      <div className="flex flex-wrap items-center gap-2 text-[12px]">
        {ready.length === 0 && <span className="text-ink-faint">撮影・照射録の記録を待っている検査はありません。</span>}
        {ready.map((r) => (
          <button key={r.orderId} type="button" onClick={() => setPick(r.orderId)} className={`rounded border px-2 py-0.5 ${target?.orderId === r.orderId ? "border-ai bg-ai-soft font-bold text-ai" : "border-rule"}`}>
            {r.name} {r.label}（<span className={STATUS_TONE[r.status]}>{r.status}</span>）
          </button>
        ))}
      </div>
      {target && <ExamForm key={target.orderId} r={target} onDesk={onDesk} nowTime={nowTime} today={today} />}
    </section>
  );
}

function Reading({ rows, done, onDesk, nowTime }: Props & { rows: RisRow[]; done: RisRow[] }) {
  const [pick, setPick] = useState<string | null>(null);
  const all = [...rows, ...done];
  const target = all.find((r) => r.orderId === pick) ?? rows[0] ?? null;
  return (
    <section className="space-y-3">
      <DenyNote action="ris.report" />
      <div className="flex flex-wrap items-center gap-2 text-[12px]">
        {all.length === 0 && <span className="text-ink-faint">読影を待っている検査はありません（画像を PACS へ送ると、ここに出ます）。</span>}
        {all.map((r) => (
          <button key={r.orderId} type="button" onClick={() => setPick(r.orderId)} className={`rounded border px-2 py-0.5 ${target?.orderId === r.orderId ? "border-ai bg-ai-soft font-bold text-ai" : "border-rule"} ${r.work?.report ? "text-ink-soft" : ""}`}>
            {r.name} {r.label}
            {r.work?.report ? "（読影済み・訂正）" : r.order.when.priority === "至急" || r.order.reading === "緊急読影" ? "（至急）" : ""}
          </button>
        ))}
      </div>
      {target?.work && <ReadingForm key={target.orderId} r={target} onDesk={onDesk} nowTime={nowTime} />}
    </section>
  );
}

function Dose({ rows }: { rows: RisRow[] }) {
  const done = rows.filter((r) => r.work?.done && r.order.modality !== "MRI");
  const groups = doseGroups(rows);
  return (
    <section className="space-y-3 text-[12px]">
      <table className={`${card} w-full border-collapse`}>
        <thead>
          <tr className="border-b border-rule text-left text-ink-soft">
            <th className="px-2 py-1 font-normal">撮影</th>
            <th className="px-2 py-1 font-normal">患者</th>
            <th className="px-2 py-1 font-normal">検査</th>
            <th className="px-2 py-1 font-normal">線量</th>
            <th className="px-2 py-1 font-normal">比べる DRL</th>
          </tr>
        </thead>
        <tbody>
          {done.length === 0 && (
            <tr>
              <td colSpan={5} className="px-2 py-3 text-center text-ink-faint">
                撮影済みの X線・CT はありません。
              </td>
            </tr>
          )}
          {done.map((r) => {
            const { drl, why } = drlFor(r.order, r.work);
            return (
              <tr key={r.orderId} className="border-b border-rule-soft align-top">
                <td className="nums px-2 py-1">{r.work?.done?.time}</td>
                <td className="px-2 py-1">{r.name}</td>
                <td className="px-2 py-1">{r.label}</td>
                <td className="nums px-2 py-1">{displayText(doseText(r.order, r.work?.dose))}</td>
                <td className="px-2 py-1 text-ink-soft">{drl ? `${drl.protocol}：${drl.ctdiVol !== undefined ? `CTDIvol ${drl.ctdiVol} mGy・DLP ${drl.dlp} mGy・cm` : `${drl.esak} mGy`}` : why}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className={`${card} p-3`}>
        <h3 className="mb-1 font-bold">施設の中央値と DRL（この試作の記録から）</h3>
        {groups.length === 0 && <p className="text-ink-faint">比べられる記録はまだありません。</p>}
        <ul className="space-y-0.5">
          {groups.map((g) => (
            <li key={g.protocol} className="nums">
              {g.protocol}：{g.count}件の中央値 {g.median.ctdiVol !== undefined ? `CTDIvol ${g.median.ctdiVol} mGy` : ""}
              {g.median.dlp !== undefined ? `・DLP ${g.median.dlp} mGy・cm` : ""}
              {g.median.esak !== undefined ? `${g.median.esak} mGy` : ""}（DRL {g.drl.ctdiVol !== undefined ? `${g.drl.ctdiVol} mGy・${g.drl.dlp} mGy・cm` : `${g.drl.esak} mGy`}）
              {g.above.length > 0 ? <b className="ml-1 text-yamabuki">中央値が DRL を超えています（{g.above.join("・")}）：撮影の手順を見直す目安です</b> : <span className="ml-1 text-ink-soft">DRL 以下</span>}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function List({ rows, desk, acks, onDesk, nowTime }: Props & { rows: RisRow[] }) {
  const items = risResultItems(desk);
  return (
    <section className="space-y-2">
      <table className={`${card} w-full border-collapse text-[12px]`}>
        <thead>
          <tr className="border-b border-rule text-left text-ink-soft">
            <th className="px-2 py-1 font-normal">予定</th>
            <th className="px-2 py-1 font-normal">患者</th>
            <th className="px-2 py-1 font-normal">検査</th>
            <th className="px-2 py-1 font-normal">状態</th>
            <th className="px-2 py-1 font-normal">照射録</th>
            <th className="px-2 py-1 font-normal">読影の診断</th>
            <th className="px-2 py-1 font-normal">医師の確認</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={7} className="px-2 py-3 text-center text-ink-faint">
                今日の前後の画像検査はありません。
              </td>
            </tr>
          )}
          {[...rows].sort((a, b) => a.at - b.at).map((r) => {
            const item = items.find((i) => i.key.startsWith(`ris|${r.orderId}|`));
            const ack = item ? acks[item.key] : undefined;
            return (
              <tr key={r.orderId} className="border-b border-rule-soft align-top">
                <td className="nums px-2 py-1">{displayText(risScheduleText(r))}</td>
                <td className="px-2 py-1">
                  {r.room}　{r.name}
                </td>
                <td className="px-2 py-1">{r.label}</td>
                <td className={`px-2 py-1 ${STATUS_TONE[r.status]}`}>
                  {r.status}
                  {r.work?.notDone && <span className="block font-normal">{displayText(r.work.notDone.reason)}</span>}
                </td>
                <td className="px-2 py-1">{r.order.modality === "MRI" ? <span className="text-ink-faint">対象外（MRI）</span> : r.work?.record ? <SignButton r={r} onDesk={onDesk} nowTime={nowTime} /> : <span className="text-ink-faint">{r.work?.done ? "技師の確定まだ" : "—"}</span>}</td>
                <td className="px-2 py-1">{r.work?.report?.impression ?? (needsReading(r.order) ? "—" : "読影不要")}</td>
                <td className={`px-2 py-1 ${r.work?.report && !ack ? "font-bold text-yamabuki" : "text-ink-soft"}`}>{displayText(r.work?.report ? (ack ? `${ack.at.time} ${ack.by}` : "まだ") : "—")}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

/* Help migration source (references and dynamic wording):
<p >
          医師がカルテの「オーダ › 画像検査」で出した X線・CT・MRI が並びます。診療放射線技師は「指示受け」で指示を受けて（受付）撮影室と装置を決め、造影・MRI は「確認する」で同意・腎機能・体内金属などを確かめ、「当日の予定」で呼出・来室・撮影の時刻を押し、「撮影装置（模擬）」か「撮影・照射録」で撮影条件と線量を記録し、照射録を確定します。放射線科医は「読影」でレポートを書き、オーダした医師は「一覧・署名」かカルテの「放射線画像」で照射録に署名し、レポートを確認します。右上の「自分」で職種を選びます（デモではログインの代わり）。
        </p>
*/
