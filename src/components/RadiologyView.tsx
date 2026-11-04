"use client";

// 放射線部（RIS）: 受付・撮影室と装置の割り当て → 撮影（照射録・線量・造影剤）→ 読影 → 一覧、線量の一覧、
// and the simulated modality. The orders come from the doctors' charts (画像検査); the claim reads what is
// recorded here (ris.ts withExamRecords). Patients, devices and numbers are fictional.

import { Activity, ClipboardList, FilePen, ListChecks, MonitorCog, Radiation, ScanLine } from "lucide-react";
import { useState } from "react";
import { auditLog } from "@/lib/audit";
import type { CalendarDate } from "@/lib/dates";
import type { Ack } from "@/lib/results";
import { DRL_NOTE, doseGroups, doseText, drlFor, findRoom, needsReading, putWork, RIS_RULES, RIS_SOURCES, risResultItems, risRows, roomsFor, unsignedRecords, type RisDesk, type RisRow, type RoomKey } from "@/lib/ris";
import type { WorkPatient } from "@/lib/worksheet";
import { Fictional, Sources, SubTabs } from "./DeskParts";
import { ModalitySim } from "./ModalitySim";
import { DenyNote, useDeny, useMe } from "./RoleContext";
import { card, ExamForm, field, ReadingForm, RowHead, SignButton, STATUS_TONE, whenText, type OnDesk } from "./RisExam";

interface Props {
  people: WorkPatient[];
  desk: RisDesk;
  onDesk: OnDesk;
  /** The ordering doctor's 既読 of each reading report. */
  acks: Record<string, Ack>;
  nowTime: string;
  today: CalendarDate;
}

type Tab = "work" | "exam" | "modality" | "reading" | "dose" | "list";

/** 放射線部. */
export function RadiologyView(p: Props) {
  const [tab, setTab] = useState<Tab>("work");
  const rows = risRows(p.people, p.desk);
  const toRead = rows.filter((r) => r.work?.images && needsReading(r.order) && !r.work.report && !r.work.notDone);
  const badge = {
    work: rows.filter((r) => r.status === "依頼").length,
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
          <Fictional />
        </h1>
        <SubTabs
          label="放射線部の画面"
          value={tab}
          onChange={setTab}
          tabs={[
            { key: "work", label: "受付・割り当て", icon: ClipboardList, badge: badge.work },
            { key: "exam", label: "撮影・照射録", icon: ScanLine, badge: badge.exam },
            { key: "modality", label: "撮影装置（模擬）", icon: MonitorCog },
            { key: "reading", label: "読影", icon: FilePen, badge: badge.reading },
            { key: "dose", label: "線量", icon: Activity },
            { key: "list", label: "一覧・署名", icon: ListChecks, badge: badge.list },
          ]}
        />
      </header>
      <div className="mx-auto max-w-[1150px] space-y-3 px-5 py-4 text-[13px]">
        <p className="hint text-[12px] text-ink-soft">
          医師がカルテの「オーダ › 画像検査」で出した X線・CT・MRI が並びます。診療放射線技師は「受付・割り当て」で受付して撮影室と装置を決め、「撮影装置（模擬）」か「撮影・照射録」で撮影を記録し、照射録を確定します。放射線科医は「読影」でレポートを書き、オーダした医師は「一覧・署名」かカルテの「放射線画像」で照射録に署名し、レポートを確認します。右上の「自分」で職種を選びます（デモではログインの代わり）。
        </p>
        {tab === "work" && <Work {...p} rows={rows} />}
        {tab === "exam" && <Exam {...p} rows={rows} />}
        {tab === "modality" && (
          <>
            <DenyNote action="ris.exam" />
            <ModalitySim rows={rows} onDesk={p.onDesk} nowTime={p.nowTime} today={p.today} />
          </>
        )}
        {tab === "reading" && <Reading {...p} rows={toRead} done={rows.filter((r) => r.work?.report)} />}
        {tab === "dose" && <Dose rows={rows} />}
        {tab === "list" && <List {...p} rows={rows} />}
        <p className="text-[11px] text-ink-faint">{RIS_RULES.rooms} 患者・オーダ・撮影条件・線量・画像はすべて架空です。読影の所見はコードが書くことはありません。</p>
      </div>
    </section>
  );
}

