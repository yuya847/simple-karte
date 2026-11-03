import { describe, expect, it } from "vitest";
import { initialErPatients } from "./er";
import { EMPTY_STEP, NO_GROWTH, addCultureStep, checkStep, cultureQueue, culturesIn, deskCultures, nextStages, setsFrom, stepText, type StepInput } from "./lab-culture";
import { EMPTY_DESK, drawRows, receive, rejectBlock, rejectSpecimen, type LabDesk } from "./lab-desk";
import { visitLabOrders, visitPeople } from "./lab-visits";
import { OPD_PATIENTS } from "./opd";
import { PATIENTS } from "./patients";
import { PANIC_LIMITS, cultureArrivals, cultureKeyOf, mergeCultures, resultsOf, uncalled, unseen, type PanicCall } from "./results";
import type { WorkPatient } from "./worksheet";

const NOW = 10 * 60;
const er = initialErPatients(NOW);
const orders = visitLabOrders(NOW);
const visits = (d: LabDesk) => visitPeople(er, OPD_PATIENTS, orders, d);
const miyamoto = (d: LabDesk) => visits(d).filter((v) => v.patient.id === "er:er-1");
const by = "検査技師 中村";
const call = (key: string): PanicCall => ({ key, patientId: "x", hits: [], by, to: "主治医", means: "電話", readBack: true, at: { day: 0, time: "10:30" } });
const step = (x: Partial<StepInput>): StepInput => ({ ...EMPTY_STEP, ...x });

/** 宮本さんの血液培養と尿培養を受け付けたところ. */
function taken(): LabDesk {
  let d = EMPTY_DESK;
  for (const r of drawRows(miyamoto(d), {}, d, NOW, NOW).filter((x) => culturesIn(x.codes).length)) d = receive(d, r, by, NOW + 5);
  return d;
}

describe("培養：受け付けると培養中", () => {
  it("the culture tests of an order, and the sets from its comment", () => {
    expect(culturesIn(["LAB-BCX", "LAB-CBC"])).toEqual(["LAB-BCX"]);
    expect(culturesIn(["SET-ROUTINE"])).toEqual([]);
    expect(setsFrom("血液培養 2セット")).toBe("2セット");
    expect(setsFrom(undefined)).toBeUndefined();
  });

  it("a culture sample taken in starts its culture under the label code (培養中, not yet a result)", () => {
    const d = taken();
    const cs = deskCultures(d, "er:er-1");
    expect(cs.map((c) => `${c.specimen} ${c.status} ${c.sets ?? ""}`.trim())).toEqual(["血液 培養中 2セット", "尿 培養中"]);
    expect(cs.every((c) => c.id && c.collectedOn === 0)).toBe(true);
    expect(resultsOf(miyamoto(d)[0].patient, PANIC_LIMITS).filter((i) => i.kind === "培養")).toEqual([]);
    const q = cultureQueue(miyamoto(d), d, {});
    expect(q.map((i) => `${i.culture.specimen} ${i.next.join("・")}`)).toEqual(["血液 塗抹・最終報告", "尿 塗抹・最終報告"]);
  });
});

