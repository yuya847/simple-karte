// 生理検査室 of the fictional hospital: the physiological tests doctors ordered (心電図・心エコー・呼吸機能 …,
// the orders of exams.ts), taken in (受付), done (実施), and reported with the main values and the
// technologist's findings. The ordering doctor marks the report as read in the chart. Which tests are due,
// their state, the values worked out from others (1秒率・ABI) and what a report still lacks are code; the
// technologist measures and writes. Endoscopy is in the same order master but is not done here.

import { abs } from "./flowsheet";
import { examAt, findPhysio, type PhysioOrder } from "./exams";
import type { ResultItem } from "./results";
import type { DayOffset, OrderEntry, Patient } from "./types";

export interface Moment {
  day: DayOffset;
  time: string;
}

/** 内視鏡 is ordered from the same master but done in the endoscopy room (not in this prototype). */
export const ENDOSCOPY = ["PHY-EGD", "PHY-CF", "PHY-BF"];

export interface PhysioField {
  key: string;
  label: string;
  unit: string;
  /** Bounds of what can be typed (to catch a slip of the finger, not a reference range). */
  min: number;
  max: number;
}

const f = (key: string, label: string, unit: string, min: number, max: number): PhysioField => ({ key, label, unit, min, max });

/** The main values entered for each test (as the instrument or the technologist measures them). */
export const PHYSIO_FIELDS: Record<string, PhysioField[]> = {
  "PHY-ECG": [f("HR", "心拍数", "/分", 10, 300), f("PR", "PR 間隔", "ms", 40, 600), f("QRS", "QRS 幅", "ms", 40, 300), f("QT", "QT 間隔", "ms", 150, 800), f("QTc", "QTc", "ms", 150, 800), f("AXIS", "電気軸", "°", -180, 180)],
  "PHY-UCG": [
    f("LVDd", "左室拡張末期径（LVDd）", "mm", 10, 100),
    f("LVDs", "左室収縮末期径（LVDs）", "mm", 5, 90),
    f("IVSd", "心室中隔厚（IVSd）", "mm", 2, 40),
    f("LVPWd", "左室後壁厚（LVPWd）", "mm", 2, 40),
    f("LAD", "左房径（LAD）", "mm", 10, 100),
    f("LVEF", "左室駆出率（LVEF）", "%", 1, 95),
    f("Ee", "E/e′", "", 1, 50),
    f("TRPG", "三尖弁逆流の圧較差（TRPG）", "mmHg", 0, 150),
    f("IVC", "下大静脈径（IVC）", "mm", 1, 50),
  ],
  "PHY-SPIRO": [f("VC", "肺活量（VC）", "L", 0.1, 10), f("pVC", "％肺活量（%VC）", "%", 5, 200), f("FVC", "努力肺活量（FVC）", "L", 0.1, 10), f("FEV1", "1秒量（FEV1）", "L", 0.1, 8), f("pFEV1", "％1秒量（%FEV1）", "%", 5, 200)],
  "PHY-ABI": [f("bR", "上腕の収縮期血圧（右）", "mmHg", 40, 300), f("bL", "上腕の収縮期血圧（左）", "mmHg", 40, 300), f("aR", "足首の収縮期血圧（右）", "mmHg", 0, 350), f("aL", "足首の収縮期血圧（左）", "mmHg", 0, 350), f("pwvR", "baPWV（右）", "cm/秒", 300, 4000), f("pwvL", "baPWV（左）", "cm/秒", 300, 4000)],
  "PHY-HOLTER": [f("beats", "総心拍数", "拍", 1000, 300000), f("hrMin", "最小心拍数", "/分", 10, 300), f("hrMax", "最大心拍数", "/分", 10, 300), f("pvc", "心室期外収縮", "回", 0, 100000), f("pac", "上室期外収縮", "回", 0, 100000), f("pause", "最長 RR 間隔", "秒", 0.3, 20)],
  "PHY-CAROTID": [f("imtR", "max IMT（右）", "mm", 0.1, 10), f("imtL", "max IMT（左）", "mm", 0.1, 10)],
  "PHY-ABDUS": [],
  "PHY-LEVEIN": [],
  "PHY-EEG": [],
};

export const fieldsOf = (test: string): PhysioField[] => PHYSIO_FIELDS[test] ?? [];

