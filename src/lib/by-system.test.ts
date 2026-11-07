import { describe, expect, it } from "vitest";
import { BY_SYSTEMS, bySystemCaret, bySystemFacts, bySystemText, isBySystemLine, type BySystemInput } from "./by-system";
import { emptyIcuRecords } from "./icu/types";
import type { OrderEntry, Patient } from "./types";

const today = { y: 2026, m: 11, d: 7 };

const ward: Patient = {
  id: "bys-ward", name: "架空 病棟", kana: "カクウ", sex: "女", age: 80, ward: "5階東病棟", room: "506", department: "内科", attending: "架空医師",
  admittedOn: -5, admissionDiagnosis: "架空", heightCm: 150, weightKg: 50, allergies: [], infections: [], cautions: [], cultures: [], imaging: [],
  dietNow: "全粥・常菜・禁止：生もの",
  vitals: [
    { day: -1, time: "18:00", bt: 38.2, hr: 100, sbp: 100, dbp: 60, spo2: 93, o2: "鼻カニュラ 2L" },
    { day: 0, time: "10:00", bt: 36.9, hr: 78, sbp: 127, dbp: 79, spo2: 97, o2: "室内気" },
    { day: 0, time: "23:00", bt: 39, hr: 120 },
  ],
  labs: [
    { day: -3, time: "06:00", values: { "PT-INR": 1.1, WBC: 15000 } },
    { day: 0, time: "06:00", values: { WBC: 11800, CRP: 4.6, Hb: 9.8, Plt: 22.4, Cre: 0.76, Na: 140, K: 4.2, "T-Bil": 0.8, Glu: 142 } },
  ],
  daily: [{ day: -2, urineMl: 1200 }, { day: -1, urineMl: 1500 }, { day: 0, urineMl: 600 }],
  history: [],
};

const abx = (id: string, drugCode: string, start: number, extra: Partial<OrderEntry> = {}, replaces?: string): OrderEntry => ({
  kind: "order", id, day: start, time: "09:00", author: "架空医師", status: "有効",
  order: { type: "injection", items: [{ drugCode, amount: 1, unit: "g" }], route: "点滴静注", schedule: { kind: "per_day", count: 1 }, start: { day: start, time: "12:00" }, ...(replaces ? { replaces } : {}) },
  ...extra,
});

const wardInput = (orders: OrderEntry[] = []): BySystemInput => ({ patient: { ...ward, history: orders }, orders, today, now: "18:00" });

describe("/by system の行", () => {
  it("/by system・/bysystem・全角の ／ と文字・大文字に反応し、続きのある行には反応しない", () => {
    for (const l of ["/by system", "/bysystem", "／by system", "／ｂｙ　ｓｙｓｔｅｍ", "/By System", "  /BY SYSTEM "]) expect(isBySystemLine(l)).toBe(true);
    for (const l of ["by system", "/by system 呼吸", "/by", "/claude by system"]) expect(isBySystemLine(l)).toBe(false);
  });
});

