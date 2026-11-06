"use client";
import { useState } from "react";
import { CATH_STUDIES, cathProblems, cathText, emptyCath } from "@/lib/cardiac-cath";
import { emptyPhysio, egfr } from "@/lib/exams";
import { latestValue } from "@/lib/clinical";
import { classOf } from "@/lib/drug-class";
import { oralName } from "@/lib/format";
import { examSlotAvailable, firstExamSlot, takenExams, type ExamPerson } from "@/lib/exam-slots";
import { useWindowEntry } from "@/lib/window-entry";
import type { CalendarDate } from "@/lib/dates";
import type { Draft } from "@/lib/drafts";
import type { HistoryEntry, Patient } from "@/lib/types";
import { ExamCalendar } from "../ExamCalendar";

export function CardiacCathPanel({ patient, entries, today, people, newId, onAdd }: { patient: Patient; entries: HistoryEntry[]; today: CalendarDate; people: ExamPerson[]; newId: () => string; onAdd: (d: Draft) => void }) {
  const [cath, setCath] = useWindowEntry("cath.details", emptyCath);
  const [purpose, setPurpose] = useWindowEntry("cath.purpose", "");
  const [transport, setTransport] = useState<"独歩" | "車椅子" | "ストレッチャー">("車椅子");
  const taken = takenExams(people, "PHY-CATH");
  const [when, setWhen] = useWindowEntry("cath.when", () => firstExamSlot("PHY-CATH", taken, today));
  const cre = latestValue(patient, "Cre");
  const renal = cre ? `Cre ${cre.value}／eGFR ${egfr(cre.value, patient.age, patient.sex).toFixed(1)}（${cre.day === 0 ? "今日" : `${-cre.day}日前`}）` : "Cre・eGFR 未登録";
  const drugs = entries.flatMap(e => e.kind === "order" && e.status === "有効" && e.order.type === "prescription" ? [{ name: oralName(e.order.drugCode), cls: classOf(e.order.drugCode) }] : []);
  const antithrombotic = drugs.filter(d => /抗凝固|抗血小板|血小板凝集|アスピリン|クロピドグレル|プラスグレル|シロスタゾール|チクロピジン|チカグレロル|リバーロキサバン|ダビガトラン/.test(`${d.name} ${d.cls?.yakko} ${d.cls?.generic}`));
  const input = "rounded border border-rule bg-paper px-2 py-1";
  return <div className="space-y-3 text-[13px]">
    <fieldset className="flex flex-wrap gap-3"><legend>検査の種類</legend>{CATH_STUDIES.map(s => <label key={s}><input type="checkbox" checked={cath.studies.includes(s)} onChange={e => setCath(c => ({ ...c, studies: e.target.checked ? [...c.studies, s] : c.studies.filter(x => x !== s) }))} /> {s}</label>)}</fieldset>
    <label className="block"><input type="checkbox" checked={cath.pci} onChange={e => setCath(c => ({ ...c, pci: e.target.checked }))} /> PCI予定あり</label>
    <div className="flex gap-2"><label>アプローチ <select className={input} value={cath.approach} onChange={e => setCath(c => ({ ...c, approach: e.target.value as typeof c.approach }))}>{["", "橈骨", "上腕", "大腿"].map(s => <option key={s}>{s}</option>)}</select></label><label>左右 <select className={input} value={cath.side} onChange={e => setCath(c => ({ ...c, side: e.target.value as typeof c.side }))}>{["", "右", "左"].map(s => <option key={s}>{s}</option>)}</select></label></div>
    <ExamCalendar kind="PHY-CATH" today={today} taken={taken} value={when} onChange={v => setWhen({ day: v.day ?? 0, time: v.time, priority: "予約" })} />
    <label className="flex flex-col">目的<input className={input} value={purpose} onChange={e => setPurpose(e.target.value)} /></label>
    <fieldset className="space-y-2"><legend>造影剤の確認</legend>
      <label className="block"><input type="checkbox" checked={cath.renalChecked} onChange={e => setCath(c => ({ ...c, renalChecked: e.target.checked }))} /> {renal}</label>
      <label className="block"><input type="checkbox" checked={cath.allergyChecked} onChange={e => setCath(c => ({ ...c, allergyChecked: e.target.checked }))} /> ヨード造影剤アレルギーを確認（{patient.allergies.join("・") || "登録なし"}）</label>
      <label className="flex flex-col">メトホルミン・休薬の指示<input className={input} value={cath.metformin} onChange={e => setCath(c => ({ ...c, metformin: e.target.value }))} /></label>
    </fieldset>
    <p>抗凝固・抗血小板：{antithrombotic.map(d => d.name).join("・") || "該当する登録なし"}</p>
    <details><summary>内服一覧</summary>{drugs.map((d, i) => <p key={i}>{d.name}</p>)}</details>
    <label className="flex flex-col">前処置（絶食・剃毛など）<input className={input} value={cath.preparation} onChange={e => setCath(c => ({ ...c, preparation: e.target.value }))} /></label>
    <label>移動 <select value={transport} className={input} onChange={e => setTransport(e.target.value as typeof transport)}>{["独歩", "車椅子", "ストレッチャー"].map(s => <option key={s}>{s}</option>)}</select></label>

    <button type="button" className="rounded bg-ai px-3 py-2 text-white disabled:opacity-40" disabled={!!cathProblems(cath).length || !purpose.trim() || !examSlotAvailable("PHY-CATH", when, taken, today)} onClick={() => onAdd({ ...emptyPhysio(newId(), "PHY-CATH"), cath, purpose, when, place: "検査室", transport, consentPlanned: true, comment: cathText(cath) })}>下書きにする</button>
  </div>;
}
