import { REGIMENS, planRegimen, regimenDrafts } from "../regimen";
import type { Diagnosis } from "../diagnoses";
import type { Patient, Order, NoteEntry } from "../types";
import type { Restraint } from "../restraint";
import type { Surgery } from "../surgery";
import type { AdvanceDirective } from "../directives";
import { emptyItems } from "../directives";

/** Authored test events. No treatment choices are derived for a real patient. */
export function addWorkflow(p: Patient, diagnoses: Diagnosis[], end: number, i: number) {
  const name = p.admissionDiagnosis;
  const day = (after: number) => Math.min(p.admittedOn + after, end);
  const note = (after: number, role: NoteEntry["role"], text: string) => p.admittedOn + after <= end && p.history.push({ kind: "note", id: `${p.id}-workflow-${p.history.length}`, day: day(after), time: "11:00", role, author: role === "医師" ? p.attending : role, text });
  const order = (after: number, o: Order) => p.admittedOn + after <= end && p.history.push({ kind: "order", id: `${p.id}-workflow-${p.history.length}`, day: day(after), time: "11:10", author: p.attending, status: "有効", order: o });
  const surgery = /骨折|ヘルニア|胆のう|大腸癌|胃癌|変形性/.test(name) && (!/癌/.test(name) || i % 2 === 1);
  const rehab = /骨折|脳梗塞|脳塞栓|パーキンソン/.test(name);
  const infection = /肺炎|腎盂腎炎|菌|敗血症|蜂巣炎/.test(name);
  const restraints: Restraint[] = [];
  const surgeries: Surgery[] = [];
  const directives: AdvanceDirective[] = [];

  if (rehab) {
    order(1, { type: "procedure", code: "PROC-REHAB", start: { day: day(1), time: "11:10" }, schedule: { kind: "per_day", count: 1 }, rehab: { field: /骨折/.test(name) ? "運動器" : "脳血管疾患等", therapists: ["PT", "OT", "ST"], onset: p.admittedOn, goal: "移乗と歩行の介助量を減らし、退院先で生活する", cautions: "主治医の離床・荷重指示と嚥下評価を確認" } });
    note(2, "療法士", "PT：端座位・移乗練習。OT：更衣とトイレ動作の介助量を確認。ST：嚥下評価、食形態を看護師・管理栄養士と共有。");
    note(5, "療法士", "退院前申し送り：移乗は見守り、歩行器使用。荷重制限は整形外科の指示書を添付。受け入れ先へ訓練内容と嚥下評価を連絡。");
  }
  if (surgery && p.admittedOn + 2 <= end) {
    note(0, "医師", "手術説明と同意を確認。麻酔科に依頼。術前検査と絶食を指示。");
    note(2, "医師", `${name}の手術を実施。出血・創部と疼痛を観察し、術後の離床を段階的に進める。`);
    surgeries.push({ id: `${p.id}-surgery`, patientId: p.id, name: p.name, age: p.age, sex: p.sex, ward: p.ward, department: p.department, day: day(2), room: "手術室1", start: "09:00", minutes: 90, procedure: /骨折/.test(name) ? "骨折観血的手術" : /ヘルニア/.test(name) ? "ヘルニア手術" : /胆のう/.test(name) ? "胆嚢摘出術" : /変形性/.test(name) ? "人工関節置換術" : "悪性腫瘍手術", site: /骨折|変形性/.test(name) ? "下肢" : "腹部", side: "なし", position: "仰臥位", anesthesia: "全身麻酔", laparoscopic: false, kind: "予定", blood: "血液型・不規則抗体", after: "病棟", anesthesiaConsult: true, infections: p.infections, allergies: p.allergies, status: "退室", requestedAt: p.admittedOn * 1440 + 600, surgeon: p.attending });
  }
  if (infection && p.age >= 18) {
    order(0, { type: "lab", codes: ["LAB-BCX"], collect: { day: day(0), time: "11:30" }, priority: "至急", comment: "抗菌薬投与前に2セット" });
    note(1, "薬剤師", "持参薬・アレルギーを照合。抗菌薬の投与時刻と腎機能を確認し、疑義照会の要否を確認。");
    if (/ＭＲＳＡ/.test(name)) {
      p.infections = ["MRSA"];
      p.cultures.push({ collectedOn: p.admittedOn, reportedOn: day(2), specimen: "血液", status: "最終報告", organism: "MRSA", susceptibility: [{ drug: "VCM", mic: "1", result: "S" }, { drug: "CEZ", mic: ">8", result: "R" }] });
      order(0, { type: "injection", items: [{ drugCode: "INJ-CEZ1", amount: 1, unit: "g" }], route: "点滴静注", schedule: { kind: "per_day", count: 3 }, start: { day: day(0), time: "12:00" }, end: { day: day(2), time: "11:00" }, days: 2 });
      order(2, { type: "injection", items: [{ drugCode: "INJ-VCM05", amount: 0.5, unit: "g" }, { drugCode: "INJ-NS100", amount: 100, unit: "mL" }], route: "点滴静注", schedule: { kind: "per_day", count: 2 }, start: { day: day(2), time: "12:00" }, minutesPerDose: 60, days: 7 });
      note(2, "医師", "血液培養でMRSA。CEZを中止しVCMへ変更。腎機能・血中濃度の測定計画を薬剤師と確認。");
      order(3, { type: "lab", codes: ["LAB-VCM"], collect: { day: day(3), time: "11:30" }, priority: "定時" });
      note(3, "薬剤師", "抗MRSA薬TDM：採血時刻・投与履歴を照合。測定値と腎機能を医師に報告、投与量は医師が確定。");
    } else if (/ＥＳＢＬ/.test(name)) {
      p.infections = ["ESBL"];
      p.cultures.push({ collectedOn: p.admittedOn, reportedOn: day(2), specimen: "尿", status: "最終報告", organism: "Escherichia coli（ESBL産生）", susceptibility: [{ drug: "CTRX", mic: ">4", result: "R" }, { drug: "MEPM", mic: "0.25", result: "S" }] });
      note(2, "医師", "尿培養でESBL産生菌。感受性結果を確認し抗菌薬の変更を記録。接触予防策を継続。");
    } else note(2, "医師", "培養の中間報告と炎症反応を確認。発熱・呼吸状態が改善し、継続期間を再評価。");
    note(3, "看護師", "解熱傾向。食事摂取と離床が進み、点滴ルート・皮膚状態を確認。");
  }
  if (/糖尿病/.test(name)) {
    order(0, { type: "injection", items: [{ drugCode: "DEMO-INS-HUMAN", amount: 1, unit: "単位" }], route: "皮下注", schedule: { kind: "per_day", count: 3 }, start: { day: p.admittedOn, time: "11:30" }, sliding: { times: ["07:00", "11:30", "17:30"], rows: [{ from: 0, to: 199, units: 0 }, { from: 200, to: 249, units: 2 }, { from: 250, to: null, units: 4 }], callAbove: 300 } });
    note(1, "管理栄養士", "食事摂取量・生活背景を確認。食事療法と低血糖時の対応について本人に説明。");
  }
  if (/認知症|脳梗塞|脳塞栓/.test(name) && p.admittedOn < end - 3) {
    const start = { day: day(1), time: "21:00" };
    const finish = { day: day(3), time: "10:00" };
    restraints.push({ id: `${p.id}-restraint`, patientId: p.id, devices: ["ミトン"], why: "点滴自己抜去を繰り返し出血の危険。医師と看護師で確認", state: "夜間せん妄、説明の保持が困難", met: { 切迫性: "抜去で出血の危険", 非代替性: "付き添いと環境調整で回避できず", 一時性: "各勤務で解除を検討" }, tried: "声かけ・家族の付き添い・点滴位置の変更", start, doctor: p.attending, confirmedBy: "看護師 佐藤", family: "家族に説明", reviews: [{ at: finish, by: "看護師 佐藤", decision: "やめる", note: "見当識改善、抜去行動なし" }], end: { at: finish, by: p.attending, note: "解除を確認" } });
    note(1, "看護師", "夜間せん妄、点滴自己抜去の危険。環境調整・付き添いを試行後、医師の指示で一時的な身体的抑制を開始。");
    note(3, "医師", "せん妄が改善し、身体的抑制を解除。転倒予防は環境調整で継続。");
  }
  if (p.age >= 85 || /末期癌/.test(name)) {
    directives.push({ id: `${p.id}-directive`, patientId: p.id, cpr: i % 2 ? "行わない（DNAR）" : "行う", items: emptyItems(), discussedWith: "本人・家族", decidedAt: { day: p.admittedOn, time: "15:00" }, by: p.attending, status: "有効", note: "心肺蘇生以外の治療は項目ごとに別途相談" });
    note(0, "医師", "本人・家族と事前指示を確認。心肺蘇生の希望を掲示に記録。その他の治療はそれぞれ相談。");
  }
  if (/腎不全/.test(name)) {
    order(0, { type: "procedure", code: "PROC-HD", start: { day: p.admittedOn, time: "13:00" }, schedule: { kind: "every_days", days: 2 }, hd: { purpose: "維持", method: "HD", minutes: 240, qb: 180, membrane: 1.5, anticoag: { drug: "ヘパリン", initial: 1000, hourly: 500 }, uf: 1.5, dw: p.weightKg, access: "左前腕内シャント" } });
    note(1, "看護師", "透析室へ申し送り。シャント・透析条件・体重・除水量を照合し、帰棟時の血圧と止血を確認。");
  }
  if (/癌/.test(name) && !surgery && i !== 18 && !/末期/.test(name)) {
    order(0, { type: "injection", items: [{ drugCode: "INJ-DEX66", amount: 6.6, unit: "mg" }], route: "静注", schedule: { kind: "once" }, start: { day: p.admittedOn, time: "09:00" }, days: 1 });
    note(0, "薬剤師", "化学療法の予定入院。レジメン・前投薬・投与順序を照合。抗がん薬は医師の確定待ち。");
    note(2, "医師", "予定化学療法の投与前評価と説明・同意を確認。副作用の観察と外来での採血日を調整。");
  }
  if (i === 18) {
    // This fixture explicitly chooses the existing registered regimen and reductions.
    const plan = planRegimen(REGIMENS[0], 1, { ...p, cre: 0.9 }, { PTX: 0, CBDCA: 0 });
    let seq = 0;
    for (const d of regimenDrafts(plan, { course: 1, start: { day: p.admittedOn, time: "09:00" }, newId: () => `${p.id}-chemo-${++seq}` })) {
      p.history.push({ kind: "order", id: d.id, day: p.admittedOn, time: "09:00", author: p.attending, status: "実施済", order: { type: "injection", items: d.items.map((v) => ({ drugCode: v.drugCode!, amount: v.amount!, unit: v.unit! })), route: d.route!, schedule: { kind: "once" }, start: { day: d.start.day ?? p.admittedOn, time: d.start.time ?? "09:00" }, days: 1, ...(d.infusionMinutes ? { minutesPerDose: d.infusionMinutes } : {}) } });
    }
    note(1, "看護師", "化学療法後の悪心・食事摂取・点滴部位を観察。次回外来の採血日と連絡方法を確認。");
  }
  if (i === 31) {
    order(0, { type: "procedure", code: "PROC-LEAVE", start: { day: 0, time: "15:00" }, schedule: { kind: "once" }, leave: { kind: "外泊", from: { day: 0, time: "15:00" }, back: { day: 1, time: "12:00" }, destination: "自宅", note: "家族付き添い。服薬と連絡先を確認" } });
  }
  if (i === 32) {
    order(0, { type: "procedure", code: "PROC-LEAVE", start: { day: 2, time: "10:00" }, schedule: { kind: "once" }, leave: { kind: "退院", from: { day: 2, time: "10:00" }, destination: "自宅", note: "退院処方・サマリ・再診予約を準備" } });
  }
  if (i === 21) {
    note(1, "看護師", "夜間トイレ移動時に転倒。医師が診察、外傷と神経症状を確認。家族に説明し、見守りと動線を見直す。");
    note(3, "看護師", "仙骨部に表皮剥離を認めた。除圧と体位変換、皮膚保護を開始。褥瘡担当へ連絡。");
    order(3, { type: "procedure", code: "PROC-ULCER", site: "仙骨部", area: "lt100", depth: "d2", start: { day: day(3), time: "11:10" }, schedule: { kind: "per_day", count: 1 } });
  }
  if (i === 12) {
    note(0, "医師", "救急初療中に呼吸状態が増悪。気管挿管・人工呼吸管理を開始しICUへ入室。呼吸器設定・鎮静の指示は指示簿に記載。");
    note(1, "看護師", "ICU：人工呼吸器装着中。呼吸器設定・気道内圧・吸引・体位変換・皮膚を確認。");
    note(3, "医師", "呼吸状態改善、自発呼吸を確認して抜管。経鼻酸素へ変更。");
    order(3, { type: "procedure", code: "PROC-O2", o2: { device: "鼻カニュラ", lpm: 2 }, start: { day: day(3), time: "11:10" }, schedule: { kind: "continuous" }, days: 2 });
    order(4, { type: "procedure", code: "PROC-MOVE", move: { kind: "転棟", to: { room: p.room, bed: "A" }, reason: "人工呼吸器離脱後、一般病棟へ" }, start: { day: day(4), time: "14:00" }, schedule: { kind: "once" } });
    note(4, "医師", "ICUを退室し一般病棟へ転棟。総合診療科へ転科、主治医と看護師に経過を申し送る。");
  }
  if (/ディフィシル/.test(name)) {
    p.infections = ["CD"];
    p.cultures.push({ collectedOn: p.admittedOn, reportedOn: day(1), specimen: "便", status: "最終報告", organism: "Clostridioides difficile（毒素陽性）" });
    note(1, "医師", "便毒素陽性、接触予防策。原因となった抗菌薬を見直し、下痢回数・摂取量・脱水を観察。");
  }
  for (let d = p.admittedOn + 7; d <= end; d += 7) {
    p.history.push({ kind: "note", id: `${p.id}-weekly-${d}`, day: d, time: "09:00", author: p.attending, role: "医師", soap: { s: "前回評価以後の生活状況を確認。", o: "検査・バイタル・食事摂取・離床状況を確認。", a: `${name}の経過を再評価。`, p: "継続指示と退院先の調整状況を確認。" } });
  }
  if (p.admittedOn < end) p.vitals.push({ day: end, time: "06:00", bt: 36.7, hr: 78, sbp: 118, dbp: 68, rr: 18, spo2: 97, o2: "室内気" });
  // Keep the primary diagnosis explicit even for source charts with multiple principal diagnoses.
  diagnoses.forEach((d, n) => { d.main = n === 0; });
  return { restraints, surgeries, directives };
}