describe("系統ごとの ＃ と ・ の行", () => {
  it("10 の系統を決まった順に、＃の行と字下げした・の行で並べる", () => {
    const lines = bySystemText(wardInput()).split("\n");
    expect(lines).toHaveLength(BY_SYSTEMS.length * 2);
    expect(lines.filter((l) => l.startsWith("＃ "))).toEqual(BY_SYSTEMS.map((s) => `＃ ${s}`));
    expect(lines.filter((_, i) => i % 2 === 1).every((l) => l.startsWith("  ・ "))).toBe(true);
    expect(lines.at(-2)).toBe("＃ その他（リハ・退院支援）");
    expect(lines.at(-1)).toBe("  ・ ");
  });
  it("病棟の患者：今の時刻までの最新の値と時刻・日を貼る（記録のない系統は空の・）", () => {
    const f = Object.fromEntries(bySystemFacts(wardInput()).map((x) => [x.system, x.fact]));
    expect(f["神経"]).toBe("");
    expect(f["呼吸"]).toBe("SpO2 97%・室内気（10:00）");
    expect(f["循環"]).toBe("BP 127/79・HR 78（10:00）");
    expect(f["腎・電解質"]).toBe("Cre 0.76・Na 140・K 4.2（06:00）、尿量 1,500 mL/日（11/6）");
    expect(f["消化器・栄養"]).toBe("全粥・常菜、T-Bil 0.8（06:00）");
    expect(f["感染"]).toBe("BT 36.9℃（10:00）、WBC 11,800↑・CRP 4.6↑（06:00）");
    expect(f["血液・凝固"]).toBe("Hb 9.8↓・Plt 22.4（06:00）、PT-INR 1.1（11/4 06:00）");
    expect(f["内分泌・代謝"]).toBe("血糖 142（06:00）");
    expect(f["皮膚・ライン"]).toBe("");
  });
  it("抗菌薬は今日有効なものを、置き換える前の開始日を1日目として数える", () => {
    const first = abx("a1", "INJ-CTRX1", -4, { status: "中止", stoppedOn: -2 });
    const next = abx("a2", "INJ-CTRX1", -2, {}, "a1");
    const done = abx("a3", "INJ-CEZ1", -6, { status: "終了" });
    const later = abx("a4", "INJ-VCM05", 1);
    const notAbx = abx("a5", "INJ-NS500", -1);
    const f = bySystemFacts({ ...wardInput([next, done, later, notAbx]), patient: { ...ward, history: [first, next, done, later, notAbx] } });
    expect(f.find((x) => x.system === "感染")!.fact).toBe("BT 36.9℃（10:00）、WBC 11,800↑・CRP 4.6↑（06:00）、CTRX 5日目");
  });
});

