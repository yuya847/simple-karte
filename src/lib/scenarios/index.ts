import { addScenarioAnesthesia } from "./anesthesia";
import { nursingState } from "./nursing";
import { addScenarioImaging } from "./imaging";
import { addScenarioPhysiology } from "./physiology";
import { addPharmacyOrders, pharmacyBook, pharmacyBloodIssues } from "./pharmacy-orders";
import { clinicalProfile } from "./clinical-profiles";
import { prepareClinical, addClinicalCourse } from "./clinical-course";
import { linesFromFields } from "../standing-lines";
import { addWorkflow } from "./workflow";
import { createDischargeDraft } from "../discharge";
// Deterministic, entirely fictional workflow fixtures. Clinical decisions are authored fixtures,
// never inferred recommendations. Existing chart templates supply master-backed orders/diagnoses.
import { WARD_CHARTS } from "../ward-charts";
import { PATIENTS } from "../patients";
import { INITIAL_DIAGNOSES } from "../diagnoses";
import { INITIAL_DIETS } from "../diet";
import { emptyStanding } from "../standing";
import { FACILITIES, type TransferAsk } from "../transfer";
import { checkDigit } from "../billing/insurance";
import { EMPTY_FORM, toInsurance, type InsuranceForm, type InsuranceBook } from "../billing/registration";
import type { Patient, HistoryEntry } from "../types";
import type { ErPatient } from "../er";
import type { OpdPatient } from "../opd";

import { scenarioName } from "./names";
import { FLOORS, doctorFor, nurseFor } from "../ward";
import { STAFF } from "../roles";
import { admissionState } from "./admission";
import { assignRooms } from "./occupancy";

export type Stage = "救急" | "入院" | "退院" | "外来";
const scenarioTime = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
export const SCENARIO_SEED = 20261106;

/** Shift only temporal offsets, never duration/count/age fields. Rewrite all fixture-local IDs. */
function relocate<T>(value: T, shift: number, prefix: string): T {
  const walk = (v: unknown, key = ""): unknown => {
    if (typeof v === "number" && ["day", "admittedOn", "collectedOn", "reportedOn", "stoppedOn", "start", "outcomeDay", "onset", "onsetDay", "surgeryDay", "until"].includes(key)) return v + shift;
    if (typeof v === "string" && ["id", "replaces"].includes(key)) return `${prefix}-${v}`;
    if (Array.isArray(v)) return v.map((x) => walk(x));
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x, k)]));
    return v;
  };
  return walk(value) as T;
}

function insuranceForm(i: number, age: number): InsuranceForm | null {
  const axis = i % 14;
  if (axis === 13) return null;
  const kind = age >= 75 ? "後期高齢者" : (["国保", "協会けんぽ", "組合健保", "共済"] as const)[i % 4];
  const body = kind === "国保" ? "14999" : ({ 後期高齢者: "3914999", 協会けんぽ: "0114999", 組合健保: "0614999", 共済: "3114999" } as const)[kind];
  const coverage = axis === 7 ? "生活保護" : axis === 8 ? "自費" : "医保";
  const law = axis === 7 ? "12" : axis === 10 ? "54" : axis === 11 ? "10" : axis === 12 ? "21" : null;
  const rate = age >= 75 ? (["10", "20", "30"] as const)[i % 3] : age < 6 || age >= 70 ? "20" : "30";
  return { ...EMPTY_FORM, coverage, kind, insurerNumber: body + checkDigit(body), number: String(700000 + i), relation: age < 18 ? "家族" : "本人", birthDate: age === 0 ? "2026-11-06" : `${2026 - age}-01-15`, rate,
    incomeClass: age >= 75 ? rate === "30" ? "現役並みⅠ" : rate === "20" ? "一般Ⅱ" : "一般Ⅰ" : age >= 70 ? "一般" : (["ア", "イ", "ウ", "エ", "オ"] as const)[i % 5], proof: "限度額適用認定証",
    kohi: law ? [{ lawNo: law, name: law === "12" ? "生活保護" : law === "54" ? "指定難病" : law === "10" ? "結核" : "自立支援", payerNumber: law + "14999" + checkDigit(law + "14999"), recipientNumber: String(1000000 + i), capYen: "5000" }] : [] };
}

