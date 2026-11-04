// Marks on the patient list, worked out by code from the record. Facts only: no "要注意" judgement.

import { procInterval } from "./proc-timing";
import { news2 } from "./news2";
import { verbalOverdue, verbalUnsigned } from "./verbal";
import { isolationFor } from "./ward";
import type { OrderEntry, Patient, ProcedureOrder } from "./types";
import { orderInterval } from "./flowsheet";
import { findDrug } from "./master";
import { hdText } from "./procedures";

export type FlagTone = "shu" | "fuji" | "ai" | "yamabuki" | "wakatake" | "ink";

export interface Flag {
  label: string;
  tone: FlagTone;
  title?: string;
}

const running = (from: number, to: number | null, nowAbs: number) => from <= nowAbs && (to === null || to > nowAbs);

/** 退院・外泊・外出 today or tomorrow, from the orders (「明日 10:00 退院」). */
export function leaveFlags(entries: OrderEntry[]): Flag[] {
  return entries.flatMap((e) => {
    if (e.status !== "有効" || e.order.type !== "procedure" || !e.order.leave) return [];
    const l = e.order.leave;
    if (l.from.day < 0 || l.from.day > 1) return [];
    return [{ label: `${l.from.day === 0 ? "今日" : "明日"} ${l.from.time} ${l.kind}`, tone: "wakatake" as const, title: `${l.destination}${l.back ? `　戻り ${l.back.time}` : ""}` }];
  });
}

export function flagsFor(p: Patient, entries: OrderEntry[], nowAbs: number, waitingTake = 0, consent?: { admission: boolean; pending: string[] }, marPending = 0, results?: { unseen: number; panic: number }): Flag[] {
  const out: Flag[] = [];
  if (results?.panic) out.push({ label: `パニック値 ${results.panic}`, tone: "shu", title: "パニック値の結果を、医師がまだ確認していません" });
  if (results?.unseen) out.push({ label: `未確認の結果 ${results.unseen}`, tone: "ai", title: "今日の検査・画像・培養の結果を、医師がまだ確認していません" });
  const unsigned = verbalUnsigned(entries);
  if (unsigned.length) out.push({ label: `口頭指示 承認待ち ${unsigned.length}`, tone: unsigned.some((e) => verbalOverdue(e, nowAbs)) ? "shu" : "yamabuki", title: "看護師が代わりに入力したオーダ。医師が内容を確かめて承認する" });
  if (marPending > 0) out.push({ label: `実施の入力がまだ ${marPending}`, tone: "shu", title: "予定の時刻を過ぎても実施・未実施の記録がないもの（ワークシートの「照合」から）" });
  if (p.codeStatus === "DNAR") out.push({ label: "DNAR", tone: "shu", title: "事前指示：心停止時の心肺蘇生を行わない（ほかの治療は項目ごと）" });
  const last = p.vitals.at(-1);
  if (last) {
    const n = news2(last);
    if (n.total >= 5 || n.red) out.push({ label: `NEWS2 ${n.total}`, tone: "shu", title: `${last.time} の測定。観察の目安（RCP）：${n.monitoring}` });
  }
  if (consent && !consent.admission) out.push({ label: "包括同意なし", tone: "yamabuki", title: "入院時の包括同意書がまだです" });
  if (consent?.pending.length) out.push({ label: `同意書 説明前 ${consent.pending.length}`, tone: "yamabuki", title: consent.pending.join("、") });
  const iso = isolationFor(p.infections);
  if (iso) out.push({ label: iso, tone: "fuji", title: p.infections.join("、") });
  for (const a of p.allergies) out.push({ label: `アレルギー ${a}`, tone: "shu" });
  if (waitingTake > 0) out.push({ label: `指示受けがまだ ${waitingTake}`, tone: "yamabuki", title: "今日の新しい指示・中止を、看護師がまだ受けていません" });

  for (const e of entries) {
    if (e.order.type !== "procedure") continue;
    const o = e.order as ProcedureOrder;
    const { from, to } = procInterval(e, nowAbs);
    if (!running(from, to, nowAbs)) continue;
    if (o.code === "PROC-O2" && o.o2) out.push({ label: `酸素 ${o.o2.lpm}L`, tone: "ai", title: `${o.o2.device} ${o.o2.lpm}L/分` });
    if (o.code === "PROC-FOLEY") out.push({ label: "尿カテ", tone: "ai", title: "膀胱留置カテーテル 留置中" });
    if (o.code === "PROC-HD" && o.hd) out.push({ label: "透析", tone: "ai", title: `${o.hd.method}（${o.hd.purpose}）${hdText(o.hd)}` });
  }
  const drip = entries.some((e) => {
    if (e.order.type !== "injection" || e.order.route !== "点滴静注") return false;
    const fluid = e.order.items.every((it) => findDrug(it.drugCode)?.kind === "輸液");
    const { from, to } = orderInterval(e, nowAbs);
    return fluid && running(from, to, nowAbs);
  });
  if (drip) out.push({ label: "持続点滴", tone: "ai" });

  const today = p.daily.find((d) => d.day === 0);
  if (p.dietNow ? p.dietNow.startsWith("絶食") : today?.meals === "絶食") out.push({ label: "絶食", tone: "yamabuki", title: p.dietNow });
  for (const c of p.cautions.filter((c) => c !== "絶食中")) out.push({ label: c, tone: "yamabuki" });
  return out;
}
