import { describe, expect, it } from "vitest";
import { calculateClaim } from "./billing/engine";
import { DEFAULT_OPTIONS } from "./billing/model";
import { applyChoice, checkDraft, isReady, regionFromWords, sideFromWords, toOrder, type CheckContext, type Draft } from "./drafts";
import { REGIONS, REGION_GROUPS, contrastFacts, egfr, emptyConsent, emptyImaging, emptyPhysio, findRegion, latestCre, regionsFor, searchRegions, type ImagingOrder, type PhysioOrder } from "./exams";
import { consentFor, findConsent } from "./consent";
import { imagingDraftText, imagingLines, imagingMethodText, imagingSummary, imagingTitle } from "./format";
import { orderConsentText, risRows, shoshaRoku } from "./ris";
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
    expect(keys(d)).toEqual(["views", "reading", "transport", "when", "purpose"]);
  });
  it("造影CT（佐倉）: eGFR を計算して出し、ヨード造影剤アレルギーは承知が要る", () => {
    const d = { ...emptyImaging("c", "CT"), region: "R-ABD-PELVIS", contrast: "造影" as const, transport: "車椅子" as const, purpose: "膿瘍", when: { day: 1, time: "14:00", priority: "予約" as const } };
    const issues = checkDraft(d, ctx());
    const cre = latestCre(sakura)!;
    expect(issues.find((i) => i.key === "egfr")?.message).toContain(`eGFR ${egfr(cre.value, sakura.age, sakura.sex)}`);
    const allergy = issues.find((i) => i.key === "allergy")!;
    expect(allergy.level).toBe("ask");
    const acked = allergy.choices![0].apply!(d);
    // 造影CT は説明・同意書が要る: 同意書を用意する → 確定すると同意書の下書きができる
    const consent = checkDraft(acked, ctx()).find((i) => i.key === "consent")!;
    expect(consent.level).toBe("ask");
    const ready = consent.choices![0].apply!(acked);
    expect(isReady(checkDraft(ready, ctx()))).toBe(true);
    const r = toOrder(ready, ctx());
    expect((r.order as ImagingOrder).acks).toEqual(["造影剤アレルギー承知"]);
    expect(r.consents).toEqual(["CONSENT-CT-CONTRAST"]);
    // 同意があれば聞かない
    expect(checkDraft(acked, ctx(sakura, { consents: [{ code: "CONSENT-CT-CONTRAST", status: "同意" }] })).find((i) => i.key === "consent")?.level).toBe("info");
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
  it("ヨード造影でビグアナイド系を内服中 → 休薬の指示を求める", () => {
    const met: OrderEntry = { kind: "order", id: "met", day: -1, time: "09:00", author: "x", status: "有効", order: { type: "prescription", category: "定期", drugCode: "ORAL-MET250", amount: 1, unit: "錠", timings: ["朝", "夕"], start: { day: -1, timing: "夕" } } };
    const d = { ...emptyImaging("c", "CT"), region: "R-CHEST", contrast: "造影" as const, transport: "車椅子" as const, purpose: "x", when: { day: 1, time: "14:00", priority: "予約" as const }, acks: ["造影剤アレルギー承知"] };
    expect(keys(d, ctx(sakura, { activeOrders: [met] }))).toContain("biguanide");
  });
  it("Cre が90日より古ければ確かめる", () => {
    const d = { ...emptyImaging("c", "CT"), region: "R-CHEST", contrast: "放射線科一任" as const, transport: "車椅子" as const, purpose: "x", when: { day: 1, time: "14:00", priority: "予約" as const }, acks: ["造影剤アレルギー承知"] };
    const old = ctx(sakura);
    old.patientFacts = { ...old.patientFacts!, cre: { value: 0.8, day: -120 } };
    expect(checkDraft(d, old).find((i) => i.key === "egfr")?.message).toContain("90日を超えて");
  });
  it("ホルター心電図をつけている日の画像検査", () => {
    const holter: OrderEntry = { kind: "order", id: "h", day: 0, time: "09:00", author: "x", status: "有効", order: { type: "physio", test: "PHY-HOLTER", purpose: "x", when: { day: 1, time: "10:00", priority: "予約" }, place: "ベッドサイド" } };
    const d = { ...emptyImaging("x", "X線"), region: "R-CHEST", views: ["立位正面（PA）"], reading: "後日" as const, transport: "車椅子" as const, purpose: "x", when: { day: 1, time: "14:00", priority: "予約" as const } };
    expect(keys(d, ctx(sakura, { activeOrders: [holter] }))).toEqual(["holter"]);
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

// ---------------------------------------------------------------------------
// 部位・左右・体位・方向、CT・MRI の方法と造影、同意（2026-11-04）
// ---------------------------------------------------------------------------

describe("部位のマスター", () => {
  it("コードは重ならず、区分と検査の種類がある", () => {
    const codes = REGIONS.map((r) => r.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const r of REGIONS) {
      expect(REGION_GROUPS).toContain(r.group);
      expect(r.modalities.length).toBeGreaterThan(0);
    }
    for (const code of ["R-CHEST", "R-ABD", "R-CHEST-ABD", "R-ABD-PELVIS", "R-HEAD", "R-CSPINE", "R-LSPINE", "R-KNEE", "R-LEG", "R-HIP"]) expect(findRegion(code), code).toBeTruthy();
  });
  it("X線の部位には方向の候補・標準の方向・標準の体位・写真診断の区分があり、左右の要る部位は四肢と肋骨", () => {
    for (const r of REGIONS.filter((r) => r.modalities.includes("X線"))) {
      expect(r.views?.length, r.code).toBeGreaterThan(0);
      expect(r.defaultViews?.length, r.code).toBeGreaterThan(0);
      for (const v of r.defaultViews!) expect(r.views, r.code).toContain(v);
      expect(r.position, r.code).toBeTruthy();
      expect(r.xray, r.code).toBeTruthy();
    }
    for (const r of REGIONS.filter((r) => r.sided)) expect(["上肢", "下肢", "体幹"], r.code).toContain(r.group);
    expect(REGIONS.filter((r) => r.group === "上肢").every((r) => r.sided)).toBe(true);
    expect(REGIONS.filter((r) => r.group === "下肢").every((r) => r.sided)).toBe(true);
  });
  it("検索：「手関節」「膝」「鎖骨」で引ける。検査の種類で絞る", () => {
    expect(searchRegions("X線", "手関節").map((r) => r.code)).toEqual(["R-WRIST"]);
    expect(searchRegions("X線", "膝").map((r) => r.code)).toEqual(["R-KNEE"]);
    expect(searchRegions("MRI", "鎖骨")).toEqual([]);
    expect(regionsFor("CT").some((r) => r.code === "R-CHEST-PELVIS")).toBe(true);
  });
  it("言葉から部位と左右：「右手関節」「両膝」「左の股関節」", () => {
    expect(regionFromWords("右手関節")).toBe("R-WRIST");
    expect(sideFromWords("右手関節")).toBe("右");
    expect(sideFromWords("両膝")).toBe("両側");
    expect(sideFromWords("左の股関節")).toBe("左");
    expect(sideFromWords("胸部")).toBeNull();
  });
});

describe("左右・方向・体位の確認", () => {
  const base = { reading: "後日" as const, transport: "車椅子" as const, purpose: "x", when: { day: 1, time: "14:00", priority: "予約" as const } };
  it("左右の要る部位で左右がなければ聞く（右／左／両側）", () => {
    const d = { ...emptyImaging("x", "X線"), region: "R-WRIST", views: ["正面", "側面"], ...base };
    const side = checkDraft(d, ctx()).find((i) => i.key === "side")!;
    expect(side.level).toBe("ask");
    expect(side.choices!.map((c) => c.label)).toEqual(["右", "左", "両側"]);
    expect(keys(side.choices![0].apply!(d))).toEqual([]);
  });
  it("方向が 0 なら聞く。候補は標準の組み合わせと 1 方向ずつ", () => {
    const d = { ...emptyImaging("x", "X線"), region: "R-WRIST", side: "右" as const, views: [], ...base };
    const v = checkDraft(d, ctx()).find((i) => i.key === "views")!;
    expect(v.level).toBe("ask");
    expect(v.message).toContain("0方向");
    expect(v.choices!.map((c) => c.label)).toEqual(["正面＋側面", "正面", "側面", "斜位"]);
  });
  it("部位と方向だけで、体位は既定で補われる（胸部は左右なし）", () => {
    const d = { ...emptyImaging("x", "X線"), region: "R-CHEST", views: ["正面"], ...base };
    expect(keys(d)).toEqual([]);
    const o = toOrder(d, ctx()).order as ImagingOrder;
    expect(o.position).toBe("立位");
    expect(o.side).toBeUndefined();
    const knee = { ...emptyImaging("k", "X線"), region: "R-KNEE", side: "両側" as const, views: ["正面", "側面"], ...base };
    const ko = toOrder(knee, ctx()).order as ImagingOrder;
    expect(ko.position).toBe("仰臥位");
    expect(checkDraft(knee, ctx()).find((i) => i.key === "films")?.message).toContain("両側");
  });
  it("ポータブルは病室で仰臥位、AI の下書き（方向なし）は臥位正面（AP）", () => {
    const d = { ...emptyImaging("p", "ポータブルX線"), region: "R-CHEST", reading: "当日中" as const, purpose: "x", when: { day: 0, time: null, priority: "至急" as const } };
    expect(keys(d)).toEqual([]);
    const o = toOrder(d, ctx()).order as ImagingOrder;
    expect(o.views).toEqual(["臥位正面（AP）"]);
    expect(o.position).toBe("仰臥位");
    expect(o.transport).toBe("病室（ポータブル）");
  });
});

describe("オーダの文", () => {
  const xr: ImagingOrder = { type: "imaging", modality: "X線", region: "R-WRIST", side: "右", views: ["正面", "側面"], position: "座位", purpose: "骨折の有無", when: { day: 0, time: "10:00", priority: "予約" }, transport: "車椅子", reading: "当日中" };
  it("X線　右手関節　正面・側面（2方向）　座位", () => {
    expect(imagingTitle(xr)).toBe("X線　右手関節");
    expect(imagingMethodText(xr)).toBe("正面・側面（2方向）　座位");
    expect(imagingSummary(xr)).toBe("X線　右手関節　正面・側面（2方向）　座位");
    expect(imagingLines(xr, { y: 2026, m: 11, d: 4 }).detail).toContain("正面・側面（2方向）　座位　読影 当日中");
  });
  it("腹部の臥位正面・立位正面は体位を重ねて書かない。備考は文に入る", () => {
    const abd: ImagingOrder = { ...xr, region: "R-ABD", side: undefined, views: ["臥位正面", "立位正面"], position: "仰臥位", note: "遊離ガスの有無" };
    expect(imagingSummary(abd)).toBe("X線　腹部　臥位正面・立位正面（2方向）　遊離ガスの有無");
  });
  it("CT　胸部〜骨盤　単純＋造影（門脈相）　5mm　同意済", () => {
    const ct: ImagingOrder = {
      type: "imaging",
      modality: "CT",
      region: "R-CHEST-PELVIS",
      contrast: "単純＋造影",
      ct: { mode: "ダイナミック", phases: ["門脈相"], sliceMm: 5, recon: [], range: null },
      position: "仰臥位",
      consent: { state: "取得済み", at: "11/3 15:00", by: "山本", form: "紙の同意書（カルテに保管）", reason: null },
      purpose: "x",
      when: { day: 0, time: "15:00", priority: "予約" },
      transport: "車椅子",
    };
    expect(imagingSummary(ct)).toBe("CT　胸部〜骨盤　単純＋造影（ダイナミック、門脈相）　5mm　仰臥位　同意済（11/3 15:00 山本 紙の同意書（カルテに保管））");
    expect(imagingSummary({ ...ct, consent: undefined })).toContain("同意：未取得");
    expect(imagingSummary({ ...ct, contrast: "単純", ct: undefined, consent: undefined })).toBe("CT　胸部〜骨盤　単純　仰臥位");
  });
  it("MRI の撮像と造影剤、下書きの途中の文", () => {
    const mr: ImagingOrder = { type: "imaging", modality: "MRI", region: "R-KNEE", side: "左", contrast: "造影", mri: { sequences: ["T1", "T2", "脂肪抑制"] }, agent: { code: "CA-GADOBUTROL", mL: 7.5 }, position: "仰臥位", purpose: "x", when: { day: 1, time: "10:00", priority: "予約" }, transport: "独歩" };
    expect(imagingSummary(mr)).toBe("MRI　左膝関節　造影　T1・T2・脂肪抑制　ガドブトロール 1.0 mmol/mL 7.5mL　仰臥位　同意：未取得");
    const d = { ...emptyImaging("x", "X線"), region: "R-WRIST", views: [] as string[] };
    expect(imagingDraftText(d)).toBe("X線　左右？手関節　方向？　座位");
  });
});

describe("CT・MRI の方法と造影の確認", () => {
  const base = { transport: "車椅子" as const, purpose: "x", when: { day: 1, time: "14:00", priority: "予約" as const }, answers: { pregnancy: "なし（確認済み）" } };
  it("CTA を単純とは出せない。ダイナミックは相が要る", () => {
    const cta = { ...emptyImaging("c", "CT"), region: "R-CHEST", contrast: "単純" as const, ct: { mode: "CTA（血管）" as const, phases: [], sliceMm: null, recon: [], range: null }, ...base };
    expect(checkDraft(cta, ctx()).find((i) => i.key === "ctmode")?.level).toBe("stop");
    const dyn = { ...cta, contrast: "単純＋造影" as const, ct: { ...cta.ct, mode: "ダイナミック" as const }, acks: ["造影剤アレルギー承知"], consentPlanned: true };
    const m = checkDraft(dyn, ctx()).find((i) => i.key === "ctmode")!;
    expect(m.level).toBe("ask");
    const chosen = m.choices![0].apply!(dyn);
    expect(isReady(checkDraft(chosen, ctx()))).toBe(true);
    expect((toOrder(chosen, ctx()).order as ImagingOrder).ct?.phases).toEqual(["動脈相", "門脈相"]);
  });
  it("eGFR 45 未満は確認を求め、30 未満は指針の名前を添える", () => {
    const d = { ...emptyImaging("c", "CT"), region: "R-CHEST", contrast: "造影" as const, ...base };
    const low = ctx(sakura, { patientFacts: { sex: "男", age: 80, allergies: [], cre: { value: 1.6, day: 0 } } });
    const e = checkDraft(d, low).find((i) => i.key === "egfr")!;
    expect(e.level).toBe("ask");
    expect(e.message).toContain("45 未満");
    expect(e.message).not.toContain("架空の病院の取り決め");
    expect(e.message).not.toContain("ガイドライン2018");
    const vlow = ctx(sakura, { patientFacts: { sex: "女", age: 85, allergies: [], cre: { value: 2.4, day: 0 } } });
    expect(checkDraft(d, vlow).find((i) => i.key === "egfr")!.message).toContain("ガイドライン2018");
    // 佐倉（eGFR 47）は確認なしで値だけ出す
    expect(checkDraft(d, ctx()).find((i) => i.key === "egfr")!.level).toBe("info");
  });
  it("造影 MRI は腎機能・ガドリニウムのアレルギー・同意書（造影MRI の様式）", () => {
    const gd = ctx(sakura, { patientFacts: { sex: "男", age: 72, allergies: ["ガドリニウム造影剤（発疹）"], cre: { value: 0.8, day: 0 } } });
    const d = { ...emptyImaging("m", "MRI"), region: "R-HEAD", contrast: "造影" as const, answers: { metal: "なし（確認済み）" }, transport: "車椅子" as const, purpose: "x", when: { day: 1, time: "10:00", priority: "予約" as const } };
    const issues = checkDraft(d, gd);
    expect(issues.find((i) => i.key === "allergy")?.message).toContain("ガドリニウム造影剤（発疹）");
    expect(issues.find((i) => i.key === "consent")?.message).toContain("造影MRI");
    expect(consentFor({ type: "imaging", modality: "MRI", contrast: "造影" })).toBe("CONSENT-MRI-CONTRAST");
    expect(findConsent("CONSENT-MRI-CONTRAST").sections.flatMap((s) => s.lines).join("")).toContain("説明書（添付文書）のとおり");
  });
  it("ビグアナイドの案内は指示ではないと書く", () => {
    const met: OrderEntry = { kind: "order", id: "met", day: -1, time: "09:00", author: "x", status: "有効", order: { type: "prescription", category: "定期", drugCode: "ORAL-MET250", amount: 1, unit: "錠", timings: ["朝", "夕"], start: { day: -1, timing: "夕" } } };
    const d = { ...emptyImaging("c", "CT"), region: "R-CHEST", contrast: "造影" as const, ...base, acks: ["造影剤アレルギー承知"] };
    expect(checkDraft(d, ctx(sakura, { activeOrders: [met] })).find((i) => i.key === "biguanide")!.message).toContain("休薬の指示ではありません");
    const f = contrastFacts("CT", ctx().patientFacts!, [met], (x) => `D${x}`);
    expect(f.biguanides).toEqual(["メトホルミン塩酸塩錠"]);
    expect(f.allergy).toBe("ヨード造影剤（蕁麻疹）");
  });
});

describe("造影剤使用の同意の取得欄", () => {
  const base = { region: "R-ABD-PELVIS", contrast: "造影" as const, transport: "車椅子" as const, purpose: "x", when: { day: 1, time: "14:00", priority: "予約" as const }, acks: ["造影剤アレルギー承知"], answers: { pregnancy: "なし（確認済み）" } };
  it("未取得のまま下書きにはできるが、確定の前に止まる（同意書を用意する → 通る）", () => {
    const d = { ...emptyImaging("c", "CT"), ...base, consent: emptyConsent("未取得") };
    const c = checkDraft(d, ctx()).find((i) => i.key === "consent")!;
    expect(c.level).toBe("ask");
    expect(c.message).toContain("同意が未取得");
    expect(isReady(checkDraft(c.choices![0].apply!(d), ctx()))).toBe(true);
  });
  it("取得済み（日時・医師・同意書の形）は通り、オーダと放射線部の受付に出る", () => {
    const d = { ...emptyImaging("c", "CT"), ...base, consent: { state: "取得済み" as const, at: "11/3 15:00", by: "山本", form: "紙の同意書（カルテに保管）" as const, reason: null } };
    const issues = checkDraft(d, ctx());
    expect(issues.find((i) => i.key === "consent")?.level).toBe("info");
    expect(isReady(issues)).toBe(true);
    const r = toOrder(d, ctx());
    expect((r.order as ImagingOrder).consent?.by).toBe("山本");
    expect(r.consents).toEqual([]);
    expect(orderConsentText(r.order as ImagingOrder)).toBe("同意済（11/3 15:00 山本 紙の同意書（カルテに保管））");
    const row = risRows([{ patient: sakura, room: "512", entries: [{ kind: "order", id: "o1", day: 0, time: "09:00", author: "山本", status: "有効", order: r.order! }] }], {})[0];
    expect(shoshaRoku(row, (x) => `D${x}`).items[3].value).toContain("同意済（11/3 15:00 山本");
    // 医師と日時がなければ入れるように言う
    expect(checkDraft({ ...d, consent: { ...d.consent, by: null } }, ctx()).find((i) => i.key === "consent")?.level).toBe("ask");
  });
  it("同意しない → 止める。「単純に変える」で造影と同意が外れる", () => {
    const d = { ...emptyImaging("c", "CT"), ...base, consent: { ...emptyConsent("同意しない"), reason: "本人の希望" } };
    const c = checkDraft(d, ctx()).find((i) => i.key === "consent")!;
    expect(c.level).toBe("stop");
    expect(c.message).toContain("本人の希望");
    const plain = c.choices![0].apply!(d) as typeof d;
    expect(plain.contrast).toBe("単純");
    expect(checkDraft(plain, ctx()).find((i) => i.key === "consent")).toBeUndefined();
  });
});

describe("算定：方向数と両側", () => {
  const entry = (order: ImagingOrder, id: string): OrderEntry => ({ kind: "order", id, day: -2, time: "09:00", author: "試験", status: "有効", order });
  const claim = (entries: OrderEntry[]) =>
    calculateClaim({ today: "2026-11-05", nowTime: "18:00", month: "2026-11", patient: { id: "t", name: "試験", sex: "男", age: 70, admittedOn: -3 }, entries, daily: [], cultures: [], diagnoses: [], options: DEFAULT_OPTIONS });
  const act = (r: ReturnType<typeof claim>) => r.acts.find((a) => a.parts.some((p) => p.lines.some((l) => l.code === "170000510")))!; // 写真診断（ロ）
  const xr = (views: string[], side?: ImagingOrder["side"]): ImagingOrder => ({ type: "imaging", modality: "X線", region: "R-WRIST", side: side ?? "右", views, purpose: "x", when: { day: -2, time: "10:00", priority: "予約" }, transport: "車椅子" });
  it("手関節 3方向（ロ 43点 + 68点）: 1 + 0.5 × 2 = 2 倍 → 86 + 136 + 57 = 279点", () => {
    const r = claim([entry(xr(["正面", "側面", "斜位"]), "a")]);
    expect(act(r).parts[0].points).toBe(279);
    expect(act(r).basis).toContain("3方向 3枚");
  });
  it("両側 2方向は 4 枚（1 + 0.5 × 3 = 2.5 倍）: 108 + 170 + 57 = 335点、確かめる印", () => {
    const r = claim([entry(xr(["正面", "側面"], "両側"), "b")]);
    expect(act(r).parts[0].points).toBe(335);
    expect(act(r).basis).toContain("2方向・両側 4枚");
    expect(r.issues.some((i) => i.text.includes("両側を同一部位"))).toBe(true);
  });
});

it("Creなしの承知は再判定で消え、オーダーを確定できる", () => {
  const c = ctx(sakura, { patientFacts: { sex: "男", age: 50, allergies: [], cre: null } });
  const d = { ...emptyImaging("no-cre", "CT"), region: "R-CHEST", contrast: "造影" as const, purpose: "精査", transport: "車椅子" as const, when: { day: 0, time: null, priority: "至急" as const }, consentPlanned: true };
  const issue = checkDraft(d, c).find((i) => i.key === "egfr")!;
  const next = applyChoice(d, issue.choices![0]);
  expect(next.kind === "imaging" && next.acks).toContain("腎機能承知");
  expect(checkDraft(next, c).filter((i) => i.level !== "info")).toEqual([]);
  expect(isReady(checkDraft(next, c))).toBe(true);
  expect((toOrder(next, c).order as ImagingOrder).acks).toContain("腎機能承知");
});

it("過ぎた画像検査の枠でも今すぐ（至急）が先頭にあり、選ぶと日時の確認が消える", () => {
  const d = { ...emptyImaging("past", "CT"), when: { day: 0, time: "07:29", priority: "予約" as const } };
  const issue = checkDraft(d, ctx()).find((i) => i.key === "when")!;
  expect(issue.choices![0].label).toBe("今すぐ（至急）");
  const next = applyChoice(d, issue.choices![0]);
  expect(checkDraft(next, ctx()).find((i) => i.key === "when")?.level).toBe("info");
});
