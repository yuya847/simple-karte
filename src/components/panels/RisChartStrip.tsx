"use client";

// In the chart's 放射線画像: what 放射線部 recorded for this patient's imaging orders — the state, the 照射録 the
// ordering doctor signs (診療放射線技師法 第28条), and the reading report the doctor marks as read.

import { RIS_RULES, risResultItems, risRows, type RisDesk } from "@/lib/ris";
import type { Ack } from "@/lib/results";
import type { HistoryEntry, OrderEntry, Patient } from "@/lib/types";
import { useDeny } from "../RoleContext";
import { SignButton, STATUS_TONE, whenText, type OnDesk } from "../RisExam";

interface Props {
  patient: Patient;
  entries: HistoryEntry[];
  desk: RisDesk;
  onDesk: OnDesk;
  acks: Record<string, Ack>;
  nowTime: string;
  onSeen: (keys: string[]) => void;
}

export function RisChartStrip({ patient, entries, desk, onDesk, acks, nowTime, onSeen }: Props) {
  const locked = !!useDeny()("result.ack");
  const rows = risRows([{ patient, room: patient.room, entries: entries.filter((e): e is OrderEntry => e.kind === "order") }], desk);
  if (rows.length === 0) return null;
  const items = risResultItems(desk);
  return (
    <section className="mb-2 rounded-md border border-rule bg-paper p-2 text-[12px]">
      <h3 className="mb-1 font-bold">放射線部の記録（今日の前後のオーダ）</h3>
      <ul className="space-y-1">
        {rows.map((r) => {
          const item = items.find((i) => i.key.startsWith(`ris|${r.orderId}|`));
          const ack = item ? acks[item.key] : undefined;
          return (
            <li key={r.orderId} className="flex flex-wrap items-baseline gap-x-2">
              <span className="nums text-ink-soft">{whenText(r.at)}</span>
              <b>{r.label}</b>
              <span className={STATUS_TONE[r.status]}>{r.status}</span>
              {r.work?.notDone && <span className="text-shu">{r.work.notDone.reason}</span>}
              {r.order.modality !== "MRI" && r.work?.record && <SignButton r={r} onDesk={onDesk} nowTime={nowTime} />}
              {r.work?.report && (
                <span className="basis-full pl-4">
                  <span className="text-ink-soft">読影（{r.work.report.by} {r.work.report.time}）：</span>
                  <b>{r.work.report.impression}</b>
                  <span className="ml-2">
                    {ack ? (
                      <span className="text-wakatake">
                        確認 {ack.at.time} {ack.by}
                      </span>
                    ) : (
                      item && (
                        <button type="button" disabled={locked} onClick={() => onSeen([item.key])} className="rounded border border-ai px-1.5 text-[11px] text-ai disabled:opacity-40">
                          確認した
                        </button>
                      )
                    )}
                  </span>
                </span>
              )}
            </li>
          );
        })}
      </ul>
      <p className="hint mt-1 text-[11px] text-ink-faint">{RIS_RULES.sign} 読影レポートの全文と画像は下の PACS ビューアで見られます。</p>
    </section>
  );
}
