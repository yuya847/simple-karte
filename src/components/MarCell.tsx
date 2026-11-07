"use client";

import { useRecentGlucose } from "./GlucoseContext";
import { displayText } from "@/lib/display-text";
import { dayTime } from "@/lib/flow-entry";
import { TimeInput } from "./TimeInput";
import { ScanLine } from "lucide-react";
import { useState } from "react";
import { insulinEntry } from "@/lib/flow-insulin";
import { NOT_DONE_REASONS, checkScan, labelFor, marKey, needsLabel, type AdminRecord, type MarState, type NotDoneReason, type VoidReason } from "@/lib/mar";
import type { WorkItem } from "@/lib/worksheet";
import { clockText } from "@/lib/drip-course";
import { DripRecordCell } from "./DripControls";
import { can } from "@/lib/roles";
import { useMe } from "./RoleContext";

interface Props {
  item: WorkItem;
  state: MarState;
  record?: AdminRecord;
  nowAbs: number;
  nowTime: string;
  /** Another patient's ID, for the demo button "別の患者のリストバンド". */
  otherPatientId?: string;
  /** For 必要時: how many given today and whether over the limit. */
  prn?: { given: number; over: boolean; max?: number; wait?: string; limit?: string; sameToday?: number };
  onRecord: (r: AdminRecord) => void;
  /** Take a record back with a reason (the record stays in the history). */
  onVoid?: (r: AdminRecord, reason: VoidReason) => void;
  /** 薬剤部が疑義照会中 (the question), for this order. */
  queried?: string;
  /** Earlier records of this dose that were taken back. */
  voided?: { by: string; at: string; reason: string; status: string }[];
}

const STATE_STYLE: Record<MarState, string> = {
  実施: "text-wakatake",
  未実施: "text-shu",
  記録済み: "text-ink-faint",
  未入力: "font-bold text-yamabuki",
  予定: "text-ink-soft",
};