function Work({ rows, onDesk, nowTime }: Props & { rows: RisRow[] }) {
  const me = useMe();
  const deny = useDeny()("ris.exam");
  const [reason, setReason] = useState<Record<string, string>>({});
  const [slot, setSlot] = useState<Record<string, string>>({});
  const open = rows.filter((r) => r.status === "依頼" || r.status === "受付済み");
  const at = { day: 0, time: nowTime };
  const log = (r: RisRow, what: string, detail = "") => auditLog({ role: me.role, actor: me.name, action: `確定（放射線部：${what}）`, patient: r.name, detail: `${r.label}${detail}` });
  return (
    <section className="space-y-2">
      <DenyNote action="ris.exam" />
      {open.length === 0 && <p className={`${card} px-4 py-3 text-ink-soft`}>受付・割り当てを待っている検査はありません。</p>}
      {open.map((r) => {
        const rooms = roomsFor(r.order.modality);
        const roomKey: RoomKey = r.work?.room ?? rooms[0].key;
        const time = slot[r.orderId] ?? r.work?.slot?.time ?? (r.order.when.time || nowTime);
        return (
          <article key={r.orderId} className={`${card} space-y-1 p-3 text-[12px]`}>
            <RowHead r={r} />
            {r.order.comment && <p className="text-ink-soft">コメント：{r.order.comment}</p>}
            <div className="flex flex-wrap items-center gap-2">
              {r.status === "依頼" ? (
                <button
                  type="button"
                  disabled={!!deny}
                  onClick={() => {
                    onDesk((d) => putWork(d, r, (w) => ({ ...w, arrived: { ...at, by: me.name } })));
                    log(r, "受付");
                  }}
                  className="rounded bg-ai px-2.5 py-0.5 font-bold text-white disabled:opacity-40"
                >
                  {r.order.modality === "ポータブルX線" ? "受付（病室へ向かう）" : "受付（来室した）"}
                </button>
              ) : (
                <span className="text-ink-soft">
                  受付 {r.work?.arrived?.time} {r.work?.arrived?.by}
                </span>
              )}
              <span className="text-ink-soft">撮影室・装置</span>
              <select
                value={roomKey}
                disabled={!!deny || r.status === "依頼"}
                aria-label="撮影室・装置"
                onChange={(e) => {
                  onDesk((d) => putWork(d, r, (w) => ({ ...w, room: e.target.value as RoomKey, slot: { day: r.order.when.day, time }, assignedBy: me.name })));
                  log(r, "装置を割り当て", `　${findRoom(e.target.value as RoomKey)?.room}`);
                }}
                className={field}
              >
                {rooms.map((x) => (
                  <option key={x.key} value={x.key}>
                    {x.room}（{x.ae}）
                  </option>
                ))}
              </select>
              <input type="time" value={time} onChange={(e) => setSlot({ ...slot, [r.orderId]: e.target.value })} aria-label="撮影の予定時刻" disabled={!!deny || r.status === "依頼"} className={`${field} nums`} />
              <button
                type="button"
                disabled={!!deny || r.status === "依頼"}
                onClick={() => {
                  onDesk((d) => putWork(d, r, (w) => ({ ...w, room: roomKey, slot: { day: r.order.when.day, time }, assignedBy: me.name })));
                  log(r, "装置を割り当て", `　${findRoom(roomKey)?.room} ${time}`);
                }}
                className="rounded border border-ai px-2 py-0.5 text-ai disabled:opacity-40"
              >
                {r.work?.room ? "予定を変える" : "割り当てる"}
              </button>
              {r.work?.room && (
                <span className="text-wakatake">
                  {findRoom(r.work.room)?.room} {r.work.slot?.time}（{r.work.assignedBy}）
                </span>
              )}
              <input value={reason[r.orderId] ?? ""} onChange={(e) => setReason({ ...reason, [r.orderId]: e.target.value })} placeholder="撮影できない理由（例：検査を延期）" aria-label="撮影できない理由" disabled={!!deny} className={`${field} ml-auto w-56`} />
              <button
                type="button"
                disabled={!!deny || !(reason[r.orderId] ?? "").trim()}
                onClick={() => {
                  onDesk((d) => putWork(d, r, (w) => ({ ...w, notDone: { ...at, by: me.name, via: "手入力", reason: reason[r.orderId].trim() } })));
                  log(r, "中止（撮影できなかった）", `　${reason[r.orderId].trim()}`);
                }}
                className="rounded border border-shu px-2 py-0.5 text-shu disabled:opacity-40"
              >
                撮影できなかった
              </button>
            </div>
          </article>
        );
      })}
      <p className="hint text-[11px] text-ink-faint">受付すると、撮影室・装置と予定の時刻を決められます。装置を割り当てると、その装置のワークリスト（撮影装置（模擬））に出ます。</p>
    </section>
  );
}

function Exam({ rows, onDesk, nowTime, today }: Props & { rows: RisRow[] }) {
  const ready = rows.filter((r) => r.status !== "依頼" && r.status !== "中止" && r.status !== "読影済み" && !(r.work?.record && r.work.images) && !(r.order.modality === "MRI" && r.work?.images));
  const [pick, setPick] = useState<string | null>(null);
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
      <Sources items={[RIS_SOURCES.law, RIS_SOURCES.rule, RIS_SOURCES.dose]} />
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
      <p className="text-[12px] text-ink-soft">{RIS_RULES.reading} 読影は放射線科医が行います（デモでは右上の「自分」で医師を選び、「放射線科 石田」を選びます）。</p>
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
                <td className="nums px-2 py-1">{doseText(r.order, r.work?.dose)}</td>
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
        <p className="mt-1 text-[11px] text-ink-faint">{DRL_NOTE} この試作の記録は数件なので、中央値は目安になりません。</p>
      </div>
      <Sources items={[RIS_SOURCES.drl, RIS_SOURCES.dose]} />
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
                <td className="nums px-2 py-1">{whenText(r.at)}</td>
                <td className="px-2 py-1">
                  {r.room}　{r.name}
                </td>
                <td className="px-2 py-1">{r.label}</td>
                <td className={`px-2 py-1 ${STATUS_TONE[r.status]}`}>
                  {r.status}
                  {r.work?.notDone && <span className="block font-normal">{r.work.notDone.reason}</span>}
                </td>
                <td className="px-2 py-1">{r.order.modality === "MRI" ? <span className="text-ink-faint">対象外（MRI）</span> : r.work?.record ? <SignButton r={r} onDesk={onDesk} nowTime={nowTime} /> : <span className="text-ink-faint">{r.work?.done ? "技師の確定まだ" : "—"}</span>}</td>
                <td className="px-2 py-1">{r.work?.report?.impression ?? (needsReading(r.order) ? "—" : "読影不要")}</td>
                <td className={`px-2 py-1 ${r.work?.report && !ack ? "font-bold text-yamabuki" : "text-ink-soft"}`}>{r.work?.report ? (ack ? `${ack.at.time} ${ack.by}` : "まだ") : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="text-[11px] text-ink-faint">{RIS_RULES.sign}</p>
      <Sources items={[RIS_SOURCES.law, RIS_SOURCES.rule]} />
    </section>
  );
}
