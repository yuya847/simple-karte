import { describe, expect, it } from "vitest";
import { antibioticMonitoring, infectionRank, toggleSpecialistRow, activeOrders, appendRecord, dotFor, equipmentOf, infectionFlags, ohatTotal, oralFlags, antibioticsOf, type SpecialistRecord } from "./specialist";
import { can, STAFF, ROLES } from "./roles";
import { homeScreen, wardTabsFor } from "./nav";
import { specialistTileBlocks, SPECIALIST_READ_TOOLS } from "./specialist-tools";
import type { Patient, OrderEntry } from "./types";
import type { AdminRecord } from "./mar";
import { DRUGS } from "./master";
const patient = { id: "test", admissionDiagnosis: "誤嚥性肺炎", dietNow: "絶食", cultures: [] } as unknown as Patient;
const pump: OrderEntry = { kind: "order", id: "pump", day: -2, time: "09:00", author: "医師", status: "有効", order: { type: "injection", items: [], route: "末梢", schedule: { kind: "continuous" }, start: { day: -2 }, rateMlPerH: 20 } } as unknown as OrderEntry;
describe("専門職の切替と権限", () => {
  for (const [role, screen] of [["臨床工学技士", "equipment"], ["ICT", "infection"], ["歯科衛生士", "oral"]] as const) {
    it(`${role} の職種切替後の画面・記事・確定権限`, () => {
      expect(ROLES).toContain(role); expect(STAFF[role].name).toContain(role);
      expect(wardTabsFor(role)).toContain(screen); expect(homeScreen(role).wardTab).toBe(screen);
      expect(can(role, "note")).toBe(true); expect(can(role, `${screen}.record`)).toBe(true);
      expect(can(role, "order")).toBe(false); expect(can(role, "order.sign")).toBe(false); expect(can(role, "order.verbal")).toBe(false);
      expect(specialistTileBlocks(role).diet).toBeTruthy();
      for (const key of SPECIALIST_READ_TOOLS) expect(specialistTileBlocks(role)[key]).toBeUndefined();
    });
  }
  it("他職種は専用の記録を変更しない", () => {
    expect(can("医師", "equipment.record")).toBe(false); expect(can("ICT", "oral.record")).toBe(false);
  });
});
describe("記録と集計", () => {
  it("OHAT-J は未評価を0にせず、8項目0〜2だけを合算", () => {
    expect(ohatTotal([0,1,2,0,1,2,0,1])).toBe(7);
    for (const a of [[0], Array(8).fill(-1), Array(8).fill(3), Array(8).fill(0.5)]) expect(() => ohatTotal(a)).toThrow();
  });
  it("記録は日時・者・患者・各回の評価を保って追記・保存できる", () => {
    const r: SpecialistRecord = { id: "r", patientId: "test", screen: "oral", at: "2026-11-06T10:00", by: "歯科衛生士 森田", text: "ケア実施", scores: Array(8).fill(1) };
    const first = appendRecord([], r); const next = appendRecord(first, { ...r, id: "r2", scores: Array(8).fill(0) });
    expect(first).toHaveLength(1); expect(JSON.parse(JSON.stringify(next))).toEqual(next);
    expect(next.map(x => ohatTotal(x.scores!))).toEqual([8,0]); expect(() => appendRecord([], { ...r, text: " " })).toThrow();
  });
  it("機器は有効かつ今日の指示だけから拾う", () => {
    expect(equipmentOf([pump])[0].label).toContain("20");
    expect(equipmentOf([{ ...pump, status: "中止" }])).toEqual([]);
    if (pump.order.type !== "injection") throw Error();
    expect(activeOrders([{ ...pump, order: { ...pump.order, start: { day: 1 } } }])).toEqual([]);
    expect(activeOrders([{ ...pump, order: { ...pump.order, days: 1 } }])).toEqual([]);
  });
  it("透析条件と、現在有効な機器・モニター指示を拾う", () => {
    const hd = { purpose: "維持", method: "HD", minutes: 240, qb: 180, membrane: 1.5, anticoag: { drug: "なし", initial: null, hourly: null }, uf: 2, dw: 50, access: "シャント" } as const;
    const order: OrderEntry = { ...pump, order: { type: "procedure", code: "PROC-HD", hd, start: { day: 0 }, schedule: { kind: "once", day: 0 } } } as unknown as OrderEntry;
    expect(equipmentOf([order])[0].hd).toEqual(hd);
    const line = { id: "monitor", cat: "その他", text: "基本指示\nモニター：心電図を持続監視", start: { day: -1 }, by: "医師", at: { day: -1, time: "10:00" } } as const;
    expect(equipmentOf([], [line], "10:00")[0].label).toContain("心電図");
    expect(equipmentOf([], [{ ...line, stop: { day: 0, time: "09:00", by: "医師" } }], "10:00")).toEqual([]);
    expect(equipmentOf([], [{ ...line, text: "基本指示\nモニター：なし" }])).toEqual([]);
  });
  it("明示された耐性菌を抽出し、陰性を除外", () => {
    expect(infectionFlags({ ...patient, cultures: [{ collectedOn: -1, specimen: "喀痰", status: "最終報告", organism: "MRSA" }] })[0].text).toBe("MRSA");
    expect(infectionFlags({ ...patient, cultures: [{ collectedOn: -1, specimen: "喀痰", status: "最終報告", organism: "MRSA 陰性" }] })).toEqual([]);
  });
  it("抗菌薬はマスタの名前で分類し、推奨を作らない", () => {
    const drug = DRUGS.find(d => /バンコマイシン/.test(d.generic ?? d.name)); expect(drug).toBeTruthy();
    if (pump.order.type !== "injection" || !drug) throw Error();
    expect(antibioticsOf([{ ...pump, order: { ...pump.order, items: [{ drugCode: drug.code, amount: 1, unit: "g" }] } }])[0]).toMatchObject({ kind: "抗MRSA・届出確認", days: 3 });
  });
  it("DOT は1日複数投与を1とし、未実施・取消を除く", () => {
    const r = { patientId: "test", orderId: "a", at: -100, status: "実施" } as AdminRecord;
    expect(dotFor(["a", "b"], "test", [r, { ...r, at: -10 }, { ...r, orderId: "b", at: 10 }, { ...r, at: -1500, status: "未実施" }, { ...r, at: -3000, cancellation: { by: "看護師", at: "10:00", reason: "取消" } }])).toBe(2);
  });
  it("口腔ケアの優先要因と管理対象候補を別に表示", () => {
    expect(oralFlags(patient, [], true, [], "10:00", ["誤嚥性肺炎"])).toEqual({ priority: ["手術予定", "誤嚥性肺炎", "絶食"], management: true });
  });
});

