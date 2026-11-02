import { describe, expect, it } from "vitest";
import { calculateClaim } from "./billing/engine";
import { DEFAULT_OPTIONS } from "./billing/model";
import { checkDraft, isReady, regionFromWords, toOrder, type CheckContext, type Draft } from "./drafts";
import { egfr, emptyImaging, emptyPhysio, latestCre, type ImagingOrder, type PhysioOrder } from "./exams";
import { PATIENTS } from "./patients";
import type { OrderEntry } from "./types";

const sakura = PATIENTS[0]; // ヨード造影剤アレルギー
const kitamura = PATIENTS.find((p) => p.id === "90010198")!; // NSAIDs（喘息発作）, Cre 1.31
const ctx = (p = sakura, extra: Partial<CheckContext> = {}): CheckContext => ({
  activeOrders: [],
  labOrders: [],
  drafts: [],
  nowTime: "10:00",
  fmtDay: (d) => `D${d}`,
  describe: (o) => o.id,
  patientFacts: { sex: p.sex, age: p.age, allergies: p.allergies, cre: latestCre(p) },
  ...extra,
});
const keys = (d: Draft, c = ctx()) => checkDraft(d, c).filter((i) => i.level !== "info").map((i) => i.key);

describe("部位はコードが言葉から決める", () => {
  it.each([
    ["胸部", "X線", "R-CHEST"],
    ["胸腹部", "CT", "R-CHEST-ABD"],
    ["腹部骨盤", "CT", "R-ABD-PELVIS"],
    ["右膝", "MRI", "R-KNEE"],
    ["胸腹部", "X線", "R-CHEST-ABD"],
  ] as const)("%s（%s）→ %s", (w, m, code) => {
    expect(regionFromWords(w, m)).toBe(code);
  });
});

describe("画像検査の確認", () => {
  it("X線: 方向・日時・移動・目的が抜けていれば聞く", () => {
    const d = { ...emptyImaging("x", "X線"), region: "R-CHEST" };
    expect(keys(d)).toEqual(["views", "transport", "when", "purpose"]);
  });
  it("造影CT（佐倉）: eGFR を計算して出し、ヨード造影剤アレルギーは承知が要る", () => {
    const d = { ...emptyImaging("c", "CT"), region: "R-ABD-PELVIS", contrast: "造影" as const, transport: "車椅子" as const, purpose: "膿瘍", when: { day: 1, time: "14:00", priority: "予約" as const } };
    const issues = checkDraft(d, ctx());
    const cre = latestCre(sakura)!;
    expect(issues.find((i) => i.key === "egfr")?.message).toContain(`eGFR ${egfr(cre.value, sakura.age, sakura.sex)}`);
    const allergy = issues.find((i) => i.key === "allergy")!;
    expect(allergy.level).toBe("ask");
    const acked = allergy.choices![0].apply!(d);
    expect(isReady(checkDraft(acked, ctx()))).toBe(true);
    expect((toOrder(acked, ctx()).order as ImagingOrder).acks).toEqual(["造影剤アレルギー承知"]);
  });
  it("造影CT（北村）: カルテに喘息の記載 → 承知が要る", () => {
    const d = { ...emptyImaging("c", "CT"), region: "R-CHEST", contrast: "造影" as const, transport: "車椅子" as const, purpose: "x", when: { day: 1, time: "14:00", priority: "予約" as const } };
    expect(keys(d, ctx(kitamura))).toContain("asthma");
  });
  it("eGFR（日本人の推算式）", () => {
    // 194 × 1.31^−1.094 × 79^−0.287 = 41.2 ／ 194 × 0.82^−1.094 × 86^−0.287 × 0.739 = 49.6
    expect(egfr(1.31, 79, "男")).toBe(41.2);
    expect(egfr(0.82, 86, "女")).toBe(49.6);
  });
  it("胸腹部の X線はマスターにない → 止める", () => {
    const d = { ...emptyImaging("x", "X線"), region: regionFromWords("胸腹部") };
    expect(checkDraft(d, ctx()).find((i) => i.key === "region")?.level).toBe("stop");
  });
  it("MRI: 体内金属の確認", () => {
    const d = { ...emptyImaging("m", "MRI"), region: "R-HEAD", contrast: "単純" as const, transport: "車椅子" as const, purpose: "x", when: { day: 1, time: "09:30", priority: "予約" as const } };
    expect(keys(d)).toEqual(["metal"]);
  });
});

describe("生理検査の確認", () => {
  it("ベッドサイドでできない検査は止める", () => {
    const d = { ...emptyPhysio("p", "PHY-SPIRO"), place: "ベッドサイド" as const, purpose: "x", when: { day: 1, time: null, priority: "予約" as const } };
    expect(checkDraft(d, ctx()).find((i) => i.key === "place")?.level).toBe("stop");
  });
});

describe("算定（画像診断70・生理検査60）", () => {
  const entry = (order: ImagingOrder | PhysioOrder, day = -2, id = `o${Math.random()}`): OrderEntry => ({ kind: "order", id, day, time: "09:00", author: "試験", status: "有効", order });
  const claim = (entries: OrderEntry[]) =>
    calculateClaim({ today: "2026-11-05", nowTime: "18:00", month: "2026-11", patient: { id: "t", name: "試験", sex: "男", age: 70, admittedOn: -3 }, entries, daily: [], cultures: [], diagnoses: [], options: DEFAULT_OPTIONS });
  const pts = (r: ReturnType<typeof claim>, code: string) => r.acts.filter((a) => a.parts.some((p) => p.lines.some((l) => l.code === code)));

  it("胸部X線 2方向: (85 + 68) × 1.5 = 229.5 → 230 ＋ 電子画像管理加算 57 = 287点", () => {
    const r = claim([entry({ type: "imaging", modality: "X線", region: "R-CHEST", views: ["立位正面（PA）", "側面"], purpose: "x", when: { day: -2, time: "10:00", priority: "予約" }, transport: "車椅子" })]);
    expect(pts(r, "170000410")[0].parts[0].points).toBe(287);
  });
  it("CT 造影: 900 + 500、断層診断 450（月1回）、電子画像管理加算 120。同じ月の2回目は撮影料 900 × 0.8 = 720", () => {
    const ct = (day: number): ImagingOrder => ({ type: "imaging", modality: "CT", region: "R-ABD-PELVIS", contrast: "造影", purpose: "x", when: { day, time: "14:00", priority: "予約" }, transport: "車椅子" });
    const r = claim([entry(ct(-2), -2, "a"), entry(ct(-1), -1, "b")]);
    const acts = pts(r, "170011810");
    expect(acts.map((a) => a.parts[0].points)).toEqual([1400, 1220]);
    expect(pts(r, "170015410").reduce((s, a) => s + a.count, 0)).toBe(1);
  });
  it("呼吸機能: 肺気量分画 90 ＋ フローボリューム 100、呼吸機能検査等判断料 140", () => {
    const r = claim([entry({ type: "physio", test: "PHY-SPIRO", purpose: "x", when: { day: -1, time: "10:00", priority: "予約" }, place: "検査室", transport: "車椅子" })]);
    expect(pts(r, "160062610")[0].parts[0].points).toBe(190);
    expect(pts(r, "160146910")[0].parts[0].points).toBe(140);
  });
  it("a study not done yet is not billed", () => {
    const r = claim([entry({ type: "physio", test: "PHY-ECG", purpose: "x", when: { day: 1, time: "10:00", priority: "予約" }, place: "ベッドサイド" })]);
    expect(pts(r, "160068410")).toHaveLength(0);
  });
});
