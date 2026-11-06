import { marKey } from "../mar";
import type { Order, Patient } from "../types";
import { DRUGS, ORAL_DRUGS } from "../master";
import { ADOPTED_TOPICAL } from "../formulary-items";
import { INITIAL_BOOK, type NarcoticBook } from "../narcotic-book";

/** Authored pharmacy workflow cases, isolated from laboratory and diagnosis fixtures. */
export function addPharmacyOrders(p: Patient, i: number, stage: string) {
  if (stage !== "入院" || p.age < 18) return;
  const put = (suffix: string, order: Order, day = -1) => {
    if (order.type === "prescription" && order.category === "定期") {
      for (const e of p.history) {
        if (e.kind === "order" && e.status === "有効" && e.order.type === "prescription" && e.order.category === "定期" && e.order.drugCode === order.drugCode) {
          e.status = "中止"; e.stoppedOn = order.start.day; e.stoppedTime = "08:00";
          e.order.comment = "変更：新しい処方へ切替";
          order.comment ??= "変更：前の処方を中止し用量・日数を更新";
        }
      }
    }
    p.history.push({ kind: "order", id: `${p.id}-pharmacy-${suffix}`, day: Math.max(day, p.admittedOn), time: "08:00", author: p.attending, status: "有効", order });
  };
  const oral = (suffix: string, code: string, category: "定期" | "臨時" | "退院時" = "定期", amount = 1, timings: import("../types").DoseTiming[] = ["朝"]) => put(suffix, { type: "prescription", category, drugCode: code, amount, unit: "錠", timings, start: { day: category === "退院時" ? 1 : 0, timing: timings[0] }, days: category === "退院時" ? 7 : 3 }, category === "臨時" ? 0 : -1);
  // Authored cases: usual adult doses from PMDA electronic inserts (not prescribing rules).
  // Metgluco 400093_3962002F2027: 500mg/day initially in 2–3 divided doses.
  // Lasix: 40–80mg once/day; Renivace HF: 5–10mg once/day; Aldactone A: 50–100mg/day divided.
  const diagnosis = p.admissionDiagnosis;
  const hasVcm = p.history.some((e) => e.kind === "order" && e.order.type === "injection" && e.order.items.some((it) => it.drugCode.startsWith("INJ-VCM")));
  if (!hasVcm) p.history = p.history.filter((e) => !(e.kind === "note" && /TDM|トラフ/.test(e.text ?? "") && /VCM|バンコマイシン|抗MRSA/.test(e.text ?? "")));

  if (/心不全/.test(diagnosis)) {
    oral("regular", "ORAL-FRS20", "定期", 2);
    oral("spironolactone", "ORAL-SPL25", "定期", 1, ["朝", "夕"]);
    oral("enalapril", "ORAL-ENA5");
  } else if (/糖尿病/.test(diagnosis) && !/ケトアシドーシス|高浸透圧/.test(diagnosis)) {
    oral("regular", "ORAL-MET250", "定期", 1, ["朝", "夕"]);
  } else if (/術後|骨折/.test(diagnosis)) {
    oral("temporary", "ORAL-APAP500", "臨時", 1, ["朝", "昼", "夕"]);
    // Hip-fracture postoperative fixture: Lixiana electronic insert, lower-limb surgery prophylaxis.
    if (i === 17) oral("vte", "ORAL-EDO30");
  } else if (/肺炎/.test(diagnosis) && !/MRSA|ＭＲＳＡ/.test(diagnosis)) {
    oral("regular", "ORAL-CARB500", "定期", 1, ["朝", "昼", "夕"]);
    // The disease-course fixture already supplies the antibiotic; do not add a second course.
  } else if (/高血圧/.test(diagnosis)) {
    oral("regular", "ORAL-AMLO5");
  } else if (/胃潰瘍|消化管出血/.test(diagnosis)) {
    oral("regular", "ORAL-ESOM20");
  } else if (/癌|がん/.test(diagnosis)) {
    oral("regular", "ORAL-MGO330", "定期", 1, ["朝", "夕"]);
  }
  if (i % 10 === 1) {
    const old = p.history.find((e) => e.kind === "order" && e.order.type === "injection" && e.order.items.every((it) => DRUGS.find((d) => d.code === it.drugCode)?.kind === "輸液"));
    if (old?.kind === "order" && old.order.type === "injection") {
      old.status = "中止"; old.stoppedOn = 0; old.stoppedTime = "08:00"; old.order.comment = "変更：補液量を減量";
      put("changed-injection", { ...old.order, replaces: old.id, start: { day: 0, time: "10:00" }, end: { day: 2, time: "23:59" }, days: 3, items: old.order.items.map((item) => ({ ...item, amount: item.amount / 2 })), comment: "変更：経口摂取の回復に合わせ本日分から補液量を減量" }, 0);
    }
    const rx = p.history.find((e) => e.id === `${p.id}-pharmacy-regular`);
    if (rx?.kind === "order" && rx.order.type === "prescription" && rx.order.drugCode === "ORAL-MGO330") {
      rx.status = "中止"; rx.stoppedOn = 0; rx.stoppedTime = "08:00";
      put("changed-oral", { ...rx.order, replaces: rx.id, amount: 2, comment: "変更：便通を確認し本日から1回2錠" }, 0);
    }
  }
  if (i % 10 === 6 && !/脳梗塞|脳出血|脳塞栓|MRSA|ＭＲＳＡ/.test(diagnosis)) {
    if (/心不全/.test(diagnosis)) oral("home", "ORAL-FRS20", "退院時", 2);
    else if (/MRSA|ＭＲＳＡ|肺炎/.test(diagnosis)) oral("home", "ORAL-CARB500", "退院時", 1, ["朝", "昼", "夕"]);
    else {
      const regular = p.history.find(e => e.kind === "order" && e.status === "有効" && e.order.type === "prescription" && e.order.category === "定期");
      if (regular?.kind === "order" && regular.order.type === "prescription") put("home", { ...regular.order, category: "退院時", start: { day: 1, timing: regular.order.timings[0] }, days: 7 });
      else oral("home", "ORAL-AMLO5", "退院時");
    }
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
  if (i === 23) { oral("duplicate-base", "ORAL-MGO330", "定期", 1, ["朝", "夕"]); oral("duplicate", "ORAL-MGO330", "臨時", 2, ["朝", "夕"]); }
  if (/腎不全|腎障害/.test(p.admissionDiagnosis)) {
    oral("renal-dose", "ORAL-MGO330", "定期", 4);
    p.history.push({ kind: "note", id: `${p.id}-pharmacy-query`, day: 0, time: "08:05", role: "薬剤師", author: "小林（薬剤師）", text: "腎機能低下時の酸化マグネシウムの投与量について疑義照会を準備。直近の腎機能・血清Mgと処方量を照合する。" });
  }
  if (i % 20 === 5) {
    if (i % 40 !== 25) oral("narcotic", "ORAL-OXC5", "定期", 1, ["朝", "夕"]);
    const rescue = ORAL_DRUGS.find((d) => d.name.includes("オキノーム"));
    if (rescue) put("rescue", { type: "prescription", category: "臨時", drugCode: rescue.code, amount: 1, unit: rescue.unit, timings: [], prn: "突出痛時", start: { day: 0 }, days: 3 });
    const patch = ADOPTED_TOPICAL.find((r) => /フェンタニル.*1mg/.test(r[1].normalize("NFKC")));
    if (patch && i % 40 === 25) put("patch", { type: "prescription", category: "定期", drugCode: patch[0], amount: 1, unit: "枚", timings: ["朝"], start: { day: 0, timing: "朝" }, days: 3 });
    put("morphine", { type: "injection", items: [{ drugCode: "INJ-MOR10", amount: 5, unit: "mg" }], route: "皮下注", schedule: { kind: "once" }, start: { day: 0, time: "09:00" } });
  }
  if (i % 10 === 7 && /消化管出血|憩室出血/.test(diagnosis) && (p.labs.at(-1)?.values.Hb ?? 99) < 8) put("blood", { type: "procedure", code: "PROC-TX", start: { day: 0, time: "14:00" }, schedule: { kind: "once" }, tx: { product: "RBC", units: 2, abo: p.blood?.abo ?? "A", rh: p.blood?.rh ?? "+", reason: "主治医が出血・血算・凝固検査を確認し輸血を指示" } });
  if (/MRSA|ＭＲＳＡ/.test(p.admissionDiagnosis)) {
    p.history = p.history.map((e) => {
      if (e.kind === "order" && e.order.type === "injection" && e.order.items.some((it) => it.drugCode.startsWith("INJ-VCM"))) {
        const leave = p.history.find((x) => x.kind === "order" && x.status === "有効" && x.order.type === "procedure" && x.order.leave?.kind === "退院");
        const end = leave?.kind === "order" && leave.order.type === "procedure" ? { day: leave.order.start.day, time: leave.order.start.time ?? "10:00" } : e.order.end;
        const order = { ...e.order, end, days: end ? undefined : e.order.days };
        return { ...e, status: "有効", stoppedOn: undefined, order: { ...order, items: order.items.map((it) => it.drugCode.startsWith("INJ-VCM") ? { ...it, amount: 1, unit: "g" } : it), schedule: { kind: "every_hours", hours: 12 }, doseTimes: ["00:00", "12:00"] } };
      }
      if (e.kind === "note" && e.role === "看護師" && e.day === 0 && e.focus) return { ...e, focus: e.focus.map((f) => ({ ...f, title: "感染治療中の経過観察", d: "呼びかけに返答あり。悪寒の訴えなし。点滴刺入部に発赤・腫脹なし。食事摂取量と排尿回数を確認した。", act: "体温と意識、点滴部位を観察し、変化時は主治医へ連絡する。投与時刻と採血予定を照合した。" })) };
      return e;
    });
    p.labs.push({ day: 0, time: "11:30", values: { VCM: 14.2, Cre: Math.round(((p.labs.at(-1)?.values.Cre ?? 0.9) + 0.03) * 100) / 100 } });
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