/** The 実施 cell of the worksheet: read the wristband and label, then record 実施 or 未実施. */
export function MarCell({ item, state, record, nowAbs, nowTime, otherPatientId, prn, onRecord, onVoid, voided = [], queried }: Props) {
  const cancellation = record?.cancellation;
  if (cancellation) record = undefined;
  const [enteredGlucose, setGlucose] = useState("");
  const [enteredUnits, setEnteredUnits] = useState("");
  const [givenTime, setGivenTime] = useState(item.at !== null && item.at < 0 ? dayTime(item.at).time : nowTime);
  const recent = useRecentGlucose(item.patientId, Math.floor((item.at ?? nowAbs) / 1440) * 1440 + Number(givenTime.slice(0, 2)) * 60 + Number(givenTime.slice(3)));
  const glucose = recent ? String(recent.value) : enteredGlucose;
  const insulin = insulinEntry(item, glucose, enteredUnits, givenTime, nowAbs);
  const { calculated: calculatedUnits, units, valid: insulinOk } = insulin;
  const [queryAck, setQueryAck] = useState(false);
  const me = useMe();
  const [open, setOpen] = useState(false);
  const [wb, setWb] = useState("");
  const [lb, setLb] = useState("");
  const [reason, setReason] = useState<NotDoneReason | "">("");
  const [timeAck, setTimeAck] = useState(false);
  const at = item.at ?? nowAbs;
  const scanItem = { ...item, at: item.at === null ? null : item.at };
  const result = checkScan(scanItem, wb, item.at === null ? "" : lb, nowAbs);
  const labelNeeded = needsLabel(item.kind) && item.at !== null;
  const offWindow = item.at !== null && result.offBy !== undefined;
  const ok = item.at === null ? result.patient === "ok" : result.ok && (!offWindow || timeAck);
  const save = (status: AdminRecord["status"]) => {
    onRecord({
      ...(status === "実施" && units != null ? {insulin:{units, measuredAt: recent ? recent.measuredAt ?? recent.at : insulin.measuredAt, ...(recent ? { glucoseKey: recent.key } : {}), ...(glucose ? {glucose:Number(glucose)} : {})}} : {}),
      key: marKey(item.orderId, at),
      orderId: item.orderId,
      patientId: item.patientId,
      at,
      status,
      doneAt: item.insulinUnits != null || item.sliding ? givenTime : nowTime,
      by: me.name,
      reason: status === "未実施" ? (reason as NotDoneReason) : undefined,
      checked: { patient: result.patient === "ok", label: labelNeeded ? result.label === "ok" : null },
      offBy: status === "実施" ? result.offBy : undefined,
      note: status === "実施" && offWindow ? "時刻のずれを承知して実施" : undefined,
      // 点滴: this is the 開始; the 終了 is recorded later with what was left (2回実施).
      ...(status === "実施" && item.drip ? { drip: { volumeMl: item.drip.volumeMl, mlPerH: item.drip.mlPerH, minutes: item.drip.minutes, startAt: nowAbs } } : {}),
    });
    setTimeAck(false);
    setOpen(false);
    setWb("");
    setLb("");
    setReason("");
  };

  if (record && item.at !== null && record.drip && record.status === "実施") {
    return (
      <span className="block">
        <DripRecordCell record={record} nowAbs={nowAbs} nowTime={nowTime} onRecord={onRecord} />
        {onVoid && <VoidControl record={record} onVoid={onVoid} />}
      </span>
    );
  }
  if (record && item.at !== null) {
    return (
      <span className={STATE_STYLE[record.status]} title={record.status === "実施" ? `リストバンド ${record.checked.patient ? "一致" : "—"}${record.checked.label === null ? "" : `／ラベル ${record.checked.label ? "一致" : "—"}`}` : undefined}>
        {record.status} {record.doneAt}
        {record.insulin && <span className="block">{record.insulin.glucose != null ? `血糖 ${record.insulin.glucose} mg/dL・` : ""}{record.insulin.units}単位</span>}
        {record.reason && <span className="block text-[10px]">{displayText(record.reason)}</span>}
        {record.offBy !== undefined && <span className="block text-[10px] text-yamabuki">予定より{Math.abs(record.offBy)}分{record.offBy > 0 ? "遅れ" : "早め"}</span>}
        {onVoid && <VoidControl record={record} onVoid={onVoid} />}
      </span>
    );
  }
  return (
    <div className="space-y-1" title={displayText(cancellation ? `取り消し ${cancellation.at} ${cancellation.by} ${cancellation.reason}` : undefined)}>
      {voided.map((v, i) => (
        <span key={i} className="block text-[10px] text-ink-faint line-through decoration-ink-faint/60" title={displayText(`取り消し：${v.at} ${v.by}（${v.reason}）`)}>
          {v.status}（取り消し {v.at}・{displayText(v.reason)}）
        </span>
      ))}
      <div className="flex items-center gap-1">
        {item.at !== null && <span className={`text-[11px] ${STATE_STYLE[state]}`}>{state === "記録済み" ? "実施（前の勤務）" : state}</span>}
        {prn && (
          <span className={`text-[11px] ${prn.over ? "font-bold text-shu" : "text-ink-soft"}`}>
            今日 {prn.given}回{prn.max ? `／${prn.max}回まで` : ""}
            {prn.sameToday !== undefined && `（同じ薬は合わせて${prn.sameToday}回）`}
          </span>
        )}
        {state !== "記録済み" && (
          <button type="button" onClick={() => setOpen((o) => !o)} className="flex items-center gap-0.5 rounded border border-ai px-1.5 text-[11px] font-bold text-ai hover:bg-ai hover:text-white">
            <ScanLine size={11} />
            照合
          </button>
        )}
      </div>
      {open && (
        <div className="w-64 space-y-1 rounded border border-rule bg-paper p-1.5 text-[11px]">
          {(item.sliding || item.insulinUnits != null) && <div className="space-y-1"><label className="block">血糖 mg/dL <input type="number" min="1" value={glucose} readOnly={!!recent} onChange={e => setGlucose(e.target.value)} className="w-20 border border-rule" />{recent && <span> {recent.doneAt}の記録</span>}</label><label className="block">インスリン 単位 <input type="number" min="0" step="any" value={enteredUnits || (calculatedUnits ?? "")} onChange={e => setEnteredUnits(e.target.value)} className="w-20 border border-rule" /></label><label className="block">測定・投与時刻 <TimeInput value={givenTime} onChange={e => setGivenTime(e.target.value)} /></label>{item.sliding?.callAbove !== undefined && glucose && Number(glucose) >= item.sliding.callAbove && <b className="block text-shu">指示の連絡値に達しています</b>}</div>}
          <label className="flex items-center gap-1">
            <span className="w-16">リストバンド</span>
            <input autoFocus value={wb} onChange={(e) => setWb(e.target.value)} placeholder="読み取る" className="w-24 rounded border border-rule bg-sheet px-1" />
            <button type="button" onClick={() => setWb(item.patientId)} className="text-ai underline" title="デモ：この患者のリストバンドを読む">
              読む
            </button>
            {otherPatientId && (
              <button type="button" onClick={() => setWb(otherPatientId)} className="text-ink-faint underline" title="デモ：別の患者のリストバンドを読む">
                別の人
              </button>
            )}
          </label>
          {labelNeeded && (
            <label className="flex items-center gap-1">
              <span className="w-16">{item.kind === "採血" ? "検体ラベル" : "薬のラベル"}</span>
              <input value={lb} onChange={(e) => setLb(e.target.value)} placeholder={labelFor(item.orderId, item.at!)} className="w-24 rounded border border-rule bg-sheet px-1" />
              <button type="button" onClick={() => setLb(labelFor(item.orderId, item.at!))} className="text-ai underline" title="デモ：この回のラベルを読む">
                読む
              </button>
            </label>
          )}
          {(wb || lb) && result.messages.map((m) => (
            <p key={m} className={m.includes("違います") || m.includes("ではありません") ? "font-bold text-shu" : "text-yamabuki"}>
              {m}
            </p>
          ))}
          {offWindow && (wb || lb) && (
            <label className="flex items-center gap-1 text-yamabuki">
              <input type="checkbox" checked={timeAck} onChange={(e) => setTimeAck(e.target.checked)} className="accent-yamabuki" />
              時刻のずれを承知して記録する（必要なら医師に確かめる）
            </label>
          )}
          {prn?.limit ? <p className="font-bold text-shu">{prn.limit}医師に確かめてください。</p> : prn?.over && <p className="font-bold text-shu">今日はもう上限の回数を使っています。医師に確かめてください。</p>}
          {prn?.wait && <p className="font-bold text-shu">{prn.wait}</p>}
          {item.drip && (
            <p className="nums text-ink-soft">
              点滴は開始と終了の2回記録します。いま開始すると終了予定 {displayText(item.drip.minutes === null ? "—（速さの指示なし）" : `${clockText(nowAbs + item.drip.minutes)}（${item.drip.volumeMl}mL ÷ ${item.drip.mlPerH?.toFixed(1)}mL/時）`)}
            </p>
          )}
          {queried && (
            <label className="flex items-start gap-1 font-bold text-shu">
              <input type="checkbox" checked={queryAck} onChange={(e) => setQueryAck(e.target.checked)} className="mt-0.5 accent-shu" />
              <span>
                薬剤部が疑義照会中です（{queried}）。医師に確かめてから記録する
              </span>
            </label>
          )}
          <div className="flex flex-wrap items-center gap-1 pt-0.5">
            <button type="button" disabled={!ok || ((item.sliding || item.insulinUnits != null) && !insulinOk) || prn?.over || !!prn?.wait || (!!queried && !queryAck)} onClick={() => { if ((item.sliding || item.insulinUnits != null) && !insulinOk) return; save("実施"); }} className="rounded bg-wakatake px-2 py-0.5 font-bold text-white disabled:opacity-40">
              {item.drip ? "開始を記録" : "実施を記録"}
            </button>
            {item.at !== null && (
              <>
                <select value={reason} onChange={(e) => setReason(e.target.value as NotDoneReason)} className="rounded border border-rule bg-sheet px-0.5" aria-label="未実施の理由">
                  <option value="">未実施の理由</option>
                  {NOT_DONE_REASONS.map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </select>
                <button type="button" disabled={!reason} onClick={() => save("未実施")} className="rounded border border-shu px-1.5 text-shu disabled:opacity-40">
                  未実施
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** 記録を取り消す: choose why, then the record is taken back (it stays in the history). */
export function VoidControl({ record, onVoid, label = "未実施に戻す" }: { record: AdminRecord; onVoid: (r: AdminRecord, reason: VoidReason) => void; label?: string }) {
  const [voiding, setVoiding] = useState(false);
  const [voidReason, setVoidReason] = useState<VoidReason | "">("");
  const me = useMe();
  if (!can(me.role, "mar")) return null;
  return voiding ? (
    <span onClick={(e) => e.stopPropagation()} className="mt-0.5 flex flex-wrap items-center gap-1 text-[10px] text-ink">
      <input value={voidReason} onChange={(e) => setVoidReason(e.target.value)} aria-label="取り消す理由（任意）" placeholder="理由（任意）" className="rounded border border-rule bg-paper px-0.5" />
      <button
        type="button"
        onClick={() => {
          onVoid(record, voidReason as VoidReason);
          setVoiding(false);
          setVoidReason("");
        }}
        className="rounded border border-shu px-1 text-shu disabled:opacity-40"
      >
        未実施に戻す
      </button>
      <button type="button" onClick={() => setVoiding(false)} className="text-ink-faint">
        やめる
      </button>
    </span>
  ) : (
    <button type="button" title="未実施に戻す" onClick={(e) => { e.stopPropagation(); setVoiding(true); }} className="block text-[10px] text-ink-faint underline hover:text-shu">
      {label}
    </button>
  );
}
