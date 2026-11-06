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
  const coverage = axis === 7 ? "生活保護" : axis === 8 ? "自費" : axis === 9 ? "労災" : "医保";
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
    const duration = i === 1 ? 105 : i === 12 ? 8 : 1 + next() % 35;
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
    if (stage === "外来" && destination === "死亡退院") destination = "自宅";
    const patient: Patient = { ...p, id, ...identity, age, sex: base.patient.sex, ...(i === 4 ? { sex: "女", pregnancy: { weeks: 28 } } : {}), ...(age === 0 ? { ageMonths: 0, heightCm: 49, weightKg: 3.1 } : age === 5 ? { heightCm: 110, weightKg: 18 } : {}), ward: floor.name, room: slot.room, attending: doctorFor(p.department), admittedOn,
      ...(dischargeDay !== undefined ? { dischargedAt: { day: dischargeDay, time: "10:00", by: "山本（専攻医）" } } : {}),
      history: p.history.filter((e) => e.day <= (dischargeDay ?? 0)), labs: p.labs.filter((e) => e.day <= (dischargeDay ?? 0)), cultures: p.cultures.filter((e) => e.collectedOn <= (dischargeDay ?? 0) && (e.reportedOn ?? 0) <= (dischargeDay ?? 0)), vitals: p.vitals.filter((e) => e.day <= (dischargeDay ?? 0)), daily: p.daily.filter((e) => e.day <= (dischargeDay ?? 0)), imaging: p.imaging.filter((e) => e.day <= (dischargeDay ?? 0)) };
    // Dedicated age-sensitive fixtures contain no adult dosing or adult comorbidities.
    const special = i === 0 ? ["7746003", "新生児黄疸", "P599"] : i === 2 ? ["4939008", "気管支喘息", "J459"] : i === 4 ? ["6441002", "切迫早産", "O600"] : i === 6 ? ["8830124", "ＭＲＳＡ敗血症", "A410"] : i === 7 ? ["8847068", "ＥＳＢＬ産生菌感染症", "A499"] : i === 11 ? ["8851933", "クロストリジオイデス・ディフィシル腸炎", "A047"] : i === 12 ? ["7991001", "急性呼吸不全", "J9609"] : i === 13 ? ["2500015", "２型糖尿病", "E11"] : i === 18 ? ["8842053", "非小細胞肺癌", "C349"] : i === 28 ? ["8840249", "末期癌", "C809"] : null;
    if (special) {
      patient.admissionDiagnosis = special[1];
      patient.history = [];
      patient.labs = []; patient.cultures = []; patient.imaging = [];
      patient.vitals = [{ day: admittedOn, time: "09:00", bt: 37, hr: age === 0 ? 130 : age === 5 ? 100 : 88, sbp: age === 0 ? 68 : 110, spo2: 97 }];
      patient.daily = []; patient.allergies = []; patient.infections = [];
      patient.department = i === 0 || i === 2 ? "小児科" : i === 4 ? "産婦人科" : "総合診療科";
      patient.history.push({ kind: "order", id: `${id}-initial-lab`, day: admittedOn, time: "09:30", author: patient.attending, status: "実施済", order: { type: "lab", codes: ["LAB-CBC", "LAB-CRP"], collect: { day: admittedOn, time: "09:30" }, priority: "至急" } });
    }
    if (!special && patient.admissionDiagnosis.includes("心不全")) patient.department = "循環器内科";
    if (!special && patient.admissionDiagnosis.includes("腎盂腎炎")) patient.department = "泌尿器科";
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
    if (patient.dischargedAt) patient.dischargedAt.by = patient.attending;
    const note = (day: number, role: "医師" | "看護師" | "MSW", text: string) => patient.history.push({ kind: "note", id: `${id}-story-${patient.history.length}`, day, time: "10:00", author: role === "医師" ? patient.attending : role === "看護師" ? nurseFor(patient.room) : role, role, text });
    note(admittedOn, "医師", `${stage === "救急" ? "救急外来で診察中。入院適応を医師が評価中。" : i % 3 ? "救急車で救急外来受診。初療後に入院依頼。" : "外来で説明を受け予定入院。"}${patient.admissionDiagnosis}で${patient.department}、${patient.attending}が担当。`);
    note(admittedOn, "看護師", `本人・家族から生活歴とアレルギー確認。${patient.allergies.join("、") || "申告なし"}。転倒予防と退院後の生活を相談。`);
    if (admittedOn + 2 <= (dischargeDay ?? 0)) note(admittedOn + 2, "医師", `${patient.admissionDiagnosis}の経過を再評価。検査結果・摂取量・離床状況を確認し、記録のオーダを見直した。`);
    if (duration > 7) note(Math.min(admittedOn + 5, dischargeDay ?? 0), "MSW", destination === "死亡退院" ? "家族と療養環境を相談。面会と家族支援を地域連携室と調整。" : `本人・家族と退院先を相談。希望：${destination}。地域連携室と必要書類、移動方法を確認。`);
    const diagnoses = special ? [{ id: `${id}-dx`, code: special[0], name: special[1], icd10: special[2], prefixes: [], suffixes: [], main: true, start: admittedOn, outcome: "継続" as const }] : relocate(base.diagnoses, shift, id).map((d) => ({ ...d, start: admittedOn }));
    const workflow = addWorkflow(patient, diagnoses, dischargeDay ?? 0, i);
    if (dischargeDay !== undefined) {
      // Inpatient orders end at discharge; outpatient orders belong to the follow-up encounter.
      patient.history = patient.history.map((e): HistoryEntry => e.kind === "order" && e.status === "有効" ? { ...e, status: "終了", stoppedOn: dischargeDay, ...("start" in e.order ? { order: { ...e.order, days: Math.max(1, Math.min(e.order.days ?? Infinity, dischargeDay - e.order.start.day + 1)), ...(e.order.type === "injection" ? { end: { day: Math.min(e.order.end?.day ?? dischargeDay, dischargeDay), time: "10:00" } } : {}) } } : {}) } : e);
      if (destination !== "死亡退院") {
        const rx = patient.history.find((e) => e.kind === "order" && e.order.type === "prescription");
        if (rx?.kind === "order" && rx.order.type === "prescription") patient.history.push({ ...rx, id: `${id}-home-rx`, day: dischargeDay, time: "09:00", status: "終了", order: { ...rx.order, category: "退院時", start: { day: dischargeDay, timing: "朝" }, days: 7 } });
        patient.history.push({ kind: "order", id: `${id}-followup-booking`, day: dischargeDay, time: "09:10", author: patient.attending, status: "実施済", order: { type: "procedure", code: "PROC-OPD", start: { day: dischargeDay, time: "09:10" }, schedule: { kind: "once" }, opd: { dept: patient.department, doctor: patient.attending, day: 0, slot: "時刻", time: "09:00", purpose: "退院後の経過・服薬・検査の確認" } } });
      }
      note(dischargeDay, "医師", `退院サマリ：${patient.admissionDiagnosis}。転帰：${destination}。診療情報提供書を作成し、経過・検査・退院処方を引き継ぎ。${destination === "死亡退院" ? "家族に説明し死亡退院。" : "再診時に症状と検査を確認。"}`);
      note(dischargeDay, "看護師", destination === "死亡退院" ? "家族へ経過を説明し、死後のケアと手続きを支援。" : "退院処方の服薬説明、リハビリ申し送り（移乗・歩行・嚥下・介助量）を受け入れ先と家族へ伝達。");
      if (stage === "外来" && destination !== "死亡退院") {
        note(0, "医師", "退院後の外来再診。生活状況と服薬を確認。採血結果を確認して次回予約。");
        patient.history.push({ kind: "order", id: `${id}-opd-lab`, day: 0, time: "09:00", author: patient.attending, status: "実施済", order: { type: "lab", codes: ["LAB-CBC", "LAB-CRP"], collect: { day: 0, time: "09:10" }, priority: "定時" } });
      }
    }
    patient.history.sort((a, b) => a.day - b.day || a.time.localeCompare(b.time));

    const diets = special ? [] : relocate(base.diets, shift, id).map((d) => ({ ...d, patientId: id, by: patient.attending }));
    if (i === 12) diets.push({ id: `${id}-tube`, patientId: id, from: { day: admittedOn + 1, meal: "昼" }, kind: "経管栄養", tube: { product: "EN-STD", mlPerMeal: 300, ratePerH: 100 }, by: patient.attending, at: { day: admittedOn + 1, time: "09:00" } });
    if (i === 13) diets.push({ id: `${id}-diabetes-diet`, patientId: id, from: { day: admittedOn, meal: "夕" }, kind: "治療食", therapeutic: "TD-ENERGY", energyKcal: 1600, by: patient.attending, at: { day: admittedOn, time: "09:00" } });
    const form = insuranceForm(i, age);
    if (form) insurance[id] = [{ form, insurance: toInsurance(form), action: "登録", by: "医事課", at: { day: admittedOn, time: "09:00" } }];
    return { patient, bed: slot.bed, diagnoses, diets, stage, destination, planned: stage !== "救急" && i % 3 === 0, ...workflow };
  });
  assignRooms(cases);
  const patients = cases.map((c) => c.patient);
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
    return [c.patient.id, { ...d, dischargeDay: c.patient.dischargedAt!.day, destination: c.destination, sections: { ...d.sections, course: c.patient.history.filter((e) => e.kind === "note").map((e) => `${e.day}日 ${e.text ?? e.soap?.a ?? ""}`).join("\n"), plan: c.destination === "死亡退院" ? "家族説明済" : "処方とリハビリ申し送りを確認し、外来再診。" }, letter: { ...d.letter, to: c.destination, purpose: "退院後の継続診療・リハビリの依頼" } }];
  }));
  const standing = Object.fromEntries(patients.map((p) => [p.id, [{ ...emptyStanding(p.attending, { day: p.admittedOn, time: "10:00" }), rest: p.id === "99000013" ? "ベッド上" as const : /骨折|脳梗塞/.test(p.admissionDiagnosis) ? "室内" as const : "病棟内" as const, vitals: p.id === "99000013" ? "4時間ごと" as const : "1日3回" as const, ...(p.admittedOn < 0 && Number(p.id) % 19 !== 0 ? { taken: { by: nurseFor(p.room), time: "10:15" } } : {}), other: p.id === "99000013" ? "人工呼吸器装着中はICUで管理。抜管後は酸素指示を確認。" : "" }]]));
  const standingLines = Object.fromEntries(Object.entries(standing).map(([id, versions]) => [id, linesFromFields(versions).map((l, i) => ({ ...l, id: `${id}-standing-${i}` }))]));
  return { cases, patients, er, opd, asks, insurance, discharges, visitOrders, visitNotes, visitChartNotes, restraints: cases.flatMap((c) => c.restraints), surgeries: cases.flatMap((c) => c.surgeries), directives: cases.flatMap((c) => c.directives), diagnoses: Object.fromEntries(cases.map((c) => [c.patient.id, c.diagnoses])), diets: cases.flatMap((c) => c.diets), beds: cases.filter((c) => c.stage !== "救急").map((c) => ({ room: c.patient.room, bed: c.bed, patientId: c.patient.id })), discharged: Object.fromEntries(patients.flatMap((p) => p.dischargedAt ? [[p.id, p.dischargedAt]] : [])), standing, standingLines, ...admissionState(cases) };
}
export const SCENARIOS = generateScenarios();
