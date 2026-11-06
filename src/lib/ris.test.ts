import { describe, expect, it } from "vitest";
import { calculateClaim } from "./billing/engine";
import { DEFAULT_OPTIONS } from "./billing/model";
import type { ImagingOrder } from "./exams";
import { collectStudies } from "./pacs/studies";
import { PATIENTS } from "./patients";
import {
  demoRisOrders,
  doneProblems,
  doseGroups,
  drlFor,
  initialRisDesk,
  putWork,
  recordProblems,
  reportProblems,
  risResultItems,
  risRows,
  risStatus,
  shoshaRoku,
  studyStateOf,
  unsignedRecords,
  withExamRecords,
  type RisDesk,
  type RisRow,
} from "./ris";
import type { OrderEntry } from "./types";

const NOW = 10 * 60; // 10:00
const fmt = (d: number) => `D${d}`;
const kitamura = PATIENTS.find((p) => p.id === "90010198")!;
const mori = PATIENTS.find((p) => p.id === "90010260")!;
const orders = demoRisOrders(NOW);
const people = PATIENTS.map((p) => ({ patient: p, room: p.room, entries: orders[p.id] ?? [] }));
const desk = initialRisDesk(NOW);
const rowOf = (d: RisDesk, id: string) => risRows(people, d).find((r) => r.orderId === id)!;

describe("放射線部の一覧と状態", () => {
  it("lists the imaging orders including future bookings, the urgent ones first, and reads the state from the record", () => {
    const rows = risRows(people, desk);
    expect(rows.map((r) => r.orderId).sort()).toEqual(["o-ris-demo1", "o-ris-demo2", "o-ris-demo3", "o-ris-demo4"]);
    expect(rowOf(desk, "o-ris-demo1").status).toBe("読影済み");
    expect(rowOf(desk, "o-ris-demo3").status).toBe("依頼");
    // 至急 before the booked one among the requests
    expect(rows[0].orderId).toBe("o-ris-demo3");
  });
  it("shows bookings beyond tomorrow in the existing department list", () => {
    const future = people.map((p) => ({ ...p, entries: p.entries.map((e) => e.order.type === "imaging" ? { ...e, order: { ...e.order, when: { ...e.order.when, day: 30 } } } : e) }));
    expect(risRows(future, {}).some((r) => r.order.when.day === 30)).toBe(true);
  });
  it("goes 依頼 → 受付済み → 撮影中 → 撮影済み, and 中止 stays 中止", () => {
    const r = rowOf(desk, "o-ris-demo2");
    let d = putWork(desk, r, (w) => ({ ...w, arrived: { day: 0, time: "10:00", by: "技師" } }));
    expect(risStatus(d["o-ris-demo2"])).toBe("受付済み");
    d = putWork(d, r, (w) => ({ ...w, started: { day: 0, time: "10:05", by: "技師", via: "模擬装置" } }));
    expect(risStatus(d["o-ris-demo2"])).toBe("撮影中");
    d = putWork(d, r, (w) => ({ ...w, done: { day: 0, time: "10:15", by: "技師", via: "模擬装置" } }));
    expect(risStatus(d["o-ris-demo2"])).toBe("撮影済み");
    expect(risStatus({ ...d["o-ris-demo2"], notDone: { day: 0, time: "10:20", by: "技師", via: "手入力", reason: "体動" } })).toBe("中止");
  });
  it("asks for the contrast medium before a contrast CT is recorded as done", () => {
    const r = rowOf(desk, "o-ris-demo2");
    const w = { ...r, work: undefined };
    expect(doneProblems(w as RisRow, { orderId: r.orderId, patientId: r.patientId, label: r.label })).toEqual(["指示受け（受付）がまだです。", "撮影室・装置を割り当ててください。", expect.stringContaining("使った造影剤を記録")]);
  });
});

