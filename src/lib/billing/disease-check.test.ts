import { withDiseaseRequest, visibleDiseaseStickies, diseaseRequestTodos } from "./disease-request";
import { describe, expect, it } from "vitest";
import { checkDiseases, DISEASE_RULES, DISEASE_CHECK_EXCLUSIONS, diseaseMasterCoverage, matchesDisease, type DiseaseCheckInput } from "./disease-check";
import type { Diagnosis } from "../diagnoses";
import type { OrderEntry } from "../types";
import { ijiCounts, ijiRows, INITIAL_DESK } from "./worklist";

export const diagnosis = (icd10 = "E119", extra: Partial<Diagnosis> = {}): Diagnosis => ({ id: "d", code: "1", name: "２型糖尿病", icd10, prefixes: [], suffixes: [], start: -10, outcome: "継続", main: false, ...extra });
export const rx = (drugCode = "ORAL-SITA50", extra: Partial<OrderEntry> = {}): OrderEntry => ({ kind: "order", id: "rx", day: -5, time: "08:00", author: "医師", status: "有効", order: { type: "prescription", drugCode, category: "定期", amount: 1, unit: "錠", timings: ["朝"], start: { day: -5 }, days: 10 }, ...extra });
const lab = (codes = ["LAB-HBA1C"], day = -1): OrderEntry => ({ kind: "order", id: "lab", day: -5, time: "08:00", author: "医師", status: "有効", order: { type: "lab", codes, collect: { day, time: "07:00" }, priority: "定時" } });
export const input: DiseaseCheckInput = { entries: [rx()], diagnoses: [], today: "2026-11-06", month: "2026-11", nowTime: "12:00", admittedOn: -5 };
const check = (patch: Partial<DiseaseCheckInput> = {}) => checkDiseases({ ...input, ...patch });

