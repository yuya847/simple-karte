import type { Patient, OrderEntry } from "../types";
import type { ChecklistRecord, AdmitEval } from "../admit-eval";
import type { PressureUlcer } from "../pressure-course";
import type { NursingProblem } from "../nursing-plan";
import { nurseFor } from "../ward";
import { procInterval } from "../proc-timing";
import { abs } from "../flowsheet";

/** Authored nursing fixtures, using admission-relative days and existing assessment rules. */
export function nursingState(cases: { patient: Patient; stage: string }[], evals: Record<string, AdmitEval>) {
  const fallReviews: Record<string, ChecklistRecord[]> = {};
  const ulcers: PressureUlcer[] = [];
  const nursingPlans: NursingProblem[] = [];
  const pendingKeys: string[] = [];
  for (const { patient: p, stage } of cases) {
    if (stage !== "入院") continue;
    const i = Number(p.id.slice(-4));
    const by = nurseFor(p.room);
    const first = evals[p.id]?.fall;
    // Most patients were reassessed during this week; a minority retain overdue work.
    if (first && p.admittedOn < -7) {
      const day = Math.max(p.admittedOn + 1, i % 5 === 0 ? -8 : -1 - i % 5);
      fallReviews[p.id] = [{ ...first, at: { day, time: "14:00" }, by }];
    }
    if ((p.age >= 85 && i % 2 === 0) || (i === 22 && p.admittedOn <= -3)) {
      const day = Math.max(i === 22 ? p.admittedOn + 3 : p.admittedOn, -2);
      ulcers.push({ id: `${p.id}-ulcer`, patientId: p.id, site: "仙骨部", foundOn: i === 22 ? p.admittedOn + 3 : p.admittedOn, origin: i === 22 ? "院内発生" : "持ち込み", by,
        assessments: [{ id: `${p.id}-ulcer-review`, at: { day, time: "14:00" }, by, score: { depth: "d2", e: "e1", s: "s3", i: "i0", g: "g0", n: "n0", p: "p0" }, size: { lengthCm: 1.5, widthCm: 1 }, note: "浅い皮膚損傷。除圧と皮膚の観察を継続。" }] });
      if (i !== 22 && evals[p.id]?.pressure) evals[p.id].pressure!.ulcerNow = true;
    }
    nursingPlans.push({ id: `${p.id}-nursing-plan`, patientId: p.id, no: 1, plannedOn: p.admittedOn, plannedAt: "14:00", by,
      problem: p.age >= 75 ? "移動時に転倒するおそれ" : "入院に伴う生活の変化と不安", goal: p.age >= 75 ? "援助を受けて安全に移動できる" : "心配なことを伝え、療養の見通しを話せる",
      op: ["移動時のふらつき、疲労、本人の訴え"], tp: ["ナースコールを手元に置き、必要な移動を介助する"], ep: ["困ったときや移動前に看護師を呼ぶ方法を確認する"],
      evalDue: Math.max(p.admittedOn + 7, i % 5 === 0 ? -1 : 1 + i % 5), evaluations: p.admittedOn < -7 ? [{ day: Math.max(p.admittedOn + 1, -3), time: "14:00", by, result: "継続", note: "援助の必要な場面を本人と確認。目標に向けて支援を続ける。", nextDue: i % 5 === 0 ? -1 : 1 + i % 5 }] : [] });
    // A few current orders deliberately await the receiving nurse.
    if (i % 11 === 2) {
      const entry: OrderEntry = { kind: "order", id: `${p.id}-nursing-pending`, day: 0, time: "08:00", author: p.attending, status: "有効", order: { type: "lab", codes: ["LAB-CBC", "LAB-CRP"], collect: { day: 1, time: "06:00" }, priority: "定時" } };
      p.history.push(entry);
      pendingKeys.push(`${entry.id}|新規`);
      p.history.sort((a, b) => a.day - b.day || a.time.localeCompare(b.time));
    }
  }
  return { fallReviews, ulcers, nursingPlans, pendingKeys };
}

/** Match each measured oxygen device to the authored order at that measurement time. */
export function nursingOxygen(p: Patient, day: number, time: string): string {
  const at = abs(day, time);
  const entries = p.history.filter((e): e is OrderEntry => e.kind === "order" && e.order.type === "procedure" && e.order.code === "PROC-O2");
  const active = entries.filter((e) => { const r = procInterval(e, at); return r.from <= at && (r.to === null || at < r.to); }).at(-1);
  return active?.order.type === "procedure" && active.order.o2 ? `${active.order.o2.device} ${active.order.o2.lpm}L/分` : "室内気";
}

export function nursingVitalVariation(i: number, after: number) {
  return { temperature: ((i + after) % 7 - 3) / 10, systolic: (i * 7 + after * 3) % 25 - 12, diastolic: (i * 3 + after) % 15 - 7 };
}
