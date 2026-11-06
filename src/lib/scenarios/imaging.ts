import { PATIENTS } from "../patients";
import { emptyConsent } from "../exams";
import type { ImagingOrder, Patient } from "../types";
import { defaultRoom, type RisDesk, type RisWork } from "../ris";

/** Authored workflow fixtures; no report findings are generated. */
export function addScenarioImaging(patients: Patient[]): RisDesk {
  const desk: RisDesk = {};
  const tech = "放射線技師 松本";
  const counts: Record<string, number> = {};
  for (const [i, p] of patients.entries()) {
    if (p.age < 18 || p.dischargedAt || p.admittedOn >= 0) continue;
    const pneumonia = /肺炎|心不全|閉塞性肺疾患/.test(p.admissionDiagnosis);
    const stroke = /脳梗塞/.test(p.admissionDiagnosis);
    const modality = stroke ? "MRI" : pneumonia ? (i % 2 ? "ポータブルX線" : "X線") : /腎盂腎炎|大腸癌/.test(p.admissionDiagnosis) ? "CT" : "X線";
    const region = stroke ? "R-HEAD" : pneumonia ? "R-CHEST" : modality === "CT" ? "R-ABD-PELVIS" : /骨折/.test(p.admissionDiagnosis) ? "R-LEG" : "R-CHEST";
    const add = (suffix: string, day: number, phase: number) => {
      const id = `${p.id}-imaging-${suffix}`;
      const order: ImagingOrder = { type: "imaging", modality, region, purpose: `${p.admissionDiagnosis}の${suffix === "course" ? "経過確認" : "評価"}`, when: { day, time: "10:00", priority: "予約" }, transport: modality === "ポータブルX線" ? "病室（ポータブル）" : "車椅子", reading: "当日中", ...(modality === "CT" ? { contrast: suffix === "baseline" ? "単純" : "造影", ...(suffix === "baseline" ? {} : { consent: emptyConsent() }) } : modality === "MRI" ? { contrast: "単純", answers: { metal: "なし（確認済み）" } } : { views: [modality === "ポータブルX線" ? "臥位正面（AP）" : "立位正面（PA）"] }) };
      p.history.push({ kind: "order", id, day: Math.min(day, 0) - 1, time: "16:00", author: p.attending, status: "有効", order });
      if (!phase) return;
      const stamp = { day, time: "09:50", by: tech };
      const w: RisWork = { orderId: id, patientId: p.id, label: `${modality}　${region === "R-HEAD" ? "頭部" : region === "R-CHEST" ? "胸部" : region === "R-LEG" ? "下肢" : "腹部・骨盤"}`, arrived: stamp, room: defaultRoom(modality), slot: { day, time: "10:00" }, assignedBy: tech };
      desk[id] = w;
      if (phase < 2) return;
      if (modality === "CT" && order.contrast !== "単純") {
        order.consent = { ...emptyConsent("取得済み"), at: "前日 16:00", by: p.attending };
        w.contrast = { ...stamp, code: "620003689", name: "イオパミロン注３００シリンジ　６１．２４％１００ｍＬ", count: 1, route: "静注", lot: "TEST-001", reaction: "なし" };
      }
      w.started = { ...stamp, time: "10:00", via: "手入力" };
      w.done = { ...stamp, time: "10:10", via: "手入力" };
      w.exposure = modality === "CT" ? { kv: 120, ma: 180, rotationSec: 0.5, sliceMm: 5, range: "上腹部〜骨盤" } : modality === "MRI" ? { sequences: "T1・T2・拡散強調像" } : { kv: 100, mas: 2.5, distanceCm: 100, films: 1 };
      w.dose = modality === "CT" ? { ctdiVol: 10, dlp: 500 } : modality === "MRI" ? {} : { esak: 0.18 };
      w.images = { ...stamp, time: "10:12", count: modality === "CT" || modality === "MRI" ? 60 : 1, series: modality === "MRI" ? 3 : 1, via: "手入力" };
      if (modality !== "MRI") w.record = { ...stamp, time: "10:15" };
      // Reuse an authored template report only when the modality and region match.
      const authored = PATIENTS.find((t) => t.admissionDiagnosis === p.admissionDiagnosis);
      const report = [...p.imaging, ...(authored?.imaging ?? [])].find((s) => s.modality === (modality === "ポータブルX線" ? "X線" : modality) && (!order.contrast || s.contrast === order.contrast) && (s.regionCode === region || (region === "R-CHEST" && s.region.includes("胸部")) || (region === "R-HEAD" && s.region.includes("頭部"))));
      if (phase === 3 && report) w.report = { ...stamp, time: "11:00", by: report.reader, findings: report.report, impression: report.report };
    };
    const phase = counts[modality] ?? 0;
    counts[modality] = phase + 1;
    add("today", 0, phase % 4);
    if (i % 3 === 0 || modality === "MRI") add("tomorrow", 1, 1);
    if (modality === "MRI") add("previous", -1, 2);
    if (modality === "CT" && /腎盂腎炎/.test(p.admissionDiagnosis)) add("baseline", -1, 3);
    if (pneumonia && p.admittedOn < -2) {
      add("admission", p.admittedOn, 3);
      add("course", -1, 3);
    }
  }
  return desk;
}
