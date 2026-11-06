import { marKey } from "../mar";
import type { Order, Patient } from "../types";
import { DRUGS, ORAL_DRUGS } from "../master";
import { ADOPTED_TOPICAL } from "../formulary-items";
import { INITIAL_BOOK, type NarcoticBook } from "../narcotic-book";

/** Authored pharmacy workflow cases, isolated from laboratory and diagnosis fixtures. */
export function addPharmacyOrders(p: Patient, i: number, stage: string) {
  if (stage !== "入院" || p.age < 18) return;
  const put = (suffix: string, order: Order, day = -1) => p.history.push({ kind: "order", id: `${p.id}-pharmacy-${suffix}`, day: Math.max(day, p.admittedOn), time: "08:00", author: p.attending, status: "有効", order });
  const oral = (suffix: string, code: string, category: "定期" | "臨時" | "退院時" = "定期", amount = 1) => put(suffix, { type: "prescription", category, drugCode: code, amount, unit: "錠", timings: ["朝", "夕"], start: { day: category === "退院時" ? 1 : 0, timing: "朝" }, days: category === "退院時" ? 7 : 3 });
  if (i % 10 < 6) {
    oral("regular", "ORAL-MGO330");
    oral("temporary", "ORAL-APAP500", "臨時");
    put("injection", { type: "injection", items: [{ drugCode: "INJ-NS100", amount: 100, unit: "mL" }], route: "点滴静注", schedule: { kind: "per_day", count: 1 }, start: { day: 0, time: "10:00" }, days: 3, minutesPerDose: 60 });
    put("extra", { type: "injection", items: [{ drugCode: "INJ-NS100", amount: 100, unit: "mL" }], route: "点滴静注", schedule: { kind: "once" }, start: { day: 0, time: "16:00" }, minutesPerDose: 60 }, 0);
  }
  if (i % 10 === 1) {
    for (const suffix of ["regular", "injection"]) {
      const old = p.history.find((e) => e.id === `${p.id}-pharmacy-${suffix}`);
      if (old?.kind !== "order") continue;
      old.status = "中止"; old.stoppedOn = 0; old.stoppedTime = "08:00";
      if (old.order.type === "prescription") put("changed-oral", { ...old.order, amount: 2, comment: "便通を確認し本日から1回2錠へ変更" }, 0);
      if (old.order.type === "injection") put("changed-injection", { ...old.order, replaces: old.id, start: { day: 0, time: "10:00" }, items: old.order.items.map((item) => ({ ...item, amount: 200 })), comment: "本日分から補液量を変更" }, 0);
    }
  }
  if (i % 10 === 6) {
    oral("home", "ORAL-AMLO5", "退院時");
    put("discharge", { type: "procedure", code: "PROC-LEAVE", start: { day: 1, time: "10:00" }, schedule: { kind: "once" }, leave: { kind: "退院", from: { day: 1, time: "10:00" }, destination: "自宅", note: "退院時処方を薬剤師が確認" } });
  }
  if (i % 20 === 2) {
    const valproate = ORAL_DRUGS.find((d) => /バルプロ酸/.test(d.name));
    const meropenem = DRUGS.find((d) => /メロペネム/.test(d.name));
    if (valproate && meropenem) {
      oral("contraindication-oral", valproate.code);
      put("contraindication-injection", { type: "injection", items: [{ drugCode: meropenem.code, amount: 0.5, unit: "g" }], route: "点滴静注", schedule: { kind: "per_day", count: 3 }, start: { day: 0, time: "10:00" }, days: 3, minutesPerDose: 60 });
    }
  }
  if (i % 20 === 3) oral("duplicate", "ORAL-MGO330", "臨時", 2);
  if (/腎不全|腎障害/.test(p.admissionDiagnosis)) {
    oral("renal-dose", "ORAL-MGO330", "定期", 4);
    p.history.push({ kind: "note", id: `${p.id}-pharmacy-query`, day: 0, time: "08:05", role: "薬剤師", author: "小林（薬剤師）", text: "腎機能低下時の酸化マグネシウムの投与量について疑義照会を準備。直近の腎機能・血清Mgと処方量を照合する。" });
  }
  if (i % 20 === 5) {
    if (i % 40 !== 25) oral("narcotic", "ORAL-OXC5");
    const rescue = ORAL_DRUGS.find((d) => d.name.includes("オキノーム"));
    if (rescue) put("rescue", { type: "prescription", category: "臨時", drugCode: rescue.code, amount: 1, unit: rescue.unit, timings: [], prn: "突出痛時", start: { day: 0 }, days: 3 });
    const patch = ADOPTED_TOPICAL.find((r) => /フェンタニル.*1mg/.test(r[1].normalize("NFKC")));
    if (patch && i % 40 === 25) put("patch", { type: "prescription", category: "定期", drugCode: patch[0], amount: 1, unit: "枚", timings: ["朝"], start: { day: 0, timing: "朝" }, days: 3 });
    put("morphine", { type: "injection", items: [{ drugCode: "INJ-MOR10", amount: 5, unit: "mg" }], route: "皮下注", schedule: { kind: "once" }, start: { day: 0, time: "09:00" } });
  }
  if (i % 10 === 7) put("blood", { type: "procedure", code: "PROC-TX", start: { day: 0, time: "14:00" }, schedule: { kind: "once" }, tx: { product: (["RBC", "FFP", "PC"] as const)[Math.floor(i / 10) % 3], units: Math.floor(i / 10) % 3 === 2 ? 10 : 2, abo: p.blood?.abo ?? "A", rh: p.blood?.rh ?? "+", reason: "主治医が出血・血算・凝固検査を確認し輸血を指示" } });
  if (/MRSA|ＭＲＳＡ/.test(p.admissionDiagnosis)) {
    p.history = p.history.map((e) => {
      if (e.kind === "order" && e.order.type === "injection" && e.order.items.some((it) => it.drugCode.startsWith("INJ-VCM"))) {
        const order = { ...e.order, end: undefined, days: undefined };
        return { ...e, status: "有効", stoppedOn: undefined, order: { ...order, items: order.items.map((it) => it.drugCode.startsWith("INJ-VCM") ? { ...it, amount: 1, unit: "g" } : it), schedule: { kind: "every_hours", hours: 12 }, doseTimes: ["00:00", "12:00"] } };
      }
      if (e.kind === "note" && e.role === "看護師" && e.focus) return { ...e, focus: e.focus.map((f) => ({ ...f, d: "呼びかけに返答あり。悪寒の訴えなし。点滴刺入部に発赤・腫脹なし。食事摂取量と排尿回数を確認した。", act: "体温と意識、点滴部位を観察し、変化時は主治医へ連絡する。投与時刻と採血予定を照合した。" })) };
      return e;
    });
    p.labs.push({ day: 0, time: "11:30", values: { ...p.labs.at(-1)?.values, VCM: 14.2 } });
  }
}