describe("照射録（施行規則 第16条）", () => {
  it("fills the four items from the order, the patient and the record", () => {
    const s = shoshaRoku(rowOf(desk, "o-ris-demo1"), fmt);
    expect(s.items.map((i) => i.label.slice(0, 1))).toEqual(["一", "二", "三", "四"]);
    expect(s.items[0].value).toBe("北村 博（キタムラ ヒロシ）　男　79歳");
    expect(s.items[2].value).toContain("回診用X線撮影装置");
    expect(s.items[2].value).toContain("90kV・2.5mAs・100cm");
    expect(s.items[3].value).toContain("山本（専攻医）");
    expect(s.ready).toBe(true);
  });
  it("says what is missing: a CT needs its conditions and the dose (CTDIvol・DLP)", () => {
    const r = rowOf(desk, "o-ris-demo2");
    const d = putWork(desk, r, (w) => ({ ...w, room: "CT1", done: { day: 0, time: "15:20", by: "技師", via: "手入力" }, exposure: { kv: 120 } }));
    const p = recordProblems(rowOf(d, "o-ris-demo2"), fmt);
    expect(p).toContain("三：管電流（mA）が入っていません。");
    expect(p).toContain("三：撮影範囲が入っていません。");
    expect(p).toContain("線量：CTDIvol（mGy）が入っていません（CT は線量の記録が要ります）。");
  });
  it("MRI does not irradiate: no 照射録", () => {
    const sakura = PATIENTS.find((p) => p.id === "90010231")!;
    const mri = risRows([{ patient: sakura, room: "512", entries: (orders[sakura.id] ?? []).map((e) => ({ ...e, order: { ...(e.order as ImagingOrder), when: { day: 0, time: "10:00", priority: "予約" as const } } })) }], {})[0];
    expect(recordProblems(mri, fmt)[0]).toContain("照射録の対象ではありません");
  });
  it("lists the records waiting for the ordering doctor's signature", () => {
    expect(unsignedRecords(risRows(people, desk), "山本（専攻医）").map((r) => r.orderId)).toEqual(["o-ris-demo1"]);
    const signed = putWork(desk, rowOf(desk, "o-ris-demo1"), (w) => ({ ...w, signed: { day: 0, time: "10:30", by: "山本（専攻医）" } }));
    expect(unsignedRecords(risRows(people, signed))).toEqual([]);
  });
});

describe("線量と DRL（Japan DRLs 2025）", () => {
  const ct = (contrast: ImagingOrder["contrast"], region = "R-ABD-PELVIS"): ImagingOrder => ({ type: "imaging", modality: "CT", region, contrast, purpose: "x", when: { day: 0, priority: "至急" }, transport: "車椅子" });
  it("finds the protocol: 上腹部〜骨盤1相 14 mGy / 720 mGy・cm; two phases are not compared", () => {
    expect(drlFor(ct("単純"), undefined).drl).toEqual({ protocol: "上腹部〜骨盤1相", ctdiVol: 14, dlp: 720 });
    expect(drlFor(ct("単純＋造影"), undefined).why).toContain("2相");
    expect(drlFor(ct("単純", "R-HEAD"), undefined).drl?.dlp).toBe(1260);
  });
  it("胸部正面 X線 depends on the tube voltage (100kV 以上 0.2 / 未満 0.3 mGy)", () => {
    const xr: ImagingOrder = { type: "imaging", modality: "X線", region: "R-CHEST", views: ["立位正面（PA）"], purpose: "x", when: { day: 0, priority: "至急" }, transport: "車椅子" };
    expect(drlFor(xr, { orderId: "a", patientId: "b", label: "", exposure: { kv: 120 } }).drl?.esak).toBe(0.2);
    expect(drlFor(xr, { orderId: "a", patientId: "b", label: "", exposure: { kv: 90 } }).drl?.esak).toBe(0.3);
    expect(drlFor(xr, undefined).drl).toBeNull();
  });
  it("compares the facility's median with the DRL, not each patient", () => {
    const groups = doseGroups(risRows(people, desk));
    expect(groups).toEqual([{ protocol: "胸部正面（100kV 未満）", modality: "X線", count: 1, median: { esak: 0.18 }, drl: { protocol: "胸部正面（100kV 未満）", esak: 0.3 }, above: [] }]);
  });
});

describe("読影レポートとカルテ", () => {
  it("a confirmed report is a result for the ordering doctor; a correction is a new one", () => {
    const items = risResultItems(desk);
    expect(items).toEqual([expect.objectContaining({ key: "ris|o-ris-demo1|v1", kind: "画像", patientId: "90010198", detail: "両側胸水と肺うっ血は前回と著変なし。" })]);
    const w = desk["o-ris-demo1"];
    const corrected = { ...desk, "o-ris-demo1": { ...w, earlier: [w.report!], report: { ...w.report!, impression: "訂正", reason: "左右の取り違え" } } };
    expect(risResultItems(corrected)[0].key).toBe("ris|o-ris-demo1|v2");
    expect(reportProblems({ findings: "a", impression: "b" }, true)).toEqual(["訂正の理由を書いてください。"]);
  });
  it("the PACS viewer shows images only after they were sent, with the radiologist's report", () => {
    const studies = collectStudies(kitamura, orders[kitamura.id], NOW, desk);
    const today = studies.find((s) => s.id === "o-ris-demo1")!;
    expect(today.pending).toBe(false);
    expect(today.report).toContain("【診断】両側胸水と肺うっ血は前回と著変なし。");
    const moriStudy = collectStudies(mori, orders[mori.id], 24 * 60, desk).find((s) => s.id === "o-ris-demo2")!;
    expect(moriStudy.pending).toBe(true);
    expect(studyStateOf(orders[mori.id][0].order as ImagingOrder, undefined).reader).toBe("（依頼）");
  });
});

