"use client";

import { Megaphone, Printer, ReceiptJapaneseYen, Stethoscope } from "lucide-react";
import type { ReactNode } from "react";
import type { AdmissionRequest } from "@/lib/admission";
import { ticketLabel } from "@/lib/opd-desk";
import { OPD_STATUSES, waitingMinutes, type OpdPatient, type OpdStatus } from "@/lib/opd";
import { ageSex } from "@/lib/person";

interface Props {
  patients: OpdPatient[];
  nowTime: string;
  requests: Record<string, AdmissionRequest | undefined>;
  onOpen: (id: string) => void;
  onStatus: (id: string, s: OpdStatus) => void;
  onArrive: (id: string) => void;
  onOpenChart: (patientId: string) => void;
  /** The title (default: 外来 総合診療科) and anything beside it (the 診療科 filter). */
  title?: string;
  tools?: ReactNode;
  /** 受付番号 and the place in the doctor's order of the 診察. */
  ticketOf?: (id: string) => number | undefined;
  orderOf?: (id: string) => number | undefined;
  /** 診察の呼出, 会計の呼出 and the 受付票; a reason when the role may not. */
  onCall?: (id: string) => void;
  onPayCall?: (id: string) => void;
  onSlip?: (id: string) => void;
  deny?: { arrive?: string | null; call?: string | null; pay?: string | null };
  /** Show the 診療科・医師 column (more than one department on the list). */
  showDoctor?: boolean;
}

const ORDER: Record<OpdStatus, number> = { 診察中: 0, 診察待ち: 1, 受付済: 2, 予約: 3, 会計待ち: 4, 終了: 5 };
const TONE: Record<OpdStatus, string> = {
  予約: "text-ink-soft",
  受付済: "text-ink",
  診察待ち: "font-bold text-yamabuki",
  診察中: "font-bold text-ai",
  会計待ち: "text-wakatake",
  終了: "text-ink-faint",
};