export function generateScenarios(seed = SCENARIO_SEED) {
  const templates = [...PATIENTS.map((patient) => ({ patient, diagnoses: INITIAL_DIAGNOSES[patient.id], diets: INITIAL_DIETS.filter((d) => d.patientId === patient.id) })), ...WARD_CHARTS];
  let state = seed >>> 0;
  const next = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state; };
  const insurance: InsuranceBook = {};
  let ownInpatients = 0;
  const cases = Array.from({ length: 100 }, (_, i) => {
    const id = `9900${String(i + 1).padStart(4, "0")}`;
    // Keep specialist workflows once each; most admissions use the four master-backed DPC templates.
    const required = i === 14 ? "末期腎不全" : i === 15 ? "慢性閉塞性肺疾患" : i === 16 ? "アテローム血栓性脳梗塞" : i === 17 ? "大腿骨頚部骨折" : i === 18 ? "大腸癌" : null;
    const base = (required ? templates.find((t) => t.patient.admissionDiagnosis === required) : undefined) ?? templates[(i + (seed >>> 0) % PATIENTS.length) % PATIENTS.length];
    const stage: Stage = i % 10 === 0 ? "救急" : i % 10 === 8 ? "退院" : i % 10 === 9 ? "外来" : "入院";
    const drawnDuration = 1 + next() % 35;
    const duration = i === 7 || i === 11 ? Math.max(14, drawnDuration) : i === 1 ? 105 : i === 12 ? 8 : [6, 14, 17, 18].includes(i) ? Math.max(i === 6 ? 21 : 8, drawnDuration) : drawnDuration;
    const admittedOn = stage === "救急" ? 0 : stage === "外来" || stage === "退院" ? -duration - 7 : 1 - duration;
    const dischargeDay = stage === "退院" || stage === "外来" ? -7 : undefined;
    const shift = admittedOn - base.patient.admittedOn;
    const p = relocate(base.patient, shift, id);
    const identity = scenarioName(i, i === 4 ? "女" : base.patient.sex);
    const floor = FLOORS[i % FLOORS.length];
    const slots = floor.rooms.flatMap((r) => r.beds.map((bed) => ({ room: r.no, bed })));
    const slot = slots[Math.floor(i / FLOORS.length)];
    const age = i === 0 ? 0 : i === 2 ? 5 : i === 4 ? 29 : i === 28 ? 88 : i === 13 ? 38 : i === 99 ? 100 : Math.max(18, Math.min(99, base.patient.age + (i * 7 % 17) - 8));
    let destination = ["自宅", "介護施設", "回復期リハビリ病院", "療養病院", "死亡退院"][Math.floor(i / 10) % 5];
    if (i === 28) destination = "死亡退院";
    if (i !== 28 && destination === "死亡退院") destination = "自宅";
    const patient: Patient = { ...p, id, ...identity, age, sex: base.patient.sex, ...(i === 4 ? { sex: "女", pregnancy: { weeks: 28 } } : {}), ...(age === 0 ? { ageMonths: 0, heightCm: 49, weightKg: 3.1 } : age === 5 ? { heightCm: 110, weightKg: 18 } : {}), ward: floor.name, room: slot.room, attending: doctorFor(p.department), admittedOn,
      ...(dischargeDay !== undefined ? { dischargedAt: { day: dischargeDay, time: "10:00", by: "山本（専攻医）" } } : {}),
      history: p.history.filter((e) => e.day <= (dischargeDay ?? 0)), labs: p.labs.filter((e) => e.day <= (dischargeDay ?? 0)), cultures: p.cultures.filter((e) => e.collectedOn <= (dischargeDay ?? 0) && (e.reportedOn ?? 0) <= (dischargeDay ?? 0)), vitals: p.vitals.filter((e) => e.day <= (dischargeDay ?? 0)), daily: p.daily.filter((e) => e.day <= (dischargeDay ?? 0)), imaging: p.imaging.filter((e) => e.day <= (dischargeDay ?? 0)) };
    if (age >= 18) patient.weightKg = Math.round((base.patient.weightKg + (i % 11 - 5) * 0.6) * 10) / 10;
    const clinical = clinicalProfile(i);
    const clinicalDiagnoses = prepareClinical(patient, clinical);
    if (patient.admissionDiagnosis.includes("心不全")) patient.department = "循環器内科";
    if (patient.admissionDiagnosis.includes("腎盂腎炎")) patient.department = "泌尿器科";
    patient.attending = doctorFor(patient.department);
    if (patient.department.startsWith("総合診療")) {
      const own = stage === "入院" && ownInpatients < 12;
      if (own) ownInpatients++;
      patient.attending = own ? STAFF.医師.name : i % 2 ? "木下（総合診療科 B）" : "吉田（総合診療科 C）";
    }
    else if (patient.department === "循環器内科") patient.attending = "井上（循環器内科）";
    else if (patient.department === "小児科") patient.attending = "若槻（小児科）";
    else if (patient.department === "産婦人科") patient.attending = "羽村（産婦人科）";
    patient.history = patient.history.map((e) => ({ ...e, author: e.kind === "note" && e.role === "看護師" ? nurseFor(patient.room) : e.author === base.patient.attending || e.id === `${id}-initial-lab` ? patient.attending : e.author }));
    if (patient.dischargedAt) { patient.dischargedAt.by = patient.attending; if (destination === "死亡退院") patient.dischargedAt.time = "14:20"; }
    const note = (day: number, role: "医師" | "看護師" | "MSW", text: string) => patient.history.push({ kind: "note", id: `${id}-story-${patient.history.length}`, day, time: day === dischargeDay ? destination === "死亡退院" ? "14:20" : "10:00" : "10:00", author: role === "医師" ? patient.attending : role === "看護師" ? nurseFor(patient.room) : role, role, text });
    const diagnoses = clinicalDiagnoses;

    const workflow = addWorkflow(patient, diagnoses, dischargeDay ?? 0, i);
    const clinicalDiets = addClinicalCourse(patient, clinical, dischargeDay ?? 0, i, destination, stage);
    if (dischargeDay !== undefined) {
      // Inpatient orders end at discharge; outpatient orders belong to the follow-up encounter.
      patient.history = patient.history.map((e): HistoryEntry => e.kind === "order" && e.status === "有効" ? { ...e, status: "終了", stoppedOn: dischargeDay, ...("start" in e.order ? { order: { ...e.order, days: Math.max(1, Math.min(e.order.days ?? Infinity, dischargeDay - e.order.start.day + 1)), ...(e.order.type === "injection" ? { end: { day: Math.min(e.order.end?.day ?? dischargeDay, dischargeDay), time: "10:00" } } : {}) } } : {}) } : e);
      if (destination !== "死亡退院") {
        const rx = patient.history.find((e) => e.kind === "order" && e.order.type === "prescription" && e.order.drugCode === "ORAL-FRS20");
        if (rx?.kind === "order" && rx.order.type === "prescription") patient.history.push({ ...rx, id: `${id}-home-rx`, day: dischargeDay, time: "09:00", status: "終了", order: { ...rx.order, category: "退院時", start: { day: dischargeDay, timing: "朝" }, days: 7 } });
        patient.history.push({ kind: "order", id: `${id}-followup-booking`, day: dischargeDay, time: "09:10", author: patient.attending, status: "実施済", order: { type: "procedure", code: "PROC-OPD", start: { day: dischargeDay, time: "09:10" }, schedule: { kind: "once" }, opd: { dept: patient.department, doctor: patient.attending, day: 0, slot: "時刻", time: "09:00", purpose: "退院後の経過・服薬・検査の確認" } } });
      }
      diagnoses[0].outcome = destination === "死亡退院" ? "死亡" : "中止";
      diagnoses[0].outcomeDay = dischargeDay;
      note(dischargeDay, "医師", `退院サマリ：主訴は${clinical.complaint}。${clinical.onset}。入院時は${clinical.assessment[0]}。治療：${clinical.plan[0]}。経過：${clinical.assessment[2]}。転帰：${destination}。退院時所見：${clinical.findings[2]}。継続方針：${clinical.plan[2]}。${destination === "死亡退院" ? "14:20、呼吸・心拍停止、瞳孔固定を確認し死亡確認。家族に説明。" : "1週間後の外来で症状と採血を確認。"}`);
      note(dischargeDay, "看護師", destination === "死亡退院" ? "家族へ経過を説明し、死後のケアと手続きを支援。" : `退院先：${destination}。${clinical.name}について、${clinical.plan[2]}。本人・家族に${clinical.complaint}が再び現れた場合の連絡先を伝達。`);
      if (stage === "外来" && destination !== "死亡退院") {
        note(0, "医師", `外来再診 SOAP\nS：${clinical.symptoms[2]}。退院後の服薬忘れなし。\nO：${clinical.findings[2]}。体温36.7℃、血圧122/72mmHg、脈拍76/分。\nA：${clinical.assessment[2]}。\nP：${clinical.plan[2]}。次回2週間後。`);
        patient.labs.push({ ...patient.labs.at(-1)!, day: 0, time: scenarioTime(550 + i % 9 * 7) });
        patient.vitals.push({ day: 0, time: "09:00", bt: 36.7, sbp: 122, dbp: 72, hr: 76, spo2: 98, o2: "室内気", rr: 16, avpu: "A" });
        patient.history.push({ kind: "order", id: `${id}-opd-lab`, day: 0, time: "09:00", author: patient.attending, status: "実施済", order: { type: "lab", codes: ["LAB-CBC", "LAB-CRP"], collect: { day: 0, time: scenarioTime(550 + i % 9 * 7) }, priority: "定時" } });
      }
    }
    if (stage === "救急") patient.history = patient.history.map((e) => e.kind === "order" && e.order.type === "lab" && e.order.collect?.day === patient.admittedOn ? { ...e, order: { ...e.order, collect: { ...e.order.collect, time: scenarioTime(490 + Math.floor(i / 10) * 13) } } } : e);
    addPharmacyOrders(patient, i, stage);
    patient.history.sort((a, b) => a.day - b.day || a.time.localeCompare(b.time));

    const diets = clinicalDiets;
    if (i === 12) diets.push({ id: `${id}-tube`, patientId: id, from: { day: admittedOn + 1, meal: "昼" }, kind: "経管栄養", tube: { product: "EN-STD", mlPerMeal: 300, ratePerH: 100 }, by: patient.attending, at: { day: admittedOn + 1, time: "09:00" } });
    if (i === 12 && admittedOn + 4 <= (dischargeDay ?? 0)) diets.push({ id: `${id}-oral-restart`, patientId: id, from: { day: admittedOn + 4, meal: "昼" }, kind: "嚥下調整食", dysphagia: "2-1", by: patient.attending, at: { day: admittedOn + 4, time: "09:00" } });
    if (i === 13) diets.push({ id: `${id}-diabetes-diet`, patientId: id, from: { day: admittedOn, meal: "夕" }, kind: "治療食", therapeutic: "TD-ENERGY", energyKcal: 1600, by: patient.attending, at: { day: admittedOn, time: "09:00" } });
    const form = insuranceForm(i, age);
    if (form) insurance[id] = [{ form, insurance: toInsurance(form), action: "登録", by: "医事課", at: { day: admittedOn, time: "09:00" } }];
    return { patient, bed: slot.bed, diagnoses, diets, stage, destination, planned: stage !== "救急" && i % 3 === 0, ...workflow };
  });
  assignRooms(cases);
  const patients = cases.map((c) => c.patient);
  const physioDesk = addScenarioPhysiology(patients);
  const ris = addScenarioImaging(patients);
  const er: ErPatient[] = cases.filter((c) => !c.planned || c.stage === "救急").map(({ patient: p, stage }) => ({ id: p.id, name: p.name, kana: p.kana, age: p.age, sex: p.sex, ageMonths: p.ageMonths, arrival: "救急車", arrivedAbs: stage === "救急" ? 480 : p.admittedOn * 1440 + 480, complaint: p.admissionDiagnosis, status: stage === "救急" ? "診察中" : "入院済", ...(stage === "救急" ? {} : { admittedAs: p.id }), jtas: 3, allergies: p.allergies, note: p.history.find((e) => e.kind === "note")?.text }));
  const opd: OpdPatient[] = cases.filter((c) => c.stage === "外来" && c.destination !== "死亡退院").map(({ patient: p }) => ({ id: p.id, name: p.name, kana: p.kana, age: p.age, sex: p.sex, department: p.department, doctor: p.attending, slot: "09:00", status: "診察待ち", kind: "再診", reason: `退院後のフォロー：${p.admissionDiagnosis}`, allergies: p.allergies, problems: [p.admissionDiagnosis], meds: [], visits: p.history.filter((e) => e.kind === "note").map((e) => ({ day: e.day, text: e.text ?? e.soap?.a ?? "経過確認" })) }));
  for (const p of [...er.map((p) => `er:${p.id}`), ...opd.map((p) => `opd:${p.id}`)]) { const id = p.slice(p.indexOf(":") + 1); if (insurance[id]) insurance[p] = insurance[id]; }
  const visitOrders: Record<string, import("../types").OrderEntry[]> = {};
  const visitChartNotes: Record<string, import("../types").NoteEntry[]> = {};
  const visitNotes: Record<string, { text: string; at: string; by: string }[]> = {};
  for (const [kind, visits] of [["er", er], ["opd", opd]] as const) for (const v of visits) {
    const c = cases.find((c) => c.patient.id === v.id)!;
    const key = `${kind}:${v.id}`;
    const entries = kind === "opd" ? c.patient.history.filter((e) => e.day === 0) : c.patient.history.filter((e) => e.day === c.patient.admittedOn);
    visitOrders[key] = entries.filter((e): e is import("../types").OrderEntry => e.kind === "order").map((e) => ({ ...e, id: `${key}-${e.id}`, day: 0 }));
    visitChartNotes[key] = entries.filter((e): e is import("../types").NoteEntry => e.kind === "note").map((e) => ({ ...e, id: `${key}-${e.id}`, day: 0 }));
    visitNotes[key] = entries.filter((e) => e.kind === "note").map((e) => ({ text: e.text ?? Object.values(e.soap ?? {}).join("\n"), at: e.time, by: e.author }));
  }
  const asks: TransferAsk[] = cases.filter((c) => c.destination === "回復期リハビリ病院" || c.destination === "療養病院").map(({ patient: p, destination }) => { const f = FACILITIES[destination === "回復期リハビリ病院" ? 0 : 1]; return { id: `${p.id}-transfer`, patientId: p.id, facility: f.name, kind: f.kind, state: p.dischargedAt ? "決定" : "打診中", log: [{ at: "入院後", by: "MSW", state: p.dischargedAt ? "決定" : "打診中", note: "本人・家族の希望を確認。診療情報・リハビリ申し送りを共有。" }] }; });
  const discharges = Object.fromEntries(cases.filter((c) => c.patient.dischargedAt).map((c) => {
    const d = createDischargeDraft(c.patient, c.patient.history, [], { y: 2026, m: 11, d: 6 });
    const clinical = clinicalProfile(Number(c.patient.id.slice(-4)) - 1);
    return [c.patient.id, { ...d, outcome: c.destination === "死亡退院" ? "6" : "1", dischargeDay: c.patient.dischargedAt!.day, destination: c.destination, sections: { ...d.sections, complaint: clinical.complaint, present: clinical.onset, reason: clinical.assessment[0], status: clinical.findings[2], course: c.patient.history.filter((e) => e.kind === "note").map((e) => `${e.day}日 ${e.text ?? e.soap?.a ?? ""}`).join("\n"), plan: c.destination === "死亡退院" ? "死亡確認の経過を家族に説明済み。" : clinical.plan[2] }, letter: { ...d.letter, to: c.destination, dept: c.patient.department, purpose: `${c.patient.admissionDiagnosis}の継続診療の依頼。${clinical.assessment[2]}。${clinical.plan[2]}。`, issuedAt: { day: c.patient.dischargedAt!.day, time: "09:00" } } }];
  }));
  const standing = Object.fromEntries(patients.map((p) => [p.id, [{ ...emptyStanding(p.attending, { day: p.admittedOn, time: "10:00" }), rest: p.id === "99000013" ? "ベッド上" as const : /骨折|脳梗塞/.test(p.admissionDiagnosis) ? "室内" as const : "病棟内" as const, vitals: p.id === "99000013" ? "4時間ごと" as const : "1日3回" as const, ...(p.admittedOn < 0 && Number(p.id) % 19 !== 0 ? { taken: { by: nurseFor(p.room), time: "10:15" } } : {}), other: p.id === "99000013" ? "人工呼吸器装着中はICUで管理。抜管後は酸素指示を確認。" : "" }]]));
  const standingLines = Object.fromEntries(Object.entries(standing).map(([id, versions]) => [id, linesFromFields(versions).map((l, i) => ({ ...l, id: `${id}-standing-${i}` }))]));
  const admission = admissionState(cases);
  const nursing = nursingState(cases, admission.evals);
  return { nursing, txIssued: pharmacyBloodIssues(patients), narcBook: pharmacyBook(patients), cases, patients, physioDesk, ris, er, opd, asks, insurance, discharges, visitOrders, visitNotes, visitChartNotes, restraints: cases.flatMap((c) => c.restraints), surgeries: addScenarioAnesthesia(patients, cases.flatMap((c) => c.surgeries)), directives: cases.flatMap((c) => c.directives), diagnoses: Object.fromEntries(cases.map((c) => [c.patient.id, c.diagnoses])), diets: cases.flatMap((c) => c.diets), beds: cases.filter((c) => c.stage !== "救急").map((c) => ({ room: c.patient.room, bed: c.bed, patientId: c.patient.id, specialty: c.patient.age < 18 ? "小児" as const : c.patient.pregnancy ? "産科" as const : undefined })), discharged: Object.fromEntries(patients.flatMap((p) => p.dischargedAt ? [[p.id, p.dischargedAt]] : [])), standing, standingLines, ...admission };
}
export const SCENARIOS = generateScenarios();
