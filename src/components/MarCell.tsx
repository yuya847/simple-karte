"use client";

import { ScanLine } from "lucide-react";
import { useState } from "react";
import { NOT_DONE_REASONS, checkScan, labelFor, marKey, needsLabel, type AdminRecord, type MarState, type NotDoneReason } from "@/lib/mar";
import type { WorkItem } from "@/lib/worksheet";

interface Props {
  item: WorkItem;
  state: MarState;
  record?: AdminRecord;
  nowAbs: number;
  nowTime: string;
  /** Another patient's ID, for the demo button "別の患者のリストバンド". */
  otherPatientId?: string;
  /** For 必要時: how many given today and whether over the limit. */
  prn?: { given: number; over: boolean; max?: number };
  onRecord: (r: AdminRecord) => void;
}

const STATE_STYLE: Record<MarState, string> = {
  実施: "text-wakatake",
  未実施: "text-shu",
  記録済み: "text-ink-faint",
  未入力: "font-bold text-yamabuki",
  予定: "text-ink-soft",
};

/** The 実施 cell of the worksheet: read the wristband and label, then record 実施 or 未実施. */
export function MarCell({ item, state, record, nowAbs, nowTime, otherPatientId, prn, onRecord }: Props) {
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
      key: marKey(item.orderId, at),
      orderId: item.orderId,
      patientId: item.patientId,
      at,
      status,
      doneAt: nowTime,
      by: "看護師（あなた）",
      reason: status === "未実施" ? (reason as NotDoneReason) : undefined,
      checked: { patient: result.patient === "ok", label: labelNeeded ? result.label === "ok" : null },
      offBy: status === "実施" ? result.offBy : undefined,
      note: status === "実施" && offWindow ? "時刻のずれを承知して実施" : undefined,
    });
    setTimeAck(false);
    setOpen(false);
    setWb("");
    setLb("");
    setReason("");
  };

  if (record && item.at !== null) {
    return (
      <span className={STATE_STYLE[record.status]} title={record.status === "実施" ? `リストバンド ${record.checked.patient ? "一致" : "—"}${record.checked.label === null ? "" : `／ラベル ${record.checked.label ? "一致" : "—"}`}` : undefined}>
        {record.status} {record.doneAt}
        {record.reason && <span className="block text-[10px]">{record.reason}</span>}
        {record.offBy !== undefined && <span className="block text-[10px] text-yamabuki">予定より{Math.abs(record.offBy)}分{record.offBy > 0 ? "遅れ" : "早め"}</span>}
      </span>
    );
  }
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1">
        {item.at !== null && <span className={`text-[11px] ${STATE_STYLE[state]}`}>{state === "記録済み" ? "実施（前の勤務）" : state}</span>}
        {prn && (
          <span className={`text-[11px] ${prn.over ? "font-bold text-shu" : "text-ink-soft"}`}>
            今日 {prn.given}回{prn.max ? `／${prn.max}回まで` : ""}
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
          {prn?.over && <p className="font-bold text-shu">今日はもう上限の回数を使っています。医師に確かめてください。</p>}
          <div className="flex flex-wrap items-center gap-1 pt-0.5">
            <button type="button" disabled={!ok || prn?.over} onClick={() => save("実施")} className="rounded bg-wakatake px-2 py-0.5 font-bold text-white disabled:opacity-40">
              実施を記録
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