/** 外来の受付一覧 (fictional): today's patients in the order they need the doctor. */
export function OpdBoard({ patients, nowTime, requests, onOpen, onStatus, onArrive, onOpenChart, title = "外来　総合診療科", tools, ticketOf, orderOf, onCall, onPayCall, onSlip, deny, showDoctor }: Props) {
  const [h, m] = nowTime.split(":").map(Number);
  const nowMin = h * 60 + m;
  const sorted = [...patients].sort((a, b) => ORDER[a.status] - ORDER[b.status] || (a.slot ?? a.arrived ?? "99").localeCompare(b.slot ?? b.arrived ?? "99"));
  const count = (s: OpdStatus) => patients.filter((p) => p.status === s).length;
  const small = "rounded border border-rule px-2 py-0.5 text-[12px] hover:border-ai hover:text-ai disabled:opacity-40";
  return (
    <section aria-label="外来" className="flex min-h-0 flex-1 flex-col bg-paper">
      <header className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-rule bg-sheet px-5 py-3">
        <h1 className="flex items-center gap-2 text-lg font-bold">
          <Stethoscope size={20} className="text-ai" />
          {title}
          <span className="rounded border border-dashed border-ink-faint px-1.5 py-0.5 text-[10px] font-normal text-ink-soft">架空</span>
        </h1>
        {tools}
        <p className="nums text-sm text-ink-soft">
          診察中 <b className="text-ink">{count("診察中")}</b>・待ち <b className="text-ink">{count("診察待ち") + count("受付済")}</b>・予約 <b className="text-ink">{count("予約")}</b>・終わり <b className="text-ink">{count("会計待ち") + count("終了")}</b>
        </p>
      </header>
      <div className="scroll-thin min-h-0 flex-1 overflow-auto">
        <table className="nums w-full min-w-[960px] border-collapse text-[13px]">
          <thead className="sticky top-0 z-10 bg-paper text-left text-[11px] text-ink-faint shadow-[0_1px_0_var(--color-rule)]">
            <tr>
              {ticketOf && <th className="px-3 py-2 font-normal">受付番号</th>}
              <th className="px-3 py-2 font-normal">予約</th>
              <th className="px-3 py-2 font-normal">受付・待ち</th>
              <th className="px-3 py-2 font-normal">氏名</th>
              {showDoctor && <th className="px-3 py-2 font-normal">診療科・医師</th>}
              <th className="px-3 py-2 font-normal">区分</th>
              <th className="px-3 py-2 font-normal">受診の理由</th>
              <th className="px-3 py-2 font-normal">状態</th>
              <th className="px-3 py-2 font-normal">入院申込</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((p) => {
              const wait = waitingMinutes(p, nowMin);
              const req = requests[p.id];
              const done = p.status === "終了";
              const order = orderOf?.(p.id);
              return (
                <tr key={p.id} className={`border-b border-rule-soft align-top ${done ? "text-ink-faint" : "bg-sheet"}`}>
                  {ticketOf && (
                    <td className="px-3 py-2">
                      <b className="text-base">{ticketLabel(ticketOf(p.id))}</b>
                      {p.arrived && onSlip && (
                        <button type="button" onClick={() => onSlip(p.id)} title="受付票を印刷" aria-label={`${p.name} の受付票を印刷`} className="ml-1 align-middle text-ink-faint hover:text-ai">
                          <Printer size={13} />
                        </button>
                      )}
                    </td>
                  )}
                  <td className="px-3 py-2 font-bold">{p.slot ?? <span className="font-normal text-ink-soft">予約外</span>}</td>
                  <td className="px-3 py-2">
                    {p.arrived ? (
                      <>
                        {p.arrived}
                        {wait !== null && <div className={`text-[11px] ${wait >= 30 ? "font-bold text-shu" : "text-ink-soft"}`}>待ち {wait}分</div>}
                        {order !== undefined && <div className="text-[11px] text-ink-soft">順番 {order}番目</div>}
                      </>
                    ) : (
                      <button type="button" onClick={() => onArrive(p.id)} disabled={!!deny?.arrive} title={deny?.arrive ?? undefined} className={small}>
                        受付する
                      </button>
                    )}
                  </td>
                  <td className="px-2 py-1">
                    {/* The whole cell (カナ・氏名・年齢性別・アレルギー) is the button that opens the patient's tab, not only the name. */}
                    <button type="button" onClick={() => onOpen(p.id)} title="この患者のタブを開く（記録・入院申込）" aria-label={`${p.name} のタブを開く`} className="block min-h-8 w-full rounded px-1 py-1 text-left hover:bg-ai-soft hover:underline">
                      <span className="block text-[10px] text-ink-faint">{p.kana}</span>
                      <span className={`font-bold ${done ? "" : "text-ai"}`}>{p.name}</span>
                      <span className="ml-2 text-[12px]">{ageSex(p)}</span>
                      {p.allergies.length > 0 && <span className="block text-[11px] font-bold text-shu">アレルギー：{p.allergies.join("、")}</span>}
                    </button>
                  </td>
                  {showDoctor && (
                    <td className="px-3 py-2 text-[12px]">
                      {p.department}
                      <div className="text-ink-soft">{p.doctor}</div>
                    </td>
                  )}
                  <td className="px-3 py-2">{p.kind}</td>
                  <td className="max-w-80 px-3 py-2">
                    {p.reason}
                    {p.referral && <div className="text-[11px] text-ink-soft">紹介状あり</div>}
                  </td>
                  <td className="px-3 py-2">
                    <select value={p.status} onChange={(e) => onStatus(p.id, e.target.value as OpdStatus)} aria-label={`${p.name} の状態`} className={`rounded border border-rule bg-sheet px-1 py-0.5 text-[12px] ${TONE[p.status]}`}>
                      {OPD_STATUSES.map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                    {onCall && (p.status === "受付済" || p.status === "診察待ち") && (
                      <div className="mt-1">
                        {p.called ? (
                          <span className="text-[11px] font-bold text-yamabuki">呼出中 {p.called.at}</span>
                        ) : (
                          <button type="button" onClick={() => onCall(p.id)} disabled={!!deny?.call} title={deny?.call ?? "待合の表示に番号を出して呼ぶ"} className={`${small} inline-flex items-center gap-1`}>
                            <Megaphone size={12} />
                            呼出
                          </button>
                        )}
                      </div>
                    )}
                    {onPayCall && p.status === "会計待ち" && (
                      <div className="mt-1">
                        {p.payCalled ? (
                          <span className="text-[11px] font-bold text-wakatake">会計を呼出 {p.payCalled.at}</span>
                        ) : (
                          <button type="button" onClick={() => onPayCall(p.id)} disabled={!!deny?.pay} title={deny?.pay ?? "待合の表示の「お会計」に番号を出す"} className={`${small} inline-flex items-center gap-1`}>
                            <ReceiptJapaneseYen size={12} />
                            会計の呼出
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-[12px]">
                    {req?.admittedAs ? (
                      <button type="button" onClick={() => onOpenChart(req.admittedAs!)} className="font-bold text-ai hover:underline">
                        入院済・カルテを開く
                      </button>
                    ) : req?.status === "申込" ? (
                      <span className="font-bold text-yamabuki">
                        申込済<span className="block font-normal">{req.ward}・ベッド待ち</span>
                      </span>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="px-5 py-3 text-[11px] text-ink-faint">患者はすべて架空です。<span className="hint">氏名の欄を押すと、その患者のタブが開き、今日の記録と入院申込を書けます。</span>外来の算定と処方せんは、この試作では扱いません。</p>
      </div>
    </section>
  );
}