/** Values worked out from the ones entered, with the sum written out. */
export function derivedValues(test: string, v: Record<string, number>): { label: string; value: number; unit: string; formula: string }[] {
  const out: { label: string; value: number; unit: string; formula: string }[] = [];
  const r2 = (n: number) => Math.round(n * 100) / 100;
  if (test === "PHY-SPIRO" && v.FEV1 !== undefined && v.FVC) {
    const value = Math.round((v.FEV1 / v.FVC) * 1000) / 10;
    out.push({ label: "1秒率（FEV1/FVC）", value, unit: "%", formula: `${v.FEV1}L ÷ ${v.FVC}L × 100 = ${value}%` });
  }
  if (test === "PHY-ABI") {
    const arm = Math.max(v.bR ?? 0, v.bL ?? 0);
    if (arm > 0) {
      const armText = `上腕の高いほう ${arm}mmHg`;
      if (v.aR !== undefined) out.push({ label: "ABI（右）", value: r2(v.aR / arm), unit: "", formula: `右足首 ${v.aR}mmHg ÷ ${armText} = ${r2(v.aR / arm)}` });
      if (v.aL !== undefined) out.push({ label: "ABI（左）", value: r2(v.aL / arm), unit: "", formula: `左足首 ${v.aL}mmHg ÷ ${armText} = ${r2(v.aL / arm)}` });
    }
  }
  return out;
}

export interface PhysioReport extends Moment {
  values: Record<string, number>;
  /** 所見（技師が見たこと）. */
  findings: string;
  /** まとめ（一言で）. */
  conclusion: string;
  by: string;
  /** Why this version replaced the one before (訂正). */
  reason?: string;
}

export interface PhysioWork {
  orderId: string;
  patientId: string;
  test: string;
  /** 受付：来室した、またはベッドサイドに向かった. */
  arrived?: Moment & { by: string };
  done?: Moment & { by: string };
  /** 実施できなかった（理由）. */
  notDone?: Moment & { by: string; reason: string };
  report?: PhysioReport;
  earlier?: PhysioReport[];
}

export type PhysioDesk = Record<string, PhysioWork>;

export type PhysioStatus = "予約" | "受付済み" | "実施済み" | "報告済み" | "実施できなかった";

export interface PhysioRow {
  orderId: string;
  patientId: string;
  name: string;
  room: string;
  test: string;
  testName: string;
  at: number;
  priority: PhysioOrder["when"]["priority"];
  place: PhysioOrder["place"];
  transport?: string;
  purpose: string;
  comment?: string;
  orderedBy: string;
  status: PhysioStatus;
  work?: PhysioWork;
}

export function statusOf(w: PhysioWork | undefined): PhysioStatus {
  if (!w) return "予約";
  if (w.report) return "報告済み";
  if (w.notDone) return "実施できなかった";
  if (w.done) return "実施済み";
  if (w.arrived) return "受付済み";
  return "予約";
}

/**
 * The tests the laboratory looks at: ordered for yesterday to tomorrow, and older ones not reported yet.
 * Stopped orders and endoscopy are left out.
 */
export function physioRows(people: { patient: Pick<Patient, "id" | "name">; room: string; entries: OrderEntry[] }[], desk: PhysioDesk): PhysioRow[] {
  const rows: PhysioRow[] = [];
  for (const x of people) {
    for (const e of x.entries) {
      const o = e.order;
      if (o.type !== "physio" || e.status === "中止" || ENDOSCOPY.includes(o.test)) continue;
      const w = desk[e.id];
      const status = statusOf(w);
      if (o.when.day < -1 && (status === "報告済み" || status === "実施できなかった")) continue;
      if (o.when.day > 1) continue;
      rows.push({
        orderId: e.id,
        patientId: x.patient.id,
        name: x.patient.name,
        room: x.room,
        test: o.test,
        testName: findPhysio(o.test)?.name ?? o.test,
        at: examAt(o, abs(e.day, e.time)),
        priority: o.when.priority,
        place: o.place,
        transport: o.transport,
        purpose: o.purpose,
        comment: o.comment,
        orderedBy: e.author,
        status,
        work: w,
      });
    }
  }
  return rows.sort((a, b) => (a.status === "報告済み" ? 1 : 0) - (b.status === "報告済み" ? 1 : 0) || (a.priority === "至急" ? 0 : 1) - (b.priority === "至急" ? 0 : 1) || a.at - b.at);
}