describe("培養：塗抹 → 中間報告 → 最終報告", () => {
  it("each step needs what it reports", () => {
    const blood = { collectedOn: 0, specimen: "血液", sets: "2セット", status: "培養中" as const };
    expect(checkStep("塗抹", blood, EMPTY_STEP).missing).toEqual(["グラム染色の所見", "陽性のセット数"]);
    expect(checkStep("塗抹", blood, step({ gram: "菌を認めない", positive: 1 })).missing[0]).toContain("陽性のボトル");
    expect(checkStep("塗抹", blood, step({ gram: "グラム陰性桿菌", positive: 1 })).step).toEqual({ stage: "塗抹", gram: "グラム陰性桿菌", sets: "2セット中1セット陽性" });
    expect(checkStep("塗抹", { ...blood, specimen: "尿" }, step({ gram: "菌を認めない" })).step).toEqual({ stage: "塗抹", gram: "菌を認めない" });
    expect(checkStep("中間報告", blood, step({})).missing).toEqual(["菌名"]);
    expect(checkStep("最終報告", blood, step({ organism: "大腸菌" })).missing).toEqual(["薬剤感受性（1剤以上）"]);
    expect(checkStep("最終報告", blood, step({ organism: NO_GROWTH })).step).toEqual({ stage: "最終報告", organism: NO_GROWTH });
    const fin = checkStep("最終報告", blood, step({ organism: "大腸菌", sir: { ABPC: "R", CEZ: "S", MEPM: null }, mic: { ABPC: "≧32" } }));
    expect(fin.step!.susceptibility).toEqual([
      { drug: "ABPC", mic: "≧32", result: "R" },
      { drug: "CEZ", mic: "—", result: "S" },
    ]);
    expect(stepText(fin.step!)).toBe("最終報告（菌名・感受性）：大腸菌　ABPC R（≧32）、CEZ S");
  });

  it("a positive blood culture is phoned in before the next step; then the organism and the final report, each with who and when", () => {
    let d = taken();
    let item = cultureQueue(miyamoto(d), d, {}).find((i) => i.culture.specimen === "血液")!;
    expect(addCultureStep(d, item, { stage: "中間報告", organism: "大腸菌" }, by, NOW + 60)).toBe(d);
    d = addCultureStep(d, item, checkStep("塗抹", item.culture, step({ gram: "グラム陰性桿菌", positive: 1 })).step!, by, NOW + 300);
    const p1 = miyamoto(d)[0].patient;
    const gram = p1.cultures.find((c) => c.specimen === "血液")!;
    expect(gram).toMatchObject({ status: "中間報告", stage: "塗抹", gram: "グラム陰性桿菌", sets: "2セット中1セット陽性", reportedOn: 0, reportedTime: "15:00" });
    expect(gram.log).toEqual([{ stage: "塗抹", by, day: 0, time: "15:00", text: "塗抹（グラム染色）：グラム陰性桿菌（2セット中1セット陽性）" }]);
    const panic = uncalled(resultsOf(p1, PANIC_LIMITS), {});
    expect(panic.map((i) => i.panic[0].name)).toEqual(["血液培養陽性（グラム陰性桿菌）"]);
    item = cultureQueue(miyamoto(d), d, {}).find((i) => i.culture.specimen === "血液")!;
    expect(item.next).toEqual([]);
    expect(item.waits).toContain("連絡");
    const calls = { [panic[0].key]: call(panic[0].key) };
    item = cultureQueue(miyamoto(d), d, calls).find((i) => i.culture.specimen === "血液")!;
    expect(item.next).toEqual(["中間報告", "最終報告"]);

    const acks = { [panic[0].key]: { by: "山本（専攻医）", at: { day: 0, time: "15:20" }, response: "抗菌薬を開始" } };
    d = addCultureStep(d, item, { stage: "中間報告", organism: "大腸菌" }, by, NOW + 1440);
    const p2 = miyamoto(d)[0].patient;
    const named = resultsOf(p2, PANIC_LIMITS).find((i) => i.kind === "培養")!;
    expect(named.key).toBe(`${panic[0].key}|菌名`);
    expect(named.panic).toEqual([]);
    expect(unseen([named], acks)).toHaveLength(1);
    expect(nextStages(p2.cultures.find((c) => c.specimen === "血液")!)).toEqual(["最終報告"]);

    item = cultureQueue(miyamoto(d), d, calls).find((i) => i.culture.specimen === "血液")!;
    d = addCultureStep(d, item, checkStep("最終報告", item.culture, step({ organism: "大腸菌", sir: { ABPC: "R", CEZ: "S", LVFX: "S" } })).step!, "検査技師 佐々木", NOW + 2880);
    const done = miyamoto(d)[0].patient.cultures.find((c) => c.specimen === "血液")!;
    expect(done).toMatchObject({ status: "最終報告", stage: "最終報告", organism: "大腸菌", gram: "グラム陰性桿菌", reportedOn: 2 });
    expect(done.log!.map((l) => `${l.stage} ${l.by}`)).toEqual([`塗抹 ${by}`, `中間報告 ${by}`, "最終報告 検査技師 佐々木"]);
    const fin = resultsOf(miyamoto(d)[0].patient, PANIC_LIMITS).find((i) => i.kind === "培養" && i.title.includes("血液"))!;
    expect(fin.detail).toBe("大腸菌　感受性 3剤（R：ABPC）");
    // Finished in this session: still listed, with nothing left to do.
    expect(cultureQueue(miyamoto(d), d, calls).find((i) => i.culture.specimen === "血液")!.next).toEqual([]);
  });

  it("a urine culture is not a panic value", () => {
    let d = taken();
    const item = cultureQueue(miyamoto(d), d, {}).find((i) => i.culture.specimen === "尿")!;
    d = addCultureStep(d, item, checkStep("塗抹", item.culture, step({ gram: "グラム陰性桿菌", note: "10⁵/mL" })).step!, by, NOW + 120);
    expect(uncalled(resultsOf(miyamoto(d)[0].patient, PANIC_LIMITS), {})).toEqual([]);
    expect(cultureQueue(miyamoto(d), d, {}).find((i) => i.culture.specimen === "尿")!.next).toEqual(["中間報告", "最終報告"]);
  });
});