describe("病名漏れ候補のルール", () => {
  it("全採用品目を点検対象か対象外理由に棚卸しし、マスターの追加を見逃さない", () => {
    const coverage = diseaseMasterCoverage();
    expect(coverage.filter(c => !c.rules.length && !c.exclusion).map(c => c.code)).toEqual([]);
    expect(coverage.filter(c => c.rules.length && c.exclusion).map(c => c.code)).toEqual([]);
    expect(new Set(DISEASE_RULES.map(r => r.id)).size).toBe(DISEASE_RULES.length);
    for (const r of DISEASE_RULES) {
      expect(r.source).toMatch(/^https:\/\//);
      expect(r.codes.every(code => coverage.some(c => c.kind === r.kind && c.code === code))).toBe(true);
    }
    for (const e of DISEASE_CHECK_EXCLUSIONS) expect(e.codes.every(code => coverage.some(c => c.kind === e.kind && c.code === code))).toBe(true);
  });
  it("ICDの範囲・小数点・語の表記揺れを照合する", () => {
    expect(matchesDisease(diagnosis("E11.9"), { icd: ["E10-E14"] })).toBe(true);
    expect(matchesDisease(diagnosis("E15"), { icd: ["E10-E14"] })).toBe(false);
    expect(matchesDisease(diagnosis(undefined, { name: "２型糖尿病" }), { words: ["2型糖尿病"] })).toBe(true);
    expect(matchesDisease(diagnosis("", { name: "別の病名" }), { icd: ["E10-E14"] })).toBe(false);
  });
  it("薬は確定病名が必要。品目ごとに月1候補へまとめる", () => {
    expect(check()).toHaveLength(1);
    expect(check()[0].days).toEqual([-5, -4, -3, -2, -1, 0]);
    expect(check()[0].text).toContain("病名漏れの候補");
    expect(check({ diagnoses: [diagnosis()] })).toEqual([]);
    expect(check({ diagnoses: [diagnosis("E119", { suffixes: [{ code: "8002", name: "の疑い" }] })] })).toHaveLength(1);
    expect(check({ diagnoses: [diagnosis("E119", { name: "糖尿病疑い" })] })).toHaveLength(1);
  });
  it("検査は疑い可。CRPは求めず、病名追加ですぐ消える", () => {
    const entries = [lab(["LAB-HBA1C", "LAB-CRP"])];
    expect(check({ entries })).toHaveLength(1);
    expect(check({ entries, diagnoses: [diagnosis("E119", { suffixes: [{ code: "8002", name: "の疑い" }] })] })).toEqual([]);
  });
  it("開始・転帰の当日を含め、投与日に有効な病名だけで覆う", () => {
    expect(check({ diagnoses: [diagnosis("E119", { start: -2 })] })[0].days).toEqual([-5, -4, -3]);
    expect(check({ diagnoses: [diagnosis("E119", { outcome: "治癒", outcomeDay: -3 })] })[0].days).toEqual([-2, -1, 0]);
    expect(check({ entries: [lab()], diagnoses: [diagnosis("E119", { start: 0 })] })).toHaveLength(1);
    expect(check({ entries: [lab()], diagnoses: [diagnosis("E119", { start: -1, outcome: "中止", outcomeDay: -1 })] })).toEqual([]);
  });
  it.each([
    { notClaimable: true }, { auto: { from: "記事" as const, at: "now" } }, { effectiveTo: "2026-10" },
    { effectiveFrom: "2026-12" }, { outcome: "移行" as const }, { encounter: "外来" as const },
    { outcome: "治癒" as const },
  ])("保険病名として使えない病名を除く %j", patch => {
    expect(check({ diagnoses: [diagnosis("E119", patch)] })).toHaveLength(1);
  });
  it("過去月を選んでも当月の病名で埋めない", () => {
    const entries = [lab(["LAB-HBA1C"], -7)]; // 10月30日
    expect(check({ entries, month: "2026-10", admittedOn: -10 })).toHaveLength(1);
    expect(check({ entries, month: "2026-10", admittedOn: -10, diagnoses: [diagnosis("E119", { start: -6 })] })).toHaveLength(1);
    expect(check({ entries, month: "2026-10", admittedOn: -10, diagnoses: [diagnosis()] })).toEqual([]);
    expect(check({ entries })).toEqual([]);
  });
  it("未来・取消検査・入院前・退院後のオーダを除く", () => {
    expect(check({ entries: [lab(["LAB-HBA1C"], 1), { ...lab(), status: "中止" }] })).toEqual([]);
    expect(check({ entries: [lab()], dischargedOn: -2 })).toEqual([]);
    expect(check({ entries: [lab()], admittedOn: 0 })).toEqual([]);
    expect(check({ entries: [{ ...lab(), verbal: { takenBy: "看護師", doctor: "医師", at: { day: -1, time: "06:00" }, cancelled: { by: "医師", at: { day: -1, time: "06:00" }, reason: "取消" } } }] })).toEqual([]);
  });
  it("中止前の薬は残し、中止後・開始前の中止を除く", () => {
    expect(check({ entries: [rx(undefined, { status: "中止", stoppedOn: -3, stoppedTime: "09:00" })] })[0].days).toEqual([-5, -4, -3]);
    expect(check({ entries: [rx(undefined, { status: "中止", stoppedOn: -5, stoppedTime: "00:00" })] })).toEqual([]);
  });
  it("注射も判定し、未実施の投与だけを除く", () => {
    const e: OrderEntry = { ...rx(), id: "inj", order: { type: "injection", items: [{ drugCode: "DEMO-INS-ASPART", amount: 2, unit: "単位" }], route: "皮下注", start: { day: -1, time: "12:00" }, schedule: { kind: "once" } } };
    expect(check({ entries: [e] })[0].example).toBe("糖尿病");
    expect(check({ entries: [e], notGiven: ["inj|-720"] })).toEqual([]);
    expect(check({ entries: [{ ...e, status: "中止", stoppedOn: -1, stoppedTime: "11:59" }] })).toEqual([]);
    expect(check({ entries: [e], diagnoses: [diagnosis()] })).toEqual([]);
  });
  it("抗菌薬は確定感染症、心不全検査と甲状腺検査は疑いでも照合する", () => {
    expect(check({ entries: [rx("INJ-CEZ1")], diagnoses: [diagnosis("J189", { name: "肺炎" })] })).toEqual([]);
    expect(check({ entries: [lab(["LAB-BNP", "LAB-NTBNP", "LAB-TSH", "LAB-FT4"])], diagnoses: [diagnosis("I509", { name: "心不全", suffixes: [{ code: "8002", name: "疑い" }] }), diagnosis("E039", { name: "甲状腺機能低下症" })] })).toEqual([]);
  });
  it("腫瘍マーカーの良性適応とPSAの部位を考慮する", () => {
    expect(check({ entries: [lab(["LAB-AFP", "LAB-PIVKA"])], diagnoses: [diagnosis("K746", { name: "肝硬変" })] })).toEqual([]);
    expect(check({ entries: [lab(["LAB-CA125"])], diagnoses: [diagnosis("N80", { name: "子宮内膜症" })] })).toEqual([]);
    expect(check({ entries: [lab(["LAB-PSA"])], diagnoses: [diagnosis("C349", { name: "肺癌" })] })).toHaveLength(1);
    expect(check({ entries: [lab(["LAB-PSA"])], diagnoses: [diagnosis("C61", { name: "前立腺癌", suffixes: [{ code: "8002", name: "疑い" }] })] })).toEqual([]);
  });
  it("PPIは潰瘍既往とNSAIDsの両方で再発予防を照合する", () => {
    const ppi = rx("ORAL-LPZ15");
    const healed = diagnosis("K259", { name: "胃潰瘍", outcome: "治癒", outcomeDay: -6 });
    expect(check({ entries: [ppi], diagnoses: [healed] })).toHaveLength(1);
    expect(check({ entries: [ppi, rx("ORAL-LOX60")], diagnoses: [] })).toHaveLength(1);
    expect(check({ entries: [ppi, rx("ORAL-LOX60")], diagnoses: [healed] })).toEqual([]);
  });
  it("抗凝固薬をヘパリンロックへ広げず、心房細動で照合する", () => {
    expect(check({ entries: [rx("INJ-HEPLOCK10")] })).toEqual([]);
    expect(check({ entries: [rx("ORAL-API25")] })).toHaveLength(1);
    expect(check({ entries: [rx("ORAL-API25")], diagnoses: [diagnosis("I489", { name: "心房細動" })] })).toEqual([]);
  });
  it("仕事の札は候補件数で数え、病名追加後は一覧も消える", () => {
    const candidates = check({ entries: [rx(), lab()] });
    const rows = ijiRows([{ id: "p" }], INITIAL_DESK, {}, {}, { p: candidates });
    expect(rows[0].diseaseCandidates).toHaveLength(2);
    expect(rows[0].todo).toContain("病名漏れの候補");
    expect(ijiCounts(rows).病名漏れの候補).toBe(2);
    const fixed = check({ entries: [rx(), lab()], diagnoses: [diagnosis()] });
    expect(ijiCounts(ijiRows([{ id: "p" }], INITIAL_DESK, {}, {}, { p: fixed })).病名漏れの候補).toBe(0);
  });
});

describe("主治医への病名追加依頼", () => {
  it("共有付箋に1件保存し、主治医だけのやることから病名画面へ移る", () => {
    const c = check()[0];
    const stickies = withDiseaseRequest([], c, "主治医", "医事課", "12:00", input.today);
    expect(stickies[0].shared).toBe(true);
    expect(stickies[0].diseaseRequest?.to).toBe("主治医");
    expect(withDiseaseRequest(stickies, c, "主治医", "医事課", "12:01", input.today)).toBe(stickies);
    const patients = [{ id: "p", name: "患者", attending: "主治医" }];
    let opened = "";
    const todos = diseaseRequestTodos(patients, { p: stickies }, "主治医", () => input, id => { opened = id; });
    expect(todos).toHaveLength(1);
    todos[0].go();
    expect(opened).toBe("p");
    expect(diseaseRequestTodos(patients, { p: stickies }, "別の医師", () => input, () => {})).toEqual([]);
  });
  it("保存から復元した依頼も、医師の病名追加に応じて消える（元の付箋は保持）", () => {
    const c = check()[0];
    const saved = JSON.parse(JSON.stringify(withDiseaseRequest([], c, "主治医", "医事課", "12:00", input.today)));
    const ordinary = { id: "memo", text: "普通の付箋", by: "医師", at: "11:00", shared: true };
    const fixed = { ...input, diagnoses: [diagnosis()] };
    expect(visibleDiseaseStickies([...saved, ordinary], input)).toHaveLength(2);
    expect(visibleDiseaseStickies([...saved, ordinary], fixed)).toEqual([ordinary]);
    expect(diseaseRequestTodos([{ id: "p", name: "患者", attending: "主治医" }], { p: saved }, "主治医", () => fixed, () => {})).toEqual([]);
    expect(saved).toHaveLength(1);
  });
  it("依頼対象の過去月を再判定し、主治医交代時は引き継ぐ", () => {
    const historical = { ...input, entries: [lab(["LAB-HBA1C"], -7)], month: "2026-10", admittedOn: -10 };
    const c = checkDiseases(historical)[0];
    const saved = withDiseaseRequest([], c, "前の主治医", "医事課", "12:00", input.today);
    expect(diseaseRequestTodos([{ id: "p", name: "患者", attending: "新しい主治医" }], { p: saved }, "新しい主治医", () => historical, () => {})).toHaveLength(1);
  });
});
