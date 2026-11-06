import { rxLastDay } from "../day-pattern";
import type { ClinicalProfile } from "./clinical-profiles";
import type { Patient, NoteEntry, Order } from "../types";
import type { Diagnosis } from "../diagnoses";
import { nurseFor } from "../ward";
import type { DietOrder } from "../diet";

export function prepareClinical(p: Patient, c: ClinicalProfile): Diagnosis[] {
  p.admissionDiagnosis = c.name;
  p.department = c.department;
  p.history = []; p.labs = []; p.cultures = []; p.imaging = []; p.vitals = []; p.daily = [];
  p.allergies = []; p.infections = []; p.cautions = []; p.contraindications = [];
  if (!/切迫早産/.test(c.name)) p.pregnancy = null;
  return [{ id: `${p.id}-main`, code: c.code, name: c.name, icd10: c.icd10, prefixes: [], suffixes: [], main: true, start: p.admittedOn, outcome: "継続" }];
}

const placement = [
  "家族の介助練習を行い、移動時の見守りを確認する", "退院先の受け入れ日を地域連携室と確認する", "自宅の段差とトイレまでの動線を家族に確認する", "退院後の通院手段と薬の受け取り方法を相談する", "病棟内での活動量を記録し退院先へ伝える", "服薬を本人管理に切り替えて飲み忘れの有無を確認する", "サービス担当者と退院日の支援体制を確認する",
];
const round = (n: number, digits = 1) => Number(n.toFixed(digits));