describe("一覧の判定", () => {
  const inj = (code: string): OrderEntry => ({ ...pump, order: { ...pump.order, type: "injection", items: [{ drugCode: code, amount: 1, unit: "g" }] } } as OrderEntry);
  it("セファゾリン・内服抗菌薬を拾い、輸液を除く", () => {
    expect(antibioticsOf([inj("INJ-CEZ1")])[0]).toMatchObject({ code: "INJ-CEZ1", kind: "", days: 3 });
    const oral = { ...pump, order: { type: "prescription", drugCode: "ORAL-AMPC250", start: { day: -1 } } } as unknown as OrderEntry;
    expect(antibioticsOf([oral])).toHaveLength(1);
    expect(antibioticsOf([inj("INJ-NS500")])).toEqual([]);
  });
  it("耐性菌、広域・抗MRSA、その他の順", () => {
    expect(infectionRank({ ...patient, cultures: [{ collectedOn: 0, specimen: "血液", status: "最終報告", organism: "MRSA" }] }, [])).toBe(0);
    expect(infectionRank(patient, [inj("INJ-VCM05")])).toBe(1);
    expect(infectionRank(patient, [inj("INJ-CEZ1")])).toBe(2);
  });
  it("登録した現在の病名がある場合、古い入院病名や記事を使わない", () => {
    expect(oralFlags(patient, [], false, [], "10:00", ["下腿蜂巣炎", "ＭＲＳＡ菌血症"]).priority).not.toContain("誤嚥性肺炎");
    expect(oralFlags(patient, [], false, [], "10:00", []).priority).not.toContain("誤嚥性肺炎");
  });
  it("培養・TDMは抗菌薬の開始以降だけ", () => {
    const p = { ...patient, cultures: [{ collectedOn: -3, specimen: "血液", status: "最終報告" }], labs: [{ day: -3, time: "10:00", values: { VCM: 15 } }] } as Patient;
    expect(antibioticMonitoring(p, -2)).toEqual({ culture: false, tdm: false });
    expect(antibioticMonitoring(p, -3)).toEqual({ culture: true, tdm: true });
  });
  it("行を切り替え、同じ行なら閉じる", () => {
    expect(toggleSpecialistRow(null, "a")).toBe("a");
    expect(toggleSpecialistRow("a", "b")).toBe("b");
    expect(toggleSpecialistRow("a", "a")).toBeNull();
  });
});