describe("会計への連携（算定は放射線部の記録から）", () => {
  const claim = (entries: OrderEntry[], nowTime = "18:00") =>
    calculateClaim({ today: "2026-11-04", nowTime, month: "2026-11", patient: { id: "90010260", name: "森 久美子", sex: "女", age: 64, admittedOn: -2 }, entries, daily: [], cultures: [], diagnoses: [], options: DEFAULT_OPTIONS });
  const codes = (r: ReturnType<typeof claim>) => r.acts.flatMap((a) => a.parts.flatMap((p) => p.lines.map((l) => l.code)));
  const ctEntry = orders[mori.id];

  it("a study whose time has passed is not billed until 放射線部 records it as done", () => {
    expect(codes(claim(ctEntry))).toContain("170011810"); // without the department's record: counted once its time passed
    expect(codes(claim(withExamRecords(ctEntry, {}) as OrderEntry[]))).not.toContain("170011810");
  });
  it("bills the contrast medium the technologist recorded (E300), and the 造影剤使用加算 only when one was used", () => {
    const r = rowOf(desk, "o-ris-demo2");
    const done = putWork(desk, r, (w) => ({
      ...w,
      done: { day: 0, time: "15:20", by: "技師", via: "模擬装置" },
      contrast: { day: 0, time: "15:10", by: "技師", code: "620003689", name: "イオパミロン注３００シリンジ　６１．２４％１００ｍＬ", count: 1, route: "静注", lot: "L-1", reaction: "なし" },
    }));
    const res = claim(withExamRecords(ctEntry, done) as OrderEntry[]);
    expect(codes(res)).toEqual(expect.arrayContaining(["170011810", "170012070", "620003689"]));
    const drug = res.acts.find((a) => a.parts.some((p) => p.lines.some((l) => l.code === "620003689")))!;
    // 薬価 3,994円 → (3994 − 15) ÷ 10 = 397.9 → 398 ＋ 1 = 399点
    expect(drug.parts[0].points).toBe(399);
    expect(res.issues.some((i) => i.text.includes("造影剤（薬剤料）はこの試作では入っていません"))).toBe(false);
    const plain = putWork(desk, r, (w) => ({ ...w, done: { day: 0, time: "15:20", by: "技師", via: "手入力" } }));
    expect(codes(claim(withExamRecords(ctEntry, plain) as OrderEntry[]))).not.toContain("170012070");
  });
  it("a study recorded as not done is not billed", () => {
    const r = rowOf(desk, "o-ris-demo2");
    const stopped = putWork(desk, r, (w) => ({ ...w, notDone: { day: 0, time: "15:00", by: "技師", via: "手入力", reason: "患者の希望で延期" } }));
    expect(codes(claim(withExamRecords(ctEntry, stopped) as OrderEntry[]))).not.toContain("170011810");
  });
});

it("手入力で撮影条件を保存し、撮影済みを経て照射録を確定できる", () => {
  const r = rowOf({}, "o-ris-demo3");
  expect(recordProblems(r, fmt).join(" ")).toContain("管電圧");
  expect(recordProblems(r, fmt).join(" ")).toContain("管電流時間積");
  const saved = putWork({}, r, (w) => ({ ...w, arrived: { day: 0, time: "10:00", by: "技師" }, room: "XR1", exposure: { kv: 120, mas: 3, distanceCm: 180, films: 1 }, dose: { esak: 0.2 } }));
  const ready = rowOf(saved, r.orderId);
  expect(doneProblems(ready, ready.work!)).toEqual([]);
  expect(recordProblems(ready, fmt).join(" ")).toContain("撮影の記録");
  const done = putWork(saved, r, (w) => ({ ...w, done: { day: 0, time: "10:05", by: "技師", via: "手入力" } }));
  expect(recordProblems(rowOf(done, r.orderId), fmt)).toEqual([]);
});