describe("ICU の患者", () => {
  const icuPatient: Patient = {
    ...ward, id: "bys-icu", ward: "ICU", room: "ICU1", sex: "男", dietNow: "絶食", daily: [{ day: -1, urineMl: 854 }],
    vitals: [{ day: 0, time: "17:00", bt: 37.6, hr: 91, sbp: 106, dbp: 59, spo2: 97, o2: "人工呼吸 FiO2 0.4", gcs: { e: 1, m: 4 } }],
    labs: [{ day: 0, time: "06:00", values: { Cre: 2.6, Na: 138, K: 4.2, Glu: 180 } }],
  };
  const records = () => {
    const r = emptyIcuRecords();
    r.vents = [
      { id: "v1", patientId: icuPatient.id, at: { day: -3, time: "00:00" }, by: "架空医師", mode: "A/C-PC", airway: "経口挿管", fio2: 0.6, peep: 8, pc: 14, rr: 18 },
      { id: "v2", patientId: icuPatient.id, at: { day: 0, time: "00:00" }, by: "架空医師", mode: "A/C-PC", airway: "経口挿管", fio2: 0.4, peep: 8, pc: 10, rr: 16 },
    ];
    r.infusions = [
      { id: "n", patientId: icuPatient.id, drugCode: "", name: "ノルアドレナリン注射液", amountMg: 5, volumeMl: 50, doseUnit: "γ", weightKg: 68, start: { day: -3, time: "00:00" }, by: "架空医師", changes: [{ at: { day: -3, time: "00:00" }, rateMlPerH: 8.16, by: "架空医師" }, { at: { day: 0, time: "06:00" }, rateMlPerH: 4.896, by: "架空医師" }] },
      { id: "vp", patientId: icuPatient.id, drugCode: "", name: "バソプレシン注射液", amountMg: 20, volumeMl: 50, doseUnit: "単位/h", weightKg: 68, start: { day: -3, time: "00:00" }, end: { day: -1, time: "00:00" }, by: "架空医師", changes: [{ at: { day: -3, time: "00:00" }, rateMlPerH: 3, by: "架空医師" }] },
      { id: "pr", patientId: icuPatient.id, drugCode: "", name: "プロポフォール", amountMg: 500, volumeMl: 50, doseUnit: "mg/h", weightKg: 68, start: { day: -3, time: "00:00" }, by: "架空医師", changes: [{ at: { day: -3, time: "00:00" }, rateMlPerH: 6, by: "架空医師" }] },
    ];
    r.lines = [
      { id: "l1", patientId: icuPatient.id, kind: "CVC", site: "右内頸", insertedAt: { day: -3, time: "00:00" }, by: "架空医師" },
      { id: "l2", patientId: icuPatient.id, kind: "動脈ライン", site: "左橈骨", insertedAt: { day: -3, time: "00:00" }, by: "架空医師" },
      { id: "l3", patientId: icuPatient.id, kind: "透析用カテーテル", site: "右大腿", insertedAt: { day: -2, time: "00:00" }, by: "架空医師" },
      { id: "l4", patientId: icuPatient.id, kind: "末梢静脈", site: "左前腕", insertedAt: { day: -3, time: "00:00" }, removedAt: { day: -1, time: "10:00" }, by: "架空医師" },
    ];
    r.hourly = [
      { id: "h1", patientId: icuPatient.id, at: { day: 0, time: "16:00" }, by: "架空看護師", rass: -1, glucose: 150 },
      { id: "h2", patientId: icuPatient.id, at: { day: 0, time: "19:00" }, by: "架空看護師", rass: -3, glucose: 90 },
      { id: "x", patientId: "other", at: { day: 0, time: "17:30" }, by: "架空看護師", rass: 2 },
    ];
    r.crrt = [{ id: "c", patientId: icuPatient.id, at: { day: -2, time: "10:00" }, by: "架空医師", mode: "CHDF", qb: 100, qd: 500, qf: 300, removalMlPerH: 50, anticoag: { drug: "ナファモスタット", ratePerH: 20, unit: "mg/h" }, access: "右大腿" }];
    return r;
  };
  const mepm = abx("m", "622419401", -3);
  const f = Object.fromEntries(bySystemFacts({ patient: { ...icuPatient, history: [mepm] }, orders: [mepm], icu: records(), today, now: "18:00" }).map((x) => [x.system, x.fact]));
  it("GCS と RASS、呼吸器の今の設定、今の昇圧薬の量を貼る", () => {
    expect(f["神経"]).toBe("GCS E1V—M4（17:00）、RASS -1（16:00）");
    expect(f["呼吸"]).toBe("SpO2 97%（17:00）、A/C-PC FiO2 0.4 PEEP 8 PC 10 RR 16");
    expect(f["循環"]).toBe("BP 106/59・HR 91（17:00）、NAd 0.12γ");
  });
  it("CRRT・抗菌薬の日数・ライン日数・血糖（新しいほう）を貼る", () => {
    expect(f["腎・電解質"]).toBe("Cre 2.6↑・Na 138・K 4.2（06:00）、尿量 854 mL/日（11/6）、CHDF");
    expect(f["消化器・栄養"]).toBe("絶食");
    const npo = bySystemFacts({ patient: { ...icuPatient, dietNow: undefined, daily: [{ day: -1, meals: [5, 5, 5] }, { day: 0, meals: "絶食" }], history: [] }, orders: [], today, now: "18:00" });
    expect(npo.find((x) => x.system === "消化器・栄養")!.fact).toBe("絶食（今日）");
    expect(f["感染"]).toBe("BT 37.6℃（17:00）、MEPM 4日目");
    expect(f["内分泌・代謝"]).toBe("血糖 150（16:00）");
    expect(f["皮膚・ライン"]).toBe("CVC・動脈ライン 4日目、透析用カテーテル 3日目");
  });
});

it("貼ったあとのカーソルは最初の・の行の終わり", () => {
  const t = "＃ 神経\n  ・ GCS E4V5M6（10:00）\n＃ 呼吸\n  ・ ";
  expect(t.slice(0, bySystemCaret(t))).toBe("＃ 神経\n  ・ GCS E4V5M6（10:00）");
});