/** What stops the report from being confirmed. */
export function reportProblems(test: string, r: Pick<PhysioReport, "values" | "findings" | "conclusion" | "reason">, hadReport: boolean): string[] {
  const out: string[] = [];
  for (const fd of fieldsOf(test)) {
    const v = r.values[fd.key];
    if (v !== undefined && (Number.isNaN(v) || v < fd.min || v > fd.max)) out.push(`${fd.label} ${v}${fd.unit} は入力できる範囲（${fd.min}〜${fd.max}）の外です。打ち間違いを確かめてください。`);
  }
  if (!r.findings.trim()) out.push("所見を書いてください。");
  if (!r.conclusion.trim()) out.push("まとめを書いてください。");
  if (hadReport && !r.reason?.trim()) out.push("訂正の理由を書いてください。");
  return out;
}

export const versionOf = (w: PhysioWork) => (w.report ? (w.earlier?.length ?? 0) + 1 : 0);

/** One line of the values for the chart and the result list. */
export function valuesLine(test: string, v: Record<string, number>): string {
  const main = fieldsOf(test)
    .filter((fd) => v[fd.key] !== undefined)
    .map((fd) => `${fd.label.replace(/（.*?）/, "")} ${v[fd.key]}${fd.unit}`);
  const der = derivedValues(test, v).map((d) => `${d.label} ${d.value}${d.unit}`);
  return [...main, ...der].join("　");
}

/** Reports as results the ordering doctor marks as read (a corrected report is a new result). */
export function physioResultItems(desk: PhysioDesk): ResultItem[] {
  return Object.values(desk)
    .filter((w) => w.report)
    .map((w) => {
      const r = w.report!;
      const v = versionOf(w);
      return {
        key: `phy|${w.orderId}|v${v}`,
        patientId: w.patientId,
        kind: "生理" as const,
        day: r.day,
        time: r.time,
        title: `${findPhysio(w.test)?.name ?? w.test}${v > 1 ? "（訂正）" : ""}`,
        detail: r.conclusion,
        panic: [],
        ...(v > 1 ? { corrected: `訂正（第${v}版）：${r.reason ?? ""}（${r.time} ${r.by}）` } : {}),
      };
    });
}

// ---------------------------------------------------------------------------
// Fictional orders and work of this demo
// ---------------------------------------------------------------------------

const hhmm = (a: number) => {
  const m = ((a % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

/** Physiological tests ordered for the fictional ward patients (merged into their records like the demo lab orders). */
export function demoPhysioOrders(nowAbs: number): Record<string, OrderEntry[]> {
  const DR = "山本（専攻医）";
  const entry = (id: string, day: DayOffset, time: string, order: PhysioOrder): OrderEntry => ({ kind: "order", id, day, time, author: DR, status: "有効", order });
  return {
    "90010198": [
      entry("o-phy-demo1", 0, hhmm(Math.max(0, nowAbs - 120)), { type: "physio", test: "PHY-ECG", purpose: "心不全の経過。利尿薬を使っていて K が下がってきている。", when: { day: 0, priority: "至急" }, place: "ベッドサイド" }),
      entry("o-phy-demo2", -1, "16:00", { type: "physio", test: "PHY-UCG", purpose: "心不全の経過。左室の動き・弁膜症・肺高血圧の有無。", when: { day: 0, time: "14:00", priority: "予約" }, place: "検査室", transport: "車椅子" }),
    ],
    "90010260": [entry("o-phy-demo3", 0, hhmm(Math.max(0, nowAbs - 30)), { type: "physio", test: "PHY-ABDUS", purpose: "急性腎盂腎炎。水腎症・腎膿瘍の有無。", when: { day: 0, priority: "至急" }, place: "ベッドサイド" })],
  };
}

/** The ECG of 北村さん was done and reported this morning (not read by the doctor yet). */
export function initialPhysioDesk(nowAbs: number): PhysioDesk {
  const at = (back: number): Moment => ({ day: 0, time: hhmm(Math.max(0, nowAbs - back)) });
  const TECH = "検査技師 中村";
  return {
    "o-phy-demo1": {
      orderId: "o-phy-demo1",
      patientId: "90010198",
      test: "PHY-ECG",
      arrived: { ...at(95), by: TECH },
      done: { ...at(85), by: TECH },
      report: {
        ...at(60),
        values: { HR: 88, PR: 172, QRS: 104, QT: 392, QTc: 474, AXIS: -12 },
        findings: "洞調律。左室高電位。V4〜V6 に軽い ST 低下と U 波。",
        conclusion: "洞調律、QTc 474ms、U 波あり。",
        by: TECH,
      },
    },
  };
}
