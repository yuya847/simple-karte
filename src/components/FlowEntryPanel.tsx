"use client";

import { type CalendarDate } from "@/lib/dates";
import type { CareOrder, CareRecord } from "@/lib/care-orders";
import type { FlowEntry } from "@/lib/flow-entry";
import { abs } from "@/lib/flowsheet";
import { marState, type AdminRecord, type VoidReason, type VoidedRecord } from "@/lib/mar";
import type { NursingProblem } from "@/lib/nursing-plan";
import type { TakeHold, TakeRow } from "@/lib/order-take";
import { buildWorksheet, timeLabel, type WorkPatient } from "@/lib/worksheet";
import { CareSheet } from "./CareSheet";
import { MarCell } from "./MarCell";
import { TakeTable } from "./TakeTable";

interface Props {
  req: Exclude<FlowEntry, { kind: "vitals" } | { kind: "io" }>;
  person: WorkPatient;
  today: CalendarDate;
  nowTime: string;
  sessionStart: number;
  /** Whether this person may record here (nurses; see flow-entry ENTRY_ACTION). */
  interactive: boolean;
  care: { orders: CareOrder[]; records: CareRecord[]; plans: NursingProblem[]; onRecord: (r: CareRecord) => void; onVoid: (r: CareRecord, reason: string) => void };
  mar: { records: Record<string, AdminRecord>; voided: Record<string, VoidedRecord[]>; queried: Record<string, string>; onRecord: (r: AdminRecord) => void; onVoid: (r: AdminRecord, reason: VoidReason) => void };
  take: { rows: TakeRow[]; taken: Record<string, string>; isTaken: (r: TakeRow) => boolean; holds: Record<string, TakeHold>; nurses: string[]; onTake: (keys: string[], second?: string) => void; onHold: (key: string, reason: TakeHold["reason"], note: string) => void };
}

/**
 * What a cell of the flow sheet opens: the same entries as the worksheet (看護ケア・観察の記録, 与薬・実施の
 * 記録 with the wristband and label check, 指示受け), for this patient and the time of the cell.
 */
export function FlowEntryPanel({ req, person, today, nowTime, sessionStart, interactive, care, mar, take }: Props) {
  const nowAbs = abs(0, nowTime);
  if (req.kind === "care") {
    const orders = care.orders.filter((o) => o.patientId === person.patient.id && o.item === req.item);
    return (
      <div className="space-y-2 text-[12px]">
        <CareSheet people={[person]} orders={orders} records={care.records} plans={[]} lo={req.lo} hi={req.hi} day={Math.floor(req.lo / 1440)} today={today} nowTime={nowTime} sessionStart={sessionStart} interactive={interactive} onRecord={care.onRecord} onVoid={care.onVoid} />
        <p className="text-[11px] text-ink-faint">ワークシートの「看護ケア・観察」と同じ記録です（どちらで入れても同じところに残ります）。</p>
      </div>
    );
  }
  if (req.kind === "mar") {
    const day = Math.floor(req.lo / 1440);
    const items = buildWorksheet([person], req.lo, req.hi, nowAbs).timed.filter((i) => req.orderIds.includes(i.orderId) && i.at !== null);
    return (
      <div className="space-y-2 text-[12px]">
        <p className="font-bold">{req.label}</p>
        {items.length === 0 ? (
          <p className="text-ink-faint">この時間に予定の実施はありません（時刻の決まっていない必要時・1日N回の分は、ワークシートで記録します）。</p>
        ) : (
          <table className="w-full border-collapse">
            <tbody>
              {items.map((i) => (
                <tr key={`${i.orderId}-${i.at}`} className="border-b border-rule-soft align-top">
                  <td className="nums w-20 py-1 pr-2 font-bold">{timeLabel(i.at!, day, today)}</td>
                  <td className="py-1 pr-2">
                    <b>{i.main}</b>
                    {mar.queried[i.orderId] && <span className="ml-1 rounded bg-shu px-1 text-[10px] font-bold text-white">疑義照会中</span>}
                    <div className="text-[11px] text-ink-soft">{i.detail}</div>
                  </td>
                  <td className="w-32 py-1">
                    {interactive ? (
                      <MarCell
                        item={i}
                        state={marState(i, mar.records, sessionStart, nowAbs)}
                        record={mar.records[`${i.orderId}|${i.at}`]}
                        nowAbs={nowAbs}
                        nowTime={nowTime}
                        onRecord={mar.onRecord}
                        onVoid={mar.onVoid}
                        queried={mar.queried[i.orderId]}
                        voided={(mar.voided[`${i.orderId}|${i.at}`] ?? []).map((v) => ({ by: v.by, at: v.at, reason: v.reason, status: `${v.record.status} ${v.record.doneAt}` }))}
                      />
                    ) : (
                      <span className="text-ink-soft">{marState(i, mar.records, sessionStart, nowAbs)}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="text-[11px] text-ink-faint">ワークシートの実施と同じ記録です。リストバンドと薬のラベルを読んでから記録します（照合はコードで行います）。</p>
      </div>
    );
  }
  const rows = take.rows.filter((r) => !req.orderIds.length || r.keys.some((k) => req.orderIds.includes(k.split("|")[0])));
  return (
    <div className="space-y-2 text-[12px]">
      {rows.length === 0 ? <p className="text-ink-faint">受けていない指示はありません。</p> : <TakeTable rows={rows} taken={take.taken} isTaken={take.isTaken} holds={take.holds} interactive={interactive} day={0} today={today} nurses={take.nurses} onTake={take.onTake} onHold={take.onHold} />}
      <p className="text-[11px] text-ink-faint">ワークシートの「指示受け」と同じです。</p>
    </div>
  );
}