/** The daily chart, results and treatment orders share the same elapsed-day axis. */
export function addClinicalCourse(p: Patient, c: ClinicalProfile, end: number, i: number, destination: string, stage: string): DietOrder[] {
  const first = p.admittedOn;
  const last = p.dischargedAt?.day ?? end;
  const addNote = (day: number, role: NoteEntry["role"], body: Partial<NoteEntry>, time = "10:00") => p.history.push({ kind: "note", id: `${p.id}-course-${p.history.length}`, day, time, author: role === "医師" ? p.attending : role === "看護師" ? nurseFor(p.room) : role, role, ...body });
  const order = (after: number, value: Order) => {
    const day = first + after;
    if (day > last) return;
    p.history.push({ kind: "order", id: `${p.id}-course-${p.history.length}`, day, time: "09:30", author: p.attending, status: "有効", order: value });
  };
  const labOrder = (after: number, codes: string[]) => order(after, { type: "lab", codes, collect: { day: first + after, time: after === 0 ? "09:00" : "06:00" }, priority: after === 0 ? "至急" : "定時" });
  const injection = (after: number, code: string, amount: number, unit: string, count: number, days: number, route: "点滴静注" | "静注" = "点滴静注", dayPattern?: import("../types").DayPattern) => order(after, { type: "injection", items: [{ drugCode: code, amount, unit }], route, dayPattern, ...(dayPattern ? { doseTimes: ["12:00"] } : {}), schedule: { kind: "per_day", count }, start: { day: first + after, time: "12:00" }, days, end: { day: first + after + days - 1, time: "23:59" }, ...(route === "点滴静注" ? { minutesPerDose: 60 } : {}) });
  const oral = (after: number, code: string, amount: number, unit: string, days: number) => order(after, { type: "prescription", category: "定期", drugCode: code, amount, unit, timings: ["朝"], start: { day: first + after, timing: "朝" }, days });

  // Workflow contributes event notes (surgery, ICU, TDM), while this module supplies daily SOAP.
  p.history = p.history.filter((e) => e.kind !== "note" || !e.id?.includes("-weekly-"));
  const initial = { WBC: 7200, Hb: p.sex === "女" ? 12.1 : 13.3, Plt: 22.4, CRP: 0.3, AST: 24, ALT: 21, BUN: 19, Cre: 0.85, Na: 138, K: 4.1, Alb: 3.6, ...c.initial };
  if (p.age >= 18) { initial.Hb = round(initial.Hb + (i % 5 - 2) * 0.2); initial.WBC += (i % 7 - 3) * 100; }
  const renalInterval = [35, 55, 75].includes(i) && c.name === "急性腎盂腎炎";
  if (renalInterval) { initial.Cre = 3.8; initial.BUN = 48; }
  const recovered = { ...initial, ...c.recovered, ...(renalInterval ? { Cre: 2.6, BUN: 35 } : {}) };
  const duration = last - first;
  const samples = new Set([0, ...[1, 3, 7].filter((d) => d <= duration), duration]);
  for (let after = 14; after <= duration; after += 7) samples.add(after);
  for (const after of [...samples].sort((a, b) => a - b)) {
    const progress = Math.min(1, after / 7);
    const values = Object.fromEntries(Object.entries(initial).map(([key, value]) => [key, round(value + ((recovered as Record<string, number>)[key] - value) * progress, key === "Cre" ? 2 : key === "WBC" ? 0 : 1)]));
    // Perioperative inflammation peaks after surgery, rather than vanishing on the operation day.
    if (i === 17 && after >= 2 && after <= 4) { values.CRP = after === 3 ? 5.2 : 3.1; values.Hb = 10.1; }
    p.labs.push({ day: first + after, time: after === 0 ? "09:15" : "06:00", values });
    labOrder(after, [after === 0 ? "SET-ADMIT" : "SET-ROUTINE", ...("BNP" in initial ? ["LAB-BNP"] : []), ...("HbA1c" in initial && after === 0 ? ["LAB-HBA1C"] : []), ...("Lac" in initial ? ["LAB-LAC"] : [])]);
  }
  if (i === 6 && duration >= 4) {
    p.cultures.push({ collectedOn: first + 3, reportedOn: first + 4, specimen: "血液", sets: "2セット", status: "中間報告", organism: "発育なし（24時間）" });
    labOrder(3, ["LAB-BCX"]);
    if (duration >= 8) p.cultures.push({ collectedOn: first + 3, reportedOn: first + 8, specimen: "血液", sets: "2セット", status: "最終報告", organism: "発育なし（5日間）" });
  }
  if (i === 11) labOrder(0, ["LAB-CDIFF"]);
  if (i === 12 || i === 15) {
    p.labs.push({ day: first, time: "09:00", values: i === 12 ? { pH: 7.32, PaO2: 58, PaCO2: 44, HCO3: 22 } : { pH: 7.35, PaO2: 61, PaCO2: 52, HCO3: 28 } });
    labOrder(0, ["LAB-BGA"]);
    if (duration >= 3) { p.labs.push({ day: first + 3, time: "09:00", values: { pH: 7.4, PaO2: 80, PaCO2: i === 15 ? 46 : 40, HCO3: i === 15 ? 28 : 24 } }); labOrder(3, ["LAB-BGA"]); }
  }
  if (i === 6 && duration >= 3) p.labs.push({ day: first + 3, time: "11:30", values: { VCM: 14.2, Cre: 0.98 } });
  if (i === 6 && duration >= 6) { p.labs.push({ day: first + 6, time: "11:30", values: { VCM: 14.6, Cre: 0.9 } }); labOrder(6, ["LAB-VCM", "LAB-CRE"]); }
  if (c.image) p.imaging.push({ id: `${p.id}-admission-image`, day: first, modality: c.image[0], region: c.image[1], report: c.image[2], reader: "放射線科担当医" });
  const infection = !!c.antibiotic || i === 6 || i === 7;
  for (let day = first; day <= last; day++) {
    const after = day - first;
    const progress = Math.min(1, after / 7);
    const phase = after < 2 ? 0 : after < 4 ? 1 : 2;
    const pediatric = p.age < 6;
    const unstable = infection && after < 2;
    const vital = { day, time: after === 0 ? "08:45" : "06:00", bt: round((infection ? 38.7 : 36.8) - (infection ? 2 : 0.1) * progress), hr: pediatric ? p.age === 0 ? 132 : 104 - Math.round(12 * progress) : i === 33 ? 132 - Math.round(52 * progress) :  (unstable ? 108 : 84) - Math.round(8 * progress) + (i + after) % 5, sbp: pediatric ? p.age === 0 ? 68 : 102 : i === 34 ? 168 - Math.round(38 * progress) : unstable ? 102 : 124, dbp: pediatric ? p.age === 0 ? 40 : 62 : 72, rr: pediatric ? p.age === 0 ? 42 : 28 - Math.round(8 * progress) : 22 - Math.round(6 * progress), spo2: /喘息|肺炎|呼吸不全|閉塞性|心不全/.test(c.name) ? 94 + Math.round(3 * progress) : 98, o2: /肺炎|心不全/.test(c.name) && after < 3 ? "鼻カニュラ 2L/分" : "室内気" };
    if (i === 12) { vital.o2 = after <= 3 ? "人工呼吸器 FiO2 0.4" : after < 5 ? "鼻カニュラ 2L/分" : "室内気"; vital.spo2 = 96; }
    if (i === 15 && after < 3) { vital.o2 = "鼻カニュラ 1L/分"; vital.spo2 = 91; }
    if (i === 28 && day === last) { vital.bt = 36.2; vital.hr = 108; vital.sbp = 82; vital.dbp = 48; vital.rr = 12; vital.spo2 = 90; }
    p.vitals.push(vital);
    p.daily.push({ day, meals: /イレウス|膵炎|胃潰瘍|憩室出血/.test(c.name) && after < 2 ? "絶食" : i === 12 && after < 4 ? "絶食" : [phase === 0 ? 3 : 8, phase === 0 ? 4 : 8, phase === 0 ? 4 : 9], urineMl: p.age === 0 ? 210 : p.age === 5 ? 650 : i === 14 ? 350 : after < 2 ? 1000 : 1500, stools: i === 11 ? after < 2 ? 8 : after < 4 ? 4 : 1 : 1, weightKg: round(p.weightKg - (/心不全|肝硬変/.test(c.name) ? 2.8 * progress : 0)) });
    const sample = p.labs.filter((l) => l.day <= day && l.values.CRP !== undefined).sort((a, b) => b.day - a.day)[0];
    const numbers = `体温${vital.bt}℃、脈拍${vital.hr}/分、血圧${vital.sbp}/${vital.dbp}mmHg、呼吸数${vital.rr}/分、SpO2 ${vital.spo2}%（${vital.o2}）、体重${p.daily.at(-1)!.weightKg}kg。`;
    const labs = `採血（入院${sample.day - first + 1}日目）：WBC ${sample.values.WBC}/μL、Hb ${sample.values.Hb}g/dL、CRP ${sample.values.CRP}mg/dL、Cre ${sample.values.Cre}mg/dL、Na ${sample.values.Na}、K ${sample.values.K}mEq/L。`;
    addNote(day, "医師", after === 0 ? { text: `${stage === "救急" ? "救急初療記録" : "入院時記録"}\n${p.age}歳${p.sex}、身長${p.heightCm}cm、体重${p.weightKg}kg。\n主訴：${c.complaint}。現病歴：${c.onset}。既往歴：${c.past}。内服：${c.medication}。アレルギー：申告なし。\n身体所見：${numbers}${c.findings[0]}。\n検査：${labs}${c.image ? `画像：${c.image[2]}。` : ""}\n評価：${c.assessment[0]}。計画：${c.plan[0]}。` } : { soap: { s: `入院${after + 1}日目の本人${p.age < 18 ? "・保護者" : ""}の訴え：「${c.symptoms[phase]}」。`, o: `${numbers}${c.findings[phase]}。${labs}`, a: `${c.assessment[phase]}。${after >= 14 ? `医学的な急性期治療を終え、療養環境を調整中（調整${after - 6}日目）。` : `前日からの観察を含め入院${after + 1}日目として評価。`}`, p: after >= 14 ? `${placement[(after + i) % placement.length]}。${c.name}の再増悪徴候がないか確認する。` : `${c.plan[phase]}。次の勤務で${c.complaint}の変化を申し送る。` } });
    if (after === 0 || after === 2 || day === last) addNote(day, "看護師", { focus: [{ title: c.complaint, d: `入院${after + 1}日目：${c.symptoms[phase]}。${numbers}${c.findings[phase]}。体重${p.daily.at(-1)!.weightKg}kg、尿量${p.daily.at(-1)!.urineMl}mL/日。`, act: p.age < 18 ? "保護者と症状を確認し安楽な体位と水分摂取を支援。" : `${c.plan[phase]}。指示と本人の理解を確認してケアを実施。`, r: `${c.symptoms[phase]}と話す。${phase === 0 ? "ナースコールの使用を確認した" : "ケア後の状態を担当看護師へ共有した"}。` }] }, "14:00");
  }
  if (duration >= 2 && p.age > 0) addNote(first + 2, "管理栄養士", { text: `栄養評価：${c.name}、${p.age}歳、体重${p.weightKg}kg。${c.symptoms[1]}との訴え。${/イレウス|膵炎|胃潰瘍|憩室出血/.test(c.name) ? "絶食解除後、腹痛と摂取量を見て食上げを調整" : i === 12 ? "経管栄養の注入量と耐容性を確認、抜管後は嚥下評価を待つ" : /心不全|腎不全|肝硬変/.test(c.name) ? "塩分と水分、摂取量を主治医・看護師と共有" : "食事の好みと摂取量を確認し少量ずつの摂取を支援"}。3日後に再評価。` });
  if (duration >= 5) addNote(first + 5, "MSW", { text: `${p.age}歳、${c.name}。${["日中の家族の付き添いを希望", "自宅での生活再開を希望", "通院の送迎について相談希望", "退院後の服薬支援について相談希望", "食事の準備について相談希望"][i % 5]}。急性期経過を病棟と共有。本人・${p.age < 18 ? "保護者" : "家族"}と${destination === "死亡退院" ? "面会と療養の希望" : `退院先候補（${destination}）、介助量と通院手段`}を相談。${/脳梗塞|骨折|脳出血/.test(c.name) ? "療法士の移乗評価を添えて受け入れ先へ照会" : "家族の支援可能な曜日を確認"}。` });

  if (c.antibiotic) {
    if (duration >= 1) addNote(first + 1, "薬剤師", { text: `${p.age}歳、${c.name}の抗菌薬監査。体重${p.weightKg}kg、入院時Cre${initial.Cre}mg/dL。${c.antibiotic}の投与履歴を照合。アレルギー申告なし。${c.name === "急性腎盂腎炎" ? "尿培養の感受性報告後に狭域化を確認する" : "局所所見とCRPの変化を踏まえ治療終了日を医師と確認する"}。` });
    p.cultures.push({ collectedOn: first, specimen: "血液", sets: "2セット", ...(duration >= 5 ? { reportedOn: first + 5, status: "最終報告" as const, organism: "発育なし（5日間）" } : { status: "培養中" as const }) });
    const changed = c.name === "急性腎盂腎炎" && duration >= 2;
    injection(0, c.antibiotic, c.antibiotic === "INJ-SBTABPC3" ? 3 : c.antibiotic === "INJ-CTRX1" ? 2 : 1, "g", c.antibiotic === "INJ-SBTABPC3" ? 3 : c.antibiotic === "INJ-CTRX1" ? 1 : 3, changed ? 2 : 7);
    if (changed) injection(2, "INJ-CEZ1", 1, "g", renalInterval ? 1 : 3, 5, "点滴静注", renalInterval ? { kind: "every", n: 2 } : undefined);
    if (changed && renalInterval) addNote(first + 2, "医師", { text: "腎機能低下あり。感受性を確認してCEZに変更、隔日12時の指示。投与履歴・腎機能を再確認する。" });
    const specimen = c.name === "急性腎盂腎炎" ? "尿" : /肺炎|呼吸不全/.test(c.name) ? "喀痰" : "血液";
    const organism = specimen === "尿" ? "Escherichia coli" : specimen === "喀痰" ? "口腔内常在菌" : "発育なし";
    if (specimen !== "血液") p.cultures.push({ collectedOn: first, ...(duration >= 2 ? { reportedOn: first + 2, status: "最終報告" as const, organism, ...(specimen === "尿" ? { susceptibility: [{ drug: "CEZ", mic: "1", result: "S" as const }, { drug: "CTRX", mic: "0.25", result: "S" as const }] } : {}) } : { status: "培養中" as const }), specimen });
    if (specimen !== "血液") labOrder(0, [specimen === "尿" ? "LAB-UCX" : "LAB-SPCX"]);
  }
  if (/肺炎|心不全/.test(c.name)) order(0, { type: "procedure", code: "PROC-O2", start: { day: first, time: "09:00" }, schedule: { kind: "continuous" }, days: 3, o2: { device: "鼻カニュラ", lpm: 2 } });
  if (i === 6) order(0, { type: "procedure", code: "PROC-WOUND", site: "右前腕膿瘍", start: { day: first, time: "13:00" }, schedule: { kind: "per_day", count: 1 }, days: 7, comment: "切開排膿後、洗浄と被覆" });
  if (/心不全/.test(c.name)) { injection(0, "INJ-FRS20", 20, "mg", 1, 3, "静注"); oral(3, "ORAL-FRS20", 1, "錠", Math.max(1, duration - 2)); }
  if (/膵炎|イレウス|腎障害|低ナトリウム|ディフィシル|敗血症/.test(c.name)) injection(0, "INJ-NS500", 500, "mL", i === 27 ? 1 : 2, 2);
  if (/骨折/.test(c.name)) {
    oral(0, "ORAL-APAP500", 1, "錠", 7);
    addNote(first, "医師", { text: "VTE予防：下肢の間欠的空気圧迫法と足関節運動。出血・下肢腫脹を毎日観察し、離床を進める。" });
  }
  if (/胃潰瘍/.test(c.name)) oral(0, "ORAL-ESOM20", 1, "カプセル", 28);
  if (i === 34) oral(0, "ORAL-AMLO5", 1, "錠", Math.max(14, duration + 1));
  if (i === 33) {
    oral(0, "ORAL-BISO25", 0.5, "錠", Math.max(14, duration + 1));
    order(1, { type: "prescription", category: "定期", drugCode: "ORAL-API25", amount: p.age >= 80 && p.weightKg <= 60 ? 1 : 2, unit: "錠", timings: ["朝", "夕"], start: { day: first + 1, timing: "朝" }, days: Math.max(14, duration), comment: "非弁膜症性心房細動。出血徴候と腎機能を観察" });
  }
  if (/肝硬変/.test(c.name)) { oral(0, "ORAL-SPL25", 1, "錠", Math.max(14, duration + 1)); oral(0, "ORAL-FRS20", 1, "錠", Math.max(7, duration + 1)); }
  if (i === 28) { order(0, { type: "prescription", category: "定期", drugCode: "ORAL-OXC5", amount: 1, unit: "錠", timings: ["朝", "夕"], start: { day: first, timing: "朝" }, days: duration + 1 }); oral(0, "ORAL-SENNA12", 1, "錠", duration + 1); }
  // Never expose a final culture result before its report day.
  p.cultures = p.cultures.map((r) => r.reportedOn !== undefined && r.reportedOn > last ? { collectedOn: r.collectedOn, specimen: r.specimen, sets: r.sets, status: "培養中" } : r);
  p.history = p.history.map((e) => {
    if (e.kind !== "order") return e;
    if (e.order.type === "lab") return { ...e, status: "実施済" };
    if (e.order.type === "injection" && e.order.end && e.order.end.day < last) return { ...e, status: "終了", stoppedOn: e.order.end.day };
    if (e.order.type === "prescription" && e.order.days && rxLastDay(e.order)! < last) return { ...e, status: "終了", stoppedOn: rxLastDay(e.order)! };
    return e;
  });
  const diets: DietOrder[] = [{ id: `${p.id}-diet`, patientId: p.id, from: { day: first, meal: "夕" }, kind: /イレウス|膵炎|胃潰瘍|憩室出血|呼吸不全/.test(c.name) ? "絶食" : "常食", by: p.attending, at: { day: first, time: "10:00" } }];
  if (duration >= 2 && /イレウス|膵炎|胃潰瘍|憩室出血/.test(c.name)) diets.push({ ...diets[0], id: `${p.id}-diet-restart`, from: { day: first + 2, meal: "昼" }, kind: "常食", staple: "全粥", at: { day: first + 2, time: "10:00" } });
  if (/心不全|肝硬変|腎不全/.test(c.name)) { diets[0].kind = "治療食"; diets[0].therapeutic = /腎不全/.test(c.name) ? "TD-KIDNEY" : /肝硬変/.test(c.name) ? "TD-LIVER" : "TD-SALT-HEART"; diets[0].saltG = 6; }
  if (c.name === "誤嚥性肺炎") { diets[0].kind = "嚥下調整食"; diets[0].dysphagia = "2-1"; }
  p.labs.sort((a, b) => a.day - b.day || a.time.localeCompare(b.time));
  return diets;
}