describe("培養：記録の陽性の血液培養も続けて報告する", () => {
  const oura = PATIENTS.find((p) => p.id === "90010244")!;
  const ward = (d: LabDesk): WorkPatient[] => [{ patient: { ...oura, cultures: mergeCultures(mergeCultures(oura.cultures, cultureArrivals(NOW)[oura.id]), deskCultures(d, oura.id)) }, room: "515B", entries: [] }];

  it("大浦さんの陽性の血液培養：連絡したら菌名、最終報告へ（日付と検体で同じ培養）", () => {
    const [first] = cultureQueue(ward(EMPTY_DESK), EMPTY_DESK, {});
    expect(first).toMatchObject({ patientId: oura.id, culture: { specimen: "血液", status: "中間報告" }, next: [] });
    const key = cultureKeyOf(oura.id, first.culture);
    const calls = { [key]: call(key) };
    const item = cultureQueue(ward(EMPTY_DESK), EMPTY_DESK, calls)[0];
    const d = addCultureStep(EMPTY_DESK, item, { stage: "中間報告", organism: "MRSA（メチシリン耐性黄色ブドウ球菌）" }, by, NOW + 30);
    const cs = ward(d)[0].patient.cultures;
    expect(cs).toHaveLength(1);
    expect(cs[0]).toMatchObject({ organism: "MRSA（メチシリン耐性黄色ブドウ球菌）", gram: "グラム陽性球菌（ブドウ状）", sets: "2セット中1セット陽性", stage: "中間報告" });
    expect(uncalled(resultsOf(ward(d)[0].patient, PANIC_LIMITS), calls)).toEqual([]);
  });
});

describe("培養：再採血と同じ日の2つの培養", () => {
  it("a culture sample sent back drops its culture; once a step is reported it cannot be sent back", () => {
    const d = taken();
    const rows = drawRows(miyamoto(d), {}, d, NOW, NOW + 5);
    const blood = rows.find((r) => r.codes.includes("LAB-BCX"))!;
    const sent = rejectSpecimen(d, blood, "ラベル不一致", "", by, NOW + 10);
    expect(deskCultures(sent, "er:er-1").map((c) => c.specimen)).toEqual(["尿"]);
    const item = cultureQueue(miyamoto(d), d, {}).find((i) => i.culture.specimen === "血液")!;
    const stepped = addCultureStep(d, item, { stage: "最終報告", organism: NO_GROWTH }, by, NOW + 20);
    expect(rejectBlock(drawRows(miyamoto(stepped), {}, stepped, NOW, NOW + 20).find((r) => r.code === blood.code)!)).toContain("培養の報告を始めた");
  });

  it("two cultures of the same specimen and day stay apart by label", () => {
    const a = { id: "A-1", collectedOn: 0, specimen: "血液", status: "培養中" as const };
    const b = { ...a, id: "B-2" };
    expect(mergeCultures([a], [b])).toEqual([a, b]);
    expect(mergeCultures([a], [{ ...a, status: "中間報告" as const }])).toEqual([{ ...a, status: "中間報告" }]);
  });
});
