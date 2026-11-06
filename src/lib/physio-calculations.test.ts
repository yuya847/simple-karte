import { describe, expect, it } from "vitest";
import { bronchodilatorResponse, echoCalculated, echoFlag, goldCandidate, physioCalculated, physioDraft, spiroCalculated, spiroPredicted, spiroQuality, ventilationCandidate } from "./physio-calculations";
import { physioResultItems, physioRows, previousPhysio, reportProblems, savePhysioReport, statusOf, type PhysioReport, type PhysioWork } from "./physio-desk";
import { areasFor } from "./nav";
import { can } from "./roles";

const man = { sex: "男" as const, age: 60, heightCm: 170, weightKg: 65 };
const woman = { ...man, sex: "女" as const, heightCm: 155 };
describe("呼吸機能の予測値と判定候補", () => {
  it("JRS2001の男女別の式と残差から予測値とLLNを計算する", () => {
    expect(spiroPredicted(man)?.VC.predicted).toBeCloseTo(4.012);
    expect(spiroPredicted(man)?.FVC.predicted).toBeCloseTo(3.915);
    expect(spiroPredicted(man)?.FEV1.predicted).toBeCloseTo(3.262);
    expect(spiroPredicted(man)?.FEV1.lln).toBeCloseTo(3.262 - 1.645 * .470);
    expect(spiroPredicted(woman)?.VC.predicted).toBeCloseTo(2.702);
    expect(spiroPredicted(woman)?.FVC.predicted).toBeCloseTo(2.560);
    expect(spiroPredicted(woman)?.FEV1.predicted).toBeCloseTo(2.085);
    expect(spiroPredicted({ ...man, age: 17 })).toBeUndefined();
    expect(spiroPredicted({ ...man, age: 96 })).toBeUndefined();
    expect(spiroPredicted({ ...man, heightCm: NaN })).toBeUndefined();
    expect(spiroCalculated({ VC: 4.012, FVC: 3.915, FEV1: 3.262 }, man).pFEV1).toBeCloseTo(100);
  });
  it("境界を含めて4つの型を区別し、不足値を正常にしない", () => {
    const vc = spiroPredicted(man)!.VC.predicted;
    expect(ventilationCandidate({ VC: vc * .8, FVC: 3, FEV1: 2.1 }, man)).toBe("正常");
    expect(ventilationCandidate({ VC: vc * .79, FVC: 3, FEV1: 2.4 }, man)).toBe("拘束性");
    expect(ventilationCandidate({ VC: vc, FVC: 3, FEV1: 2 }, man)).toBe("閉塞性");
    expect(ventilationCandidate({ VC: vc * .79, FVC: 3, FEV1: 2 }, man)).toBe("混合性");
    expect(ventilationCandidate({ FVC: 3, FEV1: 2 }, man)).toBe("未判定");
  });
  it("GOLDは拡張薬後の値だけで分類し、気管支拡張薬反応は両条件を要求する", () => {
    const predicted = spiroPredicted(man)!.FEV1.predicted;
    for (const [percent, grade] of [[80, "Ⅰ"], [50, "Ⅱ"], [30, "Ⅲ"], [29, "Ⅳ"]] as const) {
      expect(goldCandidate({ FVCPost: 5, FEV1Post: predicted * percent / 100 }, man)).toBe(grade);
    }
    expect(goldCandidate({ FVC: 3, FEV1: 1 }, man)).toBeUndefined();
    expect(goldCandidate({ FVCPost: 3, FEV1Post: 2.4 }, man)).toBeUndefined();
    expect(bronchodilatorResponse({ FEV1: 1, FEV1Post: 1.2 })).toBe(true);
    expect(bronchodilatorResponse({ FEV1: 1, FEV1Post: 1.15 })).toBe(false);
    expect(bronchodilatorResponse({ FEV1: 3, FEV1Post: 3.3 })).toBe(false);
    expect(bronchodilatorResponse({ FEV1: 0, FEV1Post: 1 })).toBeUndefined();
    expect(spiroCalculated({ FVCPost: 3, FEV1Post: 2 }, man).ratioPost).toBeCloseTo(200 / 3);
  });
  it("前後それぞれで150mLの境界を確認する", () => {
    expect(spiroQuality({ FVC: 3, FVCSecond: 2.85, FEV1: 2, FEV1Second: 1.85 }).repeatable).toBe(true);
    expect(spiroQuality({ FVC: 3, FVCSecond: 2.84, FEV1: 2, FEV1Second: 1.9 }).repeatable).toBe(false);
    expect(spiroQuality({ FVC: 3 }).repeatable).toBeUndefined();
    expect(spiroQuality({ FVCPost: 3, FVCSecondPost: 2.9, FEV1Post: 2, FEV1SecondPost: 1.9 }, "Post").repeatable).toBe(true);
  });
});
describe("心エコー・心電図と所見の組み立て", () => {
  it("mmをcmへ直してASE LV mass、LVMI、Simpson、拡張能を求める", () => {
    const c = echoCalculated({ LVDd: 50, LVDs: 30, IVSd: 10, LVPWd: 10, EDV: 100, ESV: 36, E: 80, A: 100, eSeptal: 6, eLateral: 10 }, man);
    expect(c.LVMass).toBe(182);
    expect(c.BSA).toBe(1.75);
    expect(c.LVMI).toBe(103.9);
    expect(c.SimpsonEF).toBe(64); expect(c.LVEF).toBe(70.4); expect(c.FS).toBe(40);
    expect(c.EA).toBe(.8); expect(c.Ee).toBe(10);
    expect(echoFlag("LVMI", 100, "男")).toBe(""); expect(echoFlag("LVMI", 100, "女")).toBe("↑");
    expect(echoCalculated({ E: 80, A: 0, EDV: 100, ESV: 120 })).toEqual({});
    expect(physioCalculated("PHY-ECG", { HR: 120, QT: 400 })).toEqual({ QTc: 566, QTcF: 504 });
  });
  it("ベルヌーイ4v²とIVCから3・8・15のRAPおよびRVSPを計算する", () => {
    expect(echoCalculated({ TRV: 3, IVC: 20, IVCCollapse: 60 })).toMatchObject({ TRPG: 36, RAP: 3, RVSP: 39 });
    expect(echoCalculated({ TRV: 3, IVC: 24, IVCCollapse: 30 })).toMatchObject({ RAP: 15, RVSP: 51 });
    expect(echoCalculated({ TRV: 3, IVC: 24, IVCCollapse: 60 })).toMatchObject({ RAP: 8, RVSP: 44 });
    expect(echoCalculated({ TRV: 3 })).toEqual({ TRPG: 36 });
    expect(echoCalculated({ TRV: NaN, IVC: 20 })).toEqual({});
    expect(echoCalculated({ IVC: 21, IVCCollapse: 50 }).RAP).toBe(8);
  });
  it("選んだ分画と弁の所見から文章を作り、未評価を正常にしない", () => {
    const motion = Object.fromEntries(Array.from({ length: 17 }, (_, i) => [i + 1, "正常" as const]));
    const draft = physioDraft("PHY-UCG", { LVDd: 50, LVDs: 30 }, { motion, valves: { 僧帽弁: { stenosis: "なし", regurgitation: "軽度" } } });
    expect(draft).toBe("左室壁運動は正常。LVEF 70.4%（Teichholz）。軽度の僧帽弁逆流。");
    expect(physioDraft("PHY-UCG", {}, {})).toBe("");
    expect(physioDraft("PHY-UCG", {}, { motion: { 7: "無収縮" } })).toBe("第7分画は無収縮。");
    expect(physioDraft("PHY-ECG", { HR: 60, QT: 400 }, { ecg: ["洞調律"] })).toContain("洞調律。心拍数 60/分。QTc 400ms");
    expect(physioDraft("PHY-SPIRO", { VC: 4, FVC: 3, FEV1: 1.4 }, {}, man)).toContain("候補（前）：閉塞性");
  });
});
describe("技師の下書きと医師の確定", () => {
  const work: PhysioWork = { orderId: "o", patientId: "p", test: "PHY-UCG", done: { day: 0, time: "09:00", by: "技師" } };
  const report: PhysioReport = { day: 0, time: "09:30", by: "技師", values: { LVDd: 50, LVDs: 30 }, findings: "技師が編集した所見", conclusion: "まとめ" };
  it("技師は下書きだけを保存し、医師確定時だけ結果に出す", () => {
    const draft = savePhysioReport(work, report, "臨床検査技師", false);
    expect(statusOf(draft)).toBe("下書き（技師）");
    expect(physioResultItems({ o: draft })).toEqual([]);
    expect(() => savePhysioReport(draft, report, "臨床検査技師", true)).toThrow();
    const signed = savePhysioReport(draft, { ...report, by: "判読医", findings: "医師が編集" }, "医師", true);
    expect(physioResultItems({ o: signed })).toHaveLength(1);
    expect(signed.report).toMatchObject({ by: "判読医", technologist: { by: "技師" }, findings: "医師が編集" });
    expect(signed.draft).toBeUndefined();
    expect(can("医師", "physio.interpret")).toBe(true);
    expect(can("臨床検査技師", "physio.interpret")).toBe(false);
    expect(areasFor("医師").some((a) => a.key === "physio")).toBe(true);
  });
  it("訂正の下書きでは公開版を変えず、前の版を残して再確定する", () => {
    const signed = savePhysioReport(work, { ...report, by: "医師" }, "医師", true);
    const draft = savePhysioReport(signed, { ...report, reason: "径の再計測", findings: "訂正" }, "臨床検査技師", false);
    expect(draft.report?.findings).toBe(report.findings);
    expect(physioResultItems({ o: draft })[0].key).toBe("phy|o|v1");
    const corrected = savePhysioReport(draft, { ...draft.draft!, by: "医師" }, "医師", true);
    expect(corrected.earlier).toHaveLength(1); expect(physioResultItems({ o: corrected })[0].key).toBe("phy|o|v2");
  });
  it("前回は同じ患者・検査で今回の実施より前の最新確定結果を使う", () => {
    const rows = physioRows([{ patient: { id: "p", name: "患者" }, room: "", entries: [{ kind: "order", id: "o", day: 0, time: "08:00", author: "医師", status: "有効", order: { type: "physio", test: "PHY-UCG", purpose: "経過", when: { day: 0, time: "09:00", priority: "予約" }, place: "検査室" } }] }], { o: work });
    const prior = { ...work, orderId: "prior", done: { ...work.done!, day: -30 }, report: { ...report, day: -30 } };
    expect(previousPhysio({ o: work, prior, other: { ...prior, patientId: "other" }, draft: { ...prior, orderId: "draft", report: undefined, draft: report } }, rows[0])?.orderId).toBe("prior");
    expect(reportProblems("PHY-SPIRO", { values: { FEV1Post: Infinity }, findings: "所見", conclusion: "まとめ" }, false)).toHaveLength(1);
  });
});