export function pharmacyBook(patients: Patient[]): NarcoticBook {
  const book: NarcoticBook = { ...INITIAL_BOOK, ledger: [...INITIAL_BOOK.ledger], slips: [], signed: {}, accidents: [] };
  for (const p of patients) {
    const order = p.history.find((e) => e.id === `${p.id}-pharmacy-morphine`);
    if (!order?.id) continue;
    book.slips.push({ id: `${order.id}-slip`, orderId: order.id, patientId: p.id, code: "INJ-MOR10", marKey: marKey(order.id, 540), usedAt: { day: 0, time: "09:00" }, issuedA: 1, usedMl: 0.5, leftMl: 0.5, unusedA: 0, prescriber: p.attending, by: "病棟看護師", returnedAt: { day: 0, time: "09:30" } });
    book.ledger.push({ id: `${p.id}-pharmacy-return`, code: "ORAL-OXC5", patientId: p.id, at: { day: -1, time: "16:00" }, kind: "返納", qty: 0, paren: 2, note: "前回調剤分の残薬2錠を病棟から返納", by: "小林（薬剤師）" });
  }
  return book;
}

export function pharmacyBloodIssues(patients: Patient[]) {
  return Object.fromEntries(patients.flatMap((p) => p.history.filter((e) => e.id?.endsWith("-pharmacy-blood") && Number(p.id.slice(-4)) % 2 === 0).map((e) => [e.id!, { lot: `B261105-${p.id.slice(-4)}`, at: "09:00", by: "輸血担当" }])));
}
