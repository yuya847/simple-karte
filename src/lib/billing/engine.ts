// Inpatient 出来高 claim for one patient and one month (医科, 令和8年度).
//
// Every point comes from the official 医科診療行為マスター / 医薬品マスター; the rule tables come
// from the 医科電子点数表; the remaining rules follow the 告示 and 留意事項通知 (see docs and
// tests for the section each rule rests on). The engine never assumes a patient's condition:
// 加算 that depend on it come in through `options`, set by a person.

import { minutesOf } from "../dates";
import { findDrug, findLab, findSet, WARD_RULES } from "../master";
import { procEvents, procInterval, procMinutes } from "../proc-timing";
import { AREA_LABEL, CATHETER, findProcDrug, isSevereUlcer } from "../procedures";
import { MEAL_CODES, mealsServed } from "../diet";
import type { HistoryEntry, InjectionOrder, LabOrder, OrderEntry, PrescriptionOrder, ProcedureOrder } from "../types";
import { CODES, IMAGING_CODES as IC, LAB_CODES, PROC_CODES, RESP_JUDGE, TOKKI_CODES } from "./codes";
import { examAt, findPhysio, findRegion, type ImagingOrder, type PhysioOrder } from "../exams";
import { drugPoints, masterQuantity, materialPoints, officialDrugCode, oxygenYen, procDrugPoints } from "./drug";
import { HOSPITAL, meetsStandards } from "./facility";
import { bukkaFor, commentItem, iyakuItem, shinryoItem, tokkiItem } from "./master-items";
import type { ClaimAct, ClaimInput, ClaimIssue, ClaimLine, ClaimPart, ClaimResult, MealClass, Shikibetsu } from "./model";
import { allowedKasan, haihan, kaisuLimits, type HaihanWindow } from "./tables";
import { masterMeta } from "../masters/server";

const DAY = 1440;
const abs = (day: number, time: string) => day * DAY + minutesOf(time);

// ---------- dates ----------

function parseDate(s: string) {
  const [y, m, d] = s.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

/** Calendar facts for a day offset relative to `today`. */
function calendar(today: string) {
  const base = parseDate(today);
  return (offset: number) => {
    const t = new Date(base + offset * 86_400_000);
    return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate(), dow: t.getUTCDay() };
  };
}

// ---------- building blocks ----------

interface DayAct {
  day: number; // offset
  shikibetsu: Shikibetsu;
  parts: ClaimPart[];
  basis: string;
  times?: number; // how many times on that day (default 1)
}

function si(code: string, quantity?: number): ClaimLine {
  const it = shinryoItem(code);
  return { record: "SI", code, name: it?.name ?? code, quantity };
}

function comment(code: string, text?: string, shown?: string) {
  const it = commentItem(code);
  const name = it?.name ?? code;
  return { code, text, label: shown ? `${name.replace(/\s*令和.*$/, "")} ${shown}` : name };
}

const toZenkakuDigits = (s: string) => s.replace(/[0-9]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0xfee0));

function pts(code: string): number {
  return shinryoItem(code)?.points ?? 0;
}

function iyLine(officialCode: string, quantity: number): ClaimLine {
  const it = iyakuItem(officialCode);
  const q = Math.round(quantity * 1000) / 1000;
  return { record: "IY", code: officialCode, name: it?.name ?? officialCode, quantity: q, unit: it?.unit, yen: (it?.price ?? 0) * q };
}

/** A drug part: points from the summed 薬価 of its lines (one 剤 / one day's injections). */
function drugPart(lines: ClaimLine[]): ClaimPart {
  const yen = lines.reduce((s, l) => s + (l.yen ?? 0), 0);
  return { lines, points: drugPoints(yen) };
}

// ---------- the engine ----------

export function calculateClaim(input: ClaimInput): ClaimResult {
  const cal = calendar(input.today);
  const [cy, cm] = input.month.split("-").map(Number);
  const issues: ClaimIssue[] = [];
  const nowAbs = abs(0, input.nowTime);
  const p = input.patient;
  const hospitalDay = (d: number) => d - p.admittedOn + 1;

  // Days of this admission inside the claim month, up to today (or discharge).
  const lastDay = p.dischargedOn ?? 0;
  const days: number[] = [];
  for (let d = p.admittedOn; d <= lastDay; d++) {
    const c = cal(d);
    if (c.y === cy && c.m === cm) days.push(d);
  }
  const inMonth = new Set(days);
  const acts: DayAct[] = [];
  const add = (a: DayAct) => acts.push(a);
  const orders = input.entries.filter((e): e is OrderEntry => e.kind === "order");

  // ===== 90 入院基本料 =====
  const base = HOSPITAL.wardBase; // 急性期一般入院料４
  for (const d of days) {
    const hd = hospitalDay(d);
    const lines = [si(base)];
    let points = pts(base);
    let basis = "A100 急性期一般入院料４（1日につき）";
    // 注3 入院期間加算: 入院日を1日目として 1〜14日目 / 15〜30日目（通知 A100(3)）
    const kikan = hd <= 14 ? "190079470" : hd <= 30 ? "190079670" : null;
    if (kikan) {
      lines.push(si(kikan));
      points += pts(kikan);
      basis += `＋注3 入院期間加算（${hd <= 14 ? "14日以内" : "15日以上30日以内"}、入院${hd}日目）`;
    }
    add({ day: d, shikibetsu: "90", parts: [{ lines, points }], basis });
  }

  // 入院基本料等加算 that every patient of this ward receives (facility-based)
  const firstDay = p.admittedOn;
  const dailyKasan: { code: string; until: number; basis: string }[] = [
    { code: "190145710", until: 14, basis: "A207-3 急性期看護補助体制加算（入院した日から起算して14日を限度）" },
  ];
  for (const d of days) {
    for (const k of dailyKasan) {
      if (hospitalDay(d) <= k.until) add({ day: d, shikibetsu: "90", parts: [{ lines: [si(k.code)], points: pts(k.code) }], basis: k.basis });
    }
  }
  if (inMonth.has(firstDay)) {
    const firstDayKasan: [string, string][] = [
      ["190832110", "A207 診療録管理体制加算１（入院初日）"],
      ["190889910", "A207-5 電子的診療情報連携体制整備加算２（入院初日）"],
      ["190120510", "A234 医療安全対策加算１（入院初日）"],
      ["190147310", "A234-2 感染対策向上加算２（入院初日）"],
      ["190147510", "A234-3 患者サポート体制充実加算（入院初日）"],
      ["190206910", "A243 地域支援・医薬品供給対応体制加算１（入院初日）"],
      ["190207010", "A245 データ提出加算１（許可病床２００床未満、入院初日）"],
    ];
    for (const [code, basis] of firstDayKasan) add({ day: firstDay, shikibetsu: "90", parts: [{ lines: [si(code)], points: pts(code) }], basis });
  }
  // A244 病棟薬剤業務実施加算２: 週1回（日曜〜土曜）。each week's first day in hospital
  const weeksSeen = new Set<number>();
  for (let d = p.admittedOn; d <= lastDay; d++) {
    const c = cal(d);
    const weekStart = d - c.dow;
    if (weeksSeen.has(weekStart)) continue;
    weeksSeen.add(weekStart);
    if (inMonth.has(d)) add({ day: d, shikibetsu: "90", parts: [{ lines: [si("190192110")], points: pts("190192110") }], basis: "A244 病棟薬剤業務実施加算２（週1回。週は日曜〜土曜）" });
  }

  // 加算 that depend on the patient's condition — only when a person confirmed them
  const o = input.options;
  if (o.kyukyu) {
    const code = o.kyukyu === "1" ? "190171910" : "190172010";
    for (const d of days) if (hospitalDay(d) <= 7) add({ day: d, shikibetsu: "90", parts: [{ lines: [si(code)], points: pts(code) }], basis: `A205 救急医療管理加算${o.kyukyu}（入院した日から起算して7日を限度。状態は人が確認）` });
    issues.push({
      level: "review",
      text: `救急医療管理加算${o.kyukyu}：レセプトの摘要に、入院時の患者の状態${o.kyukyu === "2" ? "と、入院後3日以内に行った主な診療行為" : ""}のコメントが要ります（記載要領）。いまは自動では入りません。`,
    });
  }
  if (o.ninchisho) {
    for (const d of days) {
      const code = hospitalDay(d) <= 14 ? "190193310" : "190193410";
      add({ day: d, shikibetsu: "90", parts: [{ lines: [si(code)], points: pts(code) }], basis: "A247 認知症ケア加算３（1日につき。自立度ランクⅢ以上を人が確認）" });
    }
    issues.push({ level: "review", text: "認知症ケア加算：身体的拘束をした日は所定点数が減ります（A247）。拘束した日があれば直してください。" });
  }
  if (o.senmou && inMonth.has(firstDay)) {
    add({ day: firstDay, shikibetsu: "90", parts: [{ lines: [si("190218510")], points: pts("190218510") }], basis: "A247-2 せん妄ハイリスク患者ケア加算（入院中1回）" });
  }
  if (o.kyoryoku && inMonth.has(firstDay)) {
    const code = o.kyoryoku === "1" ? "190834610" : "190834710";
    add({ day: firstDay, shikibetsu: "90", parts: [{ lines: [si(code)], points: pts(code) }], basis: "A253 協力対象施設入所者入院加算（入院初日）" });
  }
  if (o.nyutaiin) {
    if (p.dischargedOn !== undefined && inMonth.has(p.dischargedOn)) {
      add({ day: p.dischargedOn, shikibetsu: "90", parts: [{ lines: [si("190192310")], points: pts("190192310") }], basis: "A246 入退院支援加算１（退院時1回）" });
    } else issues.push({ level: "info", text: "入退院支援加算１は退院した日に算定します（まだ退院していません）。" });
  }

  // ===== 13 診療情報提供料（Ⅰ）: 紹介先の医療機関ごとに患者1人につき月1回（B009）=====
  const sentTo = new Set<string>();
  for (const l of input.letters ?? []) {
    if (!inMonth.has(l.day)) continue;
    const key = l.to.trim() || "（紹介先）";
    if (sentTo.has(key)) {
      issues.push({ level: "info", text: `診療情報提供料（Ⅰ）は紹介先ごとに月1回です（${key} へは今月もう算定しています）。` });
      continue;
    }
    sentTo.add(key);
    add({ day: l.day, shikibetsu: "13", parts: [{ lines: [si("180016110")], points: pts("180016110") }], basis: `B009 診療情報提供料（Ⅰ）（${key} へ。紹介先ごとに月1回）` });
  }

  // ===== 80 その他（評価料・物価対応料。1日につき1回）=====
  const bukka = bukkaFor(base).find((b) => !b.name.includes("看護・多職種協働"));
  for (const d of days) {
    add({ day: d, shikibetsu: "80", parts: [{ lines: [si("180737910")], points: pts("180737910") }], basis: "O003 入院ベースアップ評価料１０３（1日につき）" });
    add({ day: d, shikibetsu: "80", parts: [{ lines: [si("180712910")], points: pts("180712910") }], basis: "O000 看護職員処遇改善評価料３８（1日につき）" });
    if (bukka) add({ day: d, shikibetsu: "80", parts: [{ lines: [si(bukka.code)], points: bukka.points }], basis: "O100 入院物価対応料（急性期一般入院料４。1日につき1回）" });
  }

  // ===== 97 食事療養（円）=====
  // With diet orders: count each served meal from the orders (1日3食まで、食止め・絶食は数えない、
  // 流動食のみ・特別食は食事ごと). Without them: the meals recorded in the daily record.
  const diets = (input.diets ?? []).filter((x) => x.patientId === p.id);
  if (diets.length) {
    const futan = MEAL_FUTAN[input.mealClass ?? "一般"];
    const reviews = new Set<string>();
    for (const d of days) {
      const served = mealsServed(diets, orders, p.id, d, nowAbs, (e) => examAt(e.order as ImagingOrder | PhysioOrder, abs(e.day, e.time)));
      if (!served.length) continue;
      const parts: ClaimPart[] = [];
      for (const code of [MEAL_CODES.normal, MEAL_CODES.liquidOnly]) {
        const n = served.filter((m) => m.code === code).length;
        if (n) parts.push({ lines: [si(code, n)], points: pts(code) * n, yen: true });
      }
      const special = served.filter((m) => m.special);
      if (special.length) parts.push({ lines: [si(MEAL_CODES.special, special.length)], points: pts(MEAL_CODES.special) * special.length, yen: true });
      parts.push({ lines: [si(futan.code, served.length)], points: pts(futan.code) * served.length, yen: true });
      for (const m of served) if (m.review) reviews.add(`${m.note}：${m.review}`);
      add({
        day: d,
        shikibetsu: "97",
        parts,
        basis: `入院時食事療養（Ⅰ）${served.map((m) => `${m.meal}${m.code === MEAL_CODES.liquidOnly ? "（流動食のみ）" : ""}${m.special ? "＊" : ""}`).join("・")}（＊特別食加算：${[...new Set(special.map((m) => m.note))].join("、") || "なし"}）、標準負担額（${futan.label}）。食事オーダーから数える`,
      });
    }
    for (const r of reviews) issues.push({ level: "review", text: `特別食加算：${r}` });
  } else for (const d of days) {
    const rec = input.daily.find((r) => r.day === d);
    if (!rec?.meals || rec.meals === "絶食") continue;
    const served = rec.meals.filter((m) => m !== null).length;
    if (!served) continue;
    // 記載要領: 食事療養費（集計先970）、特別食加算、標準負担額（971）は別々の単位。数量データは1日の食数。
    const futan = MEAL_FUTAN[input.mealClass ?? "一般"];
    const parts: ClaimPart[] = [{ lines: [si("197000110", served)], points: pts("197000110") * served, yen: true }];
    if (o.specialDiet) parts.push({ lines: [si("197000470", served)], points: pts("197000470") * served, yen: true });
    parts.push({ lines: [si(futan.code, served)], points: pts(futan.code) * served, yen: true });
    add({
      day: d,
      shikibetsu: "97",
      parts,
      basis: `入院時食事療養（Ⅰ）${served}食${o.specialDiet ? "＋特別食加算" : ""}、標準負担額（${futan.label}）。実際に出した食数で数える`,
    });
  }

  // ===== 注射 =====
  const injections = orders.filter((e) => e.order.type === "injection");
  for (const d of days) {
    const lo = d * DAY;
    const hi = Math.min((d + 1) * DAY, d === 0 ? nowAbs + 1 : (d + 1) * DAY);
    const byRoute: Record<string, { lines: Map<string, number>; volume: number }> = {};
    for (const e of injections) {
      const ord = e.order as InjectionOrder;
      const doses = injectionDoses(e, lo, hi, nowAbs);
      if (doses.count === 0 && doses.bags === 0) continue;
      const route = ord.route;
      byRoute[route] ??= { lines: new Map(), volume: 0 };
      const bucket = byRoute[route];
      for (const it of ord.items) {
        const q = masterQuantity(it.drugCode, it.amount, it.unit);
        const official = officialDrugCode(it.drugCode);
        if (q === null || !official) {
          issues.push({ level: "review", text: `${findDrug(it.drugCode)?.name ?? it.drugCode} の量（${it.amount}${it.unit}）を医薬品マスターの単位に直せませんでした。` });
          continue;
        }
        const isFluidMain = doses.bags > 0;
        const qty = isFluidMain ? doses.bags * (q > 0 ? 1 : 0) * (ord.items.length === 1 ? 1 : q) : q * doses.count;
        bucket.lines.set(official, (bucket.lines.get(official) ?? 0) + qty);
        const vol = findDrug(it.drugCode)?.volumeMl;
        if (vol) bucket.volume += vol * (isFluidMain ? doses.bags : q * doses.count);
      }
    }
    for (const [route, b] of Object.entries(byRoute)) {
      const lines = [...b.lines.entries()].map(([code, q]) => iyLine(code, q));
      if (!lines.length) continue;
      if (route === "点滴静注") {
        const parts: ClaimPart[] = [];
        let basis = "G004 点滴注射";
        if (b.volume >= 500 && p.age >= 6) {
          parts.push({ lines: [si(CODES.点滴注射)], points: pts(CODES.点滴注射) });
          basis += `（1日の注射量 ${Math.round(b.volume)}mL ≧ 500mL のため手技料102点）`;
        } else basis += `（1日の注射量 ${Math.round(b.volume)}mL ＜ 500mL のため手技料なし、薬剤料のみ）`;
        parts.push(drugPart(lines));
        add({ day: d, shikibetsu: "33", parts, basis: `${basis}。その日の点滴の薬剤を1剤にまとめた（記載要領 キ(オ)）` });
      } else {
        const sk: Shikibetsu = route === "静注" ? "32" : "31";
        add({
          day: d,
          shikibetsu: sk,
          parts: [drugPart(lines)],
          basis: `${route}：入院中は手技料を算定せず、1日の薬剤料を合算（G000・G001 注1、通知）`,
        });
      }
    }
  }

  // ===== 40 処置 =====
  const procs = orders.filter((e) => e.order.type === "procedure");
  const procOf = (e: OrderEntry) => e.order as ProcedureOrder;
  // 重度褥瘡処置 (J001-4 注1): 初回の処置の日から起算して2月を経過するまで。それ以降は創傷処置の例による。
  const severeStarts = procs
    .filter((e) => procOf(e).code === "PROC-ULCER" && procOf(e).depth && isSevereUlcer(procOf(e).depth!))
    .map((e) => Math.floor(procInterval(e, nowAbs).from / DAY));
  const severeFirst = severeStarts.length ? Math.min(...severeStarts) : null;
  const severeLast = severeFirst === null ? null : lastDayOfMonths(input.today, cal(severeFirst), 2);
  const fmt = (d: number) => `${cal(d).m}/${cal(d).d}`;
  for (const d of days) {
    const lo = d * DAY;
    const hi = (d + 1) * DAY;
    const done = (e: OrderEntry) => procEvents(e, lo, hi, nowAbs).filter((t) => t <= nowAbs);

    // J024 酸素吸入（1日につき）＋ J201 酸素加算. Oxygen used = the ordered flow × the minutes it ran.
    let liters = 0;
    const flows: string[] = [];
    for (const e of procs) {
      const o = procOf(e);
      if (o.code !== "PROC-O2" || !o.o2) continue;
      const min = procMinutes(e, lo, hi, nowAbs);
      if (min <= 0) continue;
      liters += o.o2.lpm * min;
      flows.push(`${o.o2.lpm}L/分 × ${min.toLocaleString("ja-JP")}分`);
    }
    if (liters > 0) {
      const ox = oxygenPart(liters);
      add({
        day: d,
        shikibetsu: "40",
        parts: [{ lines: [si(PROC_CODES.酸素吸入)], points: pts(PROC_CODES.酸素吸入) }, ox.part],
        basis: `J024 酸素吸入（1日につき）＋ J201 酸素加算。${flows.join(" ＋ ")} = ${liters.toLocaleString("ja-JP")}L。${ox.formula}。流量は指示の値で計算（実際の流量は看護記録で確かめる）`,
      });
    }

    // J018 喀痰吸引（1日につき）: days it was done.
    if (procs.some((e) => procOf(e).code === "PROC-SUCTION" && done(e).length > 0)) {
      add({ day: d, shikibetsu: "40", parts: [{ lines: [si(PROC_CODES.喀痰吸引)], points: pts(PROC_CODES.喀痰吸引) }], basis: "J018 喀痰吸引（1日につき。何回行っても1日1回）" });
    }

    let woundOrders = 0;
    for (const e of procs) {
      const o = procOf(e);
      const times = done(e);
      if (o.code === "PROC-FOLEY") {
        const { from } = procInterval(e, nowAbs);
        if (from < lo || from >= hi || from > nowAbs) continue;
        const cat = tokkiItem(TOKKI_CODES["MAT-FOLEY16"]);
        const yen = cat?.price ?? 0;
        add({
          day: d,
          shikibetsu: "40",
          parts: [
            { lines: [si(PROC_CODES.留置カテーテル設置)], points: pts(PROC_CODES.留置カテーテル設置) },
            {
              lines: [{ record: "TO", code: TOKKI_CODES["MAT-FOLEY16"], name: cat?.name ?? TOKKI_CODES["MAT-FOLEY16"], quantity: 1, unit: "本", unitCode: "007", product: CATHETER.name.replace(/（.*）$/, "") }],
              points: materialPoints(yen),
            },
          ],
          basis: `J063 留置カテーテル設置（挿入した日）＋ J400 特定保険医療材料（${cat?.name ?? ""} ${yen}円 ÷ 10 = ${materialPoints(yen)}点）。留置中の日は算定しない`,
        });
        continue;
      }
      if (o.code === "PROC-CVC") {
        const { from } = procInterval(e, nowAbs);
        if (from < lo || from >= hi || from > nowAbs) continue;
        const picc = (o.site ?? "").includes("PICC");
        const code = picc ? PROC_CODES.末梢留置型中心静脈カテーテル挿入 : PROC_CODES.中心静脈カテーテル挿入;
        const mat = picc ? TOKKI_CODES["MAT-PICC"] : TOKKI_CODES["MAT-CVC"];
        const item = tokkiItem(mat);
        const yen = item?.price ?? 0;
        add({
          day: d,
          shikibetsu: "33",
          parts: [
            { lines: [si(code)], points: pts(code) },
            { lines: [{ record: "TO", code: mat, name: item?.name ?? mat, quantity: 1, unit: "本", unitCode: "007", product: picc ? "PICC カテーテル 4Fr（架空の院内採用品）" : "CVカテーテル トリプルルーメン 7Fr（架空の院内採用品）" }], points: materialPoints(yen) },
          ],
          basis: `${picc ? "G005-3 末梢留置型中心静脈注射用カテーテル挿入" : "G005-2 中心静脈注射用カテーテル挿入"}（${o.site ?? ""}。挿入に伴う検査・画像診断は所定点数に含む）＋ 材料（${item?.name ?? ""} ${yen.toLocaleString("ja-JP")}円 → ${materialPoints(yen)}点）`,
        });
        continue;
      }
      if (times.length === 0) continue;
      if (o.code === "PROC-TEKIBEN") {
        add({ day: d, shikibetsu: "40", parts: [{ lines: [si(PROC_CODES.摘便)], points: pts(PROC_CODES.摘便) }], times: times.length, basis: "J022-2 摘便（行った回数ごと）" });
        continue;
      }
      if (o.code === "PROC-GE") {
        const drug = o.drug ? procDrugPart(o.drug.code, o.drug.amount, issues) : null;
        if (drug) add({ day: d, shikibetsu: "40", parts: [drug.part], times: times.length, basis: `浣腸の手技は基本診療料に含まれ算定できない。薬剤料のみ（第9部 通則 通知3）。${drug.formula}` });
        continue;
      }
      if (o.code === "PROC-WOUND" || o.code === "PROC-ULCER") {
        woundOrders++;
        const area = o.area!;
        const severe = o.code === "PROC-ULCER" && !!o.depth && isSevereUlcer(o.depth) && severeLast !== null && d <= severeLast;
        const perDay = severe; // J001-4 は1日につき。J000 は手術後の患者以外は行った回数ごと
        const n = perDay ? 1 : times.length;
        const drug = o.drug ? procDrugPart(o.drug.code, o.drug.amount * (perDay ? times.length : 1), issues) : null;
        const parts: ClaimPart[] = [];
        let basis: string;
        if (area === "lt100") {
          issues.push({
            level: "excluded",
            text: `${o.site ?? ""}の${o.code === "PROC-ULCER" ? "褥瘡処置" : "創傷処置"}は100cm²未満のため算定しません。入院中は手術後の患者（手術日から14日まで）だけ算定できる区分です（J000 注1・J001-4 注2）。`,
          });
          basis = "100cm²未満のため手技料は算定しない（J000 注1）。";
        } else {
          const code = severe ? PROC_CODES.重度褥瘡処置[area] : PROC_CODES.創傷処置[area];
          parts.push({ lines: [si(code)], points: pts(code) });
          basis = severe
            ? `J001-4 重度褥瘡処置（${o.depth}、${AREA_LABEL[area]}、1日につき）。初回 ${fmt(severeFirst!)} から2月を経過するまで（${fmt(severeLast!)} まで）`
            : `J000 創傷処置（${AREA_LABEL[area]}、行った回数ごと）${o.code === "PROC-ULCER" && o.depth && isSevereUlcer(o.depth) ? `。重度褥瘡処置の期間（${fmt(severeLast!)} まで）を過ぎたため創傷処置の例による（J001-4 注1）` : o.code === "PROC-ULCER" ? `。${o.depth ?? ""}は重度褥瘡処置の対象（D3〜D5）でない` : ""}`;
        }
        if (drug) {
          if (drug.part.points > 0) parts.push(drug.part);
          basis += `　薬剤：${drug.formula}`;
        }
        if (parts.length) add({ day: d, shikibetsu: "40", parts, times: n, basis });
      }
    }
    if (woundOrders > 1) {
      issues.push({
        level: "review",
        text: `${fmt(d)} に創傷処置・褥瘡処置が${woundOrders}つあります。同じ疾病（またはそれに起因する病変）なら面積を合算して1つの区分で算定し、同じ部位なら1つだけ算定します（通知 J000(2)(3)）。人が確かめてください。`,
      });
    }
  }

  // ===== 70 画像診断・60 生理検査 =====
  // A study counts as done once its time has passed (no 実施 record in this prototype).
  const studies = orders
    .filter((e) => (e.order.type === "imaging" || e.order.type === "physio") && e.status !== "中止")
    .map((e) => ({ e, at: examAt(e.order as ImagingOrder | PhysioOrder, abs(e.day, e.time)) }))
    .filter(({ at }) => at <= nowAbs && inMonth.has(Math.floor(at / DAY)))
    .sort((a, b) => a.at - b.at);
  let ctMriCount = 0;
  for (const { e, at } of studies) {
    const d = Math.floor(at / DAY);
    if (e.order.type === "physio") {
      const o = e.order as PhysioOrder;
      const m = findPhysio(o.test);
      if (!m) continue;
      add({ day: d, shikibetsu: "60", parts: [{ lines: m.codes.map((c) => si(c)), points: m.codes.reduce((s, c) => s + pts(c), 0) }], basis: `${m.name}（生体検査。${o.place}）` });
      if (o.test === "PHY-SPIRO") add({ day: d, shikibetsu: "60", parts: [{ lines: [si(RESP_JUDGE)], points: pts(RESP_JUDGE) }], basis: "D205 呼吸機能検査等判断料（月1回）" });
      continue;
    }
    const o = e.order as ImagingOrder;
    const region = findRegion(o.region);
    if (o.modality === "X線" || o.modality === "ポータブルX線") {
      // 第2節 通則3: 同一部位・同時に2枚以上 → 2〜5枚目は写真診断・撮影とも100分の50、6枚目以降は算定しない
      const films = Math.min(o.views?.length ?? 1, 5);
      const k = 1 + 0.5 * (films - 1);
      const diag = region?.xray === "ロ" ? IC.写真診断ロ : IC.写真診断イ;
      const lines = [si(diag), ...(films > 1 && diag === IC.写真診断イ ? [si(IC.写真診断イ2枚以上)] : []), si(IC.単純撮影デジタル), ...(films > 1 ? [si(IC.単純撮影デジタル2枚以上)] : []), si(IC.電子画像管理加算単純)];
      const points = Math.round(pts(diag) * k) + Math.round(pts(IC.単純撮影デジタル) * k) + pts(IC.電子画像管理加算単純);
      add({
        day: d,
        shikibetsu: "70",
        parts: [{ lines, points }],
        basis: `E001 写真診断（${region?.xray ?? "イ"}：${region?.name ?? o.region}）＋ E002 撮影（デジタル）＋ 電子画像管理加算（単純撮影）。${films}枚${films > 1 ? `（2枚目から100分の50：(${pts(diag)} + ${pts(IC.単純撮影デジタル)}) × ${k}）` : ""}${o.modality === "ポータブルX線" ? "。病室で撮影" : ""}`,
      });
      if ((o.views?.length ?? 1) > 1 && region?.xray === "ロ") issues.push({ level: "review", text: `${region.name}の2枚目の写真診断（ロ）の記録の仕方を確かめてください。` });
      continue;
    }
    // CT / MRI
    ctMriCount++;
    const ct = o.modality === "CT";
    const base = ct ? IC.CT : IC.MRI;
    const contrast = o.contrast && o.contrast !== "単純" ? (ct ? IC.CT造影 : IC.MRI造影) : null;
    const second = ctMriCount >= 2;
    const shootLines = [si(base), ...(second ? [si(IC.CTMRI2回目減算)] : []), ...(contrast ? [si(contrast)] : [])];
    // 通則2: 同一月の2回目以降は撮影の所定点数の100分の80（造影剤使用加算は減算に含めない扱い。下の確かめるを参照）
    const shoot = (second ? Math.round(pts(base) * 0.8) : pts(base)) + (contrast ? pts(contrast) : 0);
    add({
      day: d,
      shikibetsu: "70",
      parts: [
        { lines: shootLines, points: shoot },
        { lines: [si(IC.電子画像管理加算断層)], points: pts(IC.電子画像管理加算断層) },
      ],
      basis: `${ct ? "E200 CT撮影（16列以上64列未満）" : "E202 MRI撮影（1.5テスラ以上3テスラ未満）"}${contrast ? "＋造影剤使用加算" : ""}${second ? "（同一月2回目以降：撮影料は100分の80。第3節 通則2）" : ""} ＋ 電子画像管理加算（一連につき）。${region?.name ?? ""}`,
    });
    // E203 コンピューター断層診断: 種類・回数にかかわらず月1回
    if (!second) add({ day: d, shikibetsu: "70", parts: [{ lines: [si(IC.断層診断)], points: pts(IC.断層診断) }], basis: "E203 コンピューター断層診断（CT・MRI の種類・回数にかかわらず月1回）" });
    if (second && contrast) issues.push({ level: "review", text: "同一月2回目以降のCT・MRIの減算（100分の80）を、造影剤使用加算にも掛けるかを確かめてください（この試作は撮影料だけに掛けています）。" });
    if (contrast) issues.push({ level: "review", text: "造影剤（薬剤料）はこの試作では入っていません。使った造影剤を足してください。" });
  }

  // ===== 60 検体検査 =====
  const labOrders = orders.filter((e) => e.order.type === "lab" && e.status !== "中止");
  const collections = labOrders
    .map((e) => ({ e, o: e.order as LabOrder }))
    .filter(({ o }) => abs(o.collect.day, o.collect.time) <= nowAbs)
    .sort((a, b) => abs(a.o.collect.day, a.o.collect.time) - abs(b.o.collect.day, b.o.collect.time));
  // 入院時初回加算: only the first blood collection of the admission, and only if it had ≥10 items
  const firstChem = collections.find(({ o }) => o.collect.day >= p.admittedOn && expandLab(o.codes).some((c) => shinryoItem(c)?.bundleGroup === "1"));
  const judgedGroups = new Map<string, number>(); // group → first day in month
  let vcmLevels: number[] = [];
  // BNP・NT-proBNP（・ANP）: 2つ以上を最初の検査の日から1週間以内に行ったら主たるもの1つ（D008 通知(7)イ）。
  // 主たるもの = 点数の高い方として、もう一方を外す。各実施日は摘要に書く（同ウ）.
  const NP = ["160162350", "160181250"];
  const npDone = collections.flatMap(({ e, o }) => expandLab(o.codes).filter((c) => NP.includes(c)).map((c) => ({ id: e.id, code: c, day: o.collect.day })));
  const npDropped = new Set<string>(); // `${orderId}|${code}`
  for (const a of npDone) {
    const near = npDone.filter((b) => b.code !== a.code && Math.abs(b.day - a.day) < 7);
    if (!near.length) continue;
    const all = [a, ...near];
    const main = [...all].sort((x, y) => pts(y.code) - pts(x.code))[0];
    for (const x of all) if (x.code !== main.code) npDropped.add(`${x.id}|${x.code}`);
  }
  if (npDropped.size) {
    issues.push({ level: "excluded", text: "BNP と NT-proBNP を1週間以内に行ったので、主たるもの（点数の高い方）だけを算定し、もう一方を外しました（D008 通知(7)イ）。" });
    issues.push({ level: "review", text: "BNP・NT-proBNP の各実施日を摘要欄に書いてください（D008 通知(7)ウ）。" });
  }
  for (const { e, o: lab } of collections) {
    const d = lab.collect.day;
    if (lab.codes.includes("LAB-VCM")) vcmLevels.push(d);
    if (!inMonth.has(d)) continue;
    const codes = [...new Set(expandLab(lab.codes))].filter((c) => !npDropped.has(`${e.id}|${c}`));
    if (!codes.length) continue;
    const bundle = codes.filter((c) => shinryoItem(c)?.bundleGroup === "1");
    const cultures: string[] = codes.filter((c) => c === "160058610" || c === "160058410");
    const others = codes.filter((c) => !bundle.includes(c) && !cultures.includes(c));
    for (const c of codes) {
      const g = shinryoItem(c)?.judgeKind === "1" ? shinryoItem(c)!.judgeGroup : "";
      if (g && g !== "0" && !judgedGroups.has(g)) judgedGroups.set(g, d);
    }
    if (bundle.length >= 5) {
      const n = bundle.length;
      let points = seikagaku1Points(n)!;
      const lines = bundle.map((c) => si(c));
      let basis = `D007 生化学的検査（Ⅰ）を1回の採血で${n}項目（${n >= 10 ? "10項目以上 103点" : n >= 8 ? "8・9項目 99点" : "5〜7項目 93点"}。告示 D007 注）`;
      if (n >= 10 && firstChem?.e.id === e.id) {
        lines.push(si("160161510"));
        points += pts("160161510");
        basis += "＋入院時初回加算 20点（入院後初回の検査で10項目以上）";
      }
      add({ day: d, shikibetsu: "60", parts: [{ lines, points }], basis });
    } else if (bundle.length) {
      add({ day: d, shikibetsu: "60", parts: [{ lines: bundle.map((c) => si(c)), points: bundle.reduce((s, c) => s + pts(c), 0) }], basis: "D007 生化学的検査（Ⅰ）（4項目以下は各点数の合計）" });
    }
    // 項目数で点数が決まる包括（内分泌 D008・腫瘍マーカー D009・出血凝固 D006）: 1回の採血の項目数で
    const grouped = new Map<string, string[]>();
    for (const c of others) {
      const g = shinryoItem(c)?.bundleGroup ?? "0";
      if (OTHER_BUNDLES[g]) grouped.set(g, [...(grouped.get(g) ?? []), c]);
    }
    const bundledAway = new Set<string>();
    for (const [g, list] of grouped) {
      const rule = OTHER_BUNDLES[g];
      const points = rule.points(list.length);
      if (points === null) continue;
      list.forEach((c) => bundledAway.add(c));
      add({ day: d, shikibetsu: "60", parts: [{ lines: list.map((c) => si(c)), points }], basis: `${rule.name}を1回の採血で${list.length}項目（${points}点。告示 ${rule.kubun} 注）` });
    }
    for (const g of grouped.keys()) if (!OTHER_BUNDLES[g]) issues.push({ level: "review", text: `包括対象検査の群${g}の点数はまだ組んでいません。確かめてください。` });
    const singles = others.filter((c) => !bundledAway.has(c));
    if (singles.length) {
      add({ day: d, shikibetsu: "60", parts: [{ lines: singles.map((c) => si(c)), points: singles.reduce((s, c) => s + pts(c), 0) }], basis: "検体検査（各項目の点数の合計）" });
    }
    for (const c of cultures) {
      const sets = c === "160058610" ? Number(/(\d)\s*セット/.exec(lab.comment ?? "")?.[1] ?? 1) : 1;
      const lines = [si(c)];
      let points = pts(c);
      if (c === "160058610") {
        lines.push(si(CODES.嫌気性培養加算));
        points += pts(CODES.嫌気性培養加算);
      }
      add({
        day: d,
        shikibetsu: "60",
        parts: [{ lines, points }],
        times: sets,
        basis:
          c === "160058610"
            ? `D018 細菌培養同定検査（血液）＋注1 嫌気性培養加算。${sets}か所から採取したので${sets}回（通知 D018(1)エ）`
            : "D018 細菌培養同定検査（泌尿器）",
      });
    }
  }
  // 細菌薬剤感受性検査: from culture reports with susceptibility, on the collection day
  for (const c of input.cultures) {
    if (!c.susceptibility?.length || !inMonth.has(c.collectedOn)) continue;
    add({ day: c.collectedOn, shikibetsu: "60", parts: [{ lines: [si("160146210")], points: pts("160146210") }], basis: "D019 細菌薬剤感受性検査（1菌種）。検体を採った日に算定" });
    if (!judgedGroups.has("6")) judgedGroups.set("6", c.collectedOn);
  }
  // 判断料: 区分ごとに月1回、初回検査の実施日に（D026 注1、通知(2)）
  const judgeCode: Record<string, string> = {
    "1": CODES.尿糞便等検査判断料,
    "2": CODES.血液学的検査判断料,
    "3": CODES.生化学的検査１判断料,
    "4": CODES.生化学的検査２判断料,
    "5": CODES.免疫学的検査判断料,
    "6": CODES.微生物学的検査判断料,
  };
  let firstJudgeDay: number | null = null;
  for (const [g, d] of [...judgedGroups.entries()].sort((a, b) => a[1] - b[1])) {
    const code = judgeCode[g];
    if (!code || !inMonth.has(d)) continue;
    add({ day: d, shikibetsu: "60", parts: [{ lines: [si(code)], points: pts(code) }], basis: `D026 ${shinryoItem(code)?.name}（月1回、その月の初回検査の日）` });
    if (firstJudgeDay === null || d < firstJudgeDay) firstJudgeDay = d;
  }
  if (firstJudgeDay !== null) {
    add({ day: firstJudgeDay, shikibetsu: "60", parts: [{ lines: [si("160182770")], points: pts("160182770") }], basis: "D026 注4 検体検査管理加算（Ⅱ）（入院中の患者、月1回。判断料を算定する月）" });
  }
  issues.push({ level: "info", text: "採血料（D400）は「入院中の患者以外の患者についてのみ算定する」ため、入院中の採血には算定しません。" });

  // ===== 13 医学管理 =====
  vcmLevels = vcmLevels.filter((d) => d >= p.admittedOn).sort((a, b) => a - b);
  const levelsThisMonth = vcmLevels.filter((d) => inMonth.has(d));
  if (levelsThisMonth.length) {
    const d = levelsThisMonth[0];
    // 記載要領 別表Ⅰ 項番75: the patient group (カ: 入院中でアミノ配糖体抗生物質等を数日間以上) and 初回の算定年月.
    const firstMonth = cal(vcmLevels[0]);
    const lines: ClaimLine[] = [
      {
        ...si(CODES.特定薬剤治療管理料１),
        comments: [
          comment("820100568"),
          comment("840000538", toZenkakuDigits(`${String(firstMonth.y - 2018).padStart(2, "0")}${String(firstMonth.m).padStart(2, "0")}`), `令和${firstMonth.y - 2018}年${firstMonth.m}月`),
        ],
      },
    ];
    // 4月目以降は100分の50（注4。初回の算定月から暦月で数える）.
    const [cy, cm] = input.month.split("-").map(Number);
    const sinceFirst = cy * 12 + cm - (firstMonth.y * 12 + firstMonth.m);
    const base = sinceFirst >= 3 ? "113000510" : CODES.特定薬剤治療管理料１;
    if (base !== CODES.特定薬剤治療管理料１) lines[0] = { ...lines[0], ...si(base), comments: lines[0].comments };
    let points = pts(base);
    let basis = `B001「2」特定薬剤治療管理料１（月1回、その月の初回の測定日${sinceFirst >= 3 ? "。4月目以降は100分の50" : ""}）`;
    const firstMonthNow = inMonth.has(vcmLevels[0]);
    if (firstMonthNow && levelsThisMonth.length >= 2) {
      lines.push(si("113029170"));
      points += pts("113029170");
      basis += "＋注7 バンコマイシン（初回の月に複数回測定して投与量を精密に管理。1回に限り、注8 は算定しない）";
    } else if (firstMonthNow) {
      lines.push(si("113000770"));
      points += pts("113000770");
      basis += "＋注8 初回月加算（第1回目）";
      issues.push({ level: "review", text: "バンコマイシンの濃度を同じ月にもう1回測ると、注8（初回月加算280点）ではなく注7（530点）になります。測定が増えたら算定し直してください。" });
    }
    add({ day: d, shikibetsu: "13", parts: [{ lines, points }], basis });
  }
  for (const y of o.yakuzaiShido) {
    if (!inMonth.has(y.day)) continue;
    const code = y.kind === "1" ? "113010810" : "120001610";
    add({ day: y.day, shikibetsu: "13", parts: [{ lines: [si(code)], points: pts(code) }], basis: "B008 薬剤管理指導料（週1回かつ月4回）" });
  }

  // ===== 投薬（入院）=====
  const rx = orders.filter((e) => e.order.type === "prescription");
  const homeDrugs = rx.filter((e) => (e.order as PrescriptionOrder).category === "持参薬");
  if (homeDrugs.length) issues.push({ level: "info", text: `持参薬（${homeDrugs.length}件）は患者が持ってきた薬なので、薬剤料・調剤料を算定しません。` });
  const dispensingDays = new Set<number>();
  for (const d of days) {
    const lo = d * DAY;
    const hi = d === 0 ? nowAbs + 1 : (d + 1) * DAY;
    const byTimings = new Map<string, Map<string, number>>();
    for (const e of rx) {
      const ord = e.order as PrescriptionOrder;
      if (ord.category === "持参薬") continue;
      const official = officialDrugCode(ord.drugCode);
      if (!official) continue;
      if (ord.timings.length) {
        const taken = scheduledTaken(e, lo, hi, nowAbs);
        if (!taken.length) continue;
        const key = taken.join("・");
        if (!byTimings.has(key)) byTimings.set(key, new Map());
        const m = byTimings.get(key)!;
        m.set(official, (m.get(official) ?? 0) + ord.amount * taken.length);
        dispensingDays.add(d);
      } else {
        // 頓服: 1回分ごと
        const uses = (ord.prnUses ?? []).filter((u) => u.day === d && abs(u.day, u.time) <= nowAbs);
        if (!uses.length) continue;
        add({ day: d, shikibetsu: "22", parts: [drugPart([iyLine(official, ord.amount)])], times: uses.length, basis: "F200 薬剤（屯服は1回分ごと）" });
        dispensingDays.add(d);
      }
    }
    for (const [timings, m] of byTimings) {
      add({
        day: d,
        shikibetsu: "21",
        parts: [drugPart([...m.entries()].map(([code, q]) => iyLine(code, q)))],
        basis: `F200 薬剤（内服、服用時点が同じ薬は1剤：${timings}。1剤1日分）`,
      });
    }
  }
  for (const d of dispensingDays) add({ day: d, shikibetsu: "24", parts: [{ lines: [si(CODES.調剤料入院)], points: pts(CODES.調剤料入院) }], basis: "F000 調剤料（入院、1日につき）" });
  const firstDispense = [...dispensingDays].sort((a, b) => a - b)[0];
  if (firstDispense !== undefined) {
    if (o.yakuzaiShido.some((y) => inMonth.has(y.day))) issues.push({ level: "info", text: "薬剤管理指導料を算定した月なので、調剤技術基本料は算定しません（F500 注4）。" });
    else add({ day: firstDispense, shikibetsu: "27", parts: [{ lines: [si(CODES.調剤技術基本料入院)], points: pts(CODES.調剤技術基本料入院) }], basis: "F500 調剤技術基本料（入院、月1回）" });
  }

  // ===== rules from the master and the 電子点数表 =====
  const kept = applyRules(acts, { hospitalDay, cal, issues, base, days: new Set(days) });

  // ===== merge identical days into receipt entries =====
  const merged = mergeActs(kept, cal);
  const totalPoints = merged.filter((a) => a.shikibetsu !== "97").reduce((s, a) => s + a.parts.reduce((t, x) => t + x.points, 0) * a.count, 0);
  const meals = { ryoyoYen: 0, futanYen: 0 };
  for (const a of merged.filter((x) => x.shikibetsu === "97")) {
    for (const part of a.parts) {
      const futan = shinryoItem(part.lines[0].code)?.sumInpatient === "971";
      if (futan) meals.futanYen += part.points * a.count;
      else meals.ryoyoYen += part.points * a.count;
    }
  }
  const meta = masterMeta();
  return {
    month: input.month,
    from: days.length ? cal(days[0]).d : null,
    to: days.length ? cal(days[days.length - 1]).d : null,
    days: days.length,
    acts: merged,
    totalPoints,
    meals,
    issues: issues.filter((x, i) => issues.findIndex((y) => y.level === x.level && y.text === x.text) === i),
    sources: meta.sources
      .filter((s) => s.key !== "c" && s.key !== "t")
      .map((s) => {
        const dated = s.files.find((f) => /\d{8}/.test(f));
        const ymd = dated ? /(\d{4})(\d{2})(\d{2})/.exec(dated)! : null;
        return ymd ? `${s.label}（${ymd[1]}年${Number(ymd[2])}月${Number(ymd[3])}日版）` : `${s.label}（${s.url.split("/").pop()}）`;
      }),
  };
}

// ---------- helpers ----------

/** J201 酸素加算: the oxygen line, the 補正率 line, and the points (on the last line). */
function oxygenPart(liters: number): { part: ClaimPart; formula: string } {
  const tank = tokkiItem(TOKKI_CODES.酸素CE);
  const corr = tokkiItem(TOKKI_CODES.酸素補正率);
  const cap = tank?.price ?? 0;
  const unit = Math.min(HOSPITAL.oxygen.purchaseYenPerL, cap);
  const yen = oxygenYen(unit, liters);
  const points = materialPoints(yen);
  const L = Math.round(liters * 1000) / 1000;
  return {
    part: {
      lines: [
        { record: "TO", code: TOKKI_CODES.酸素CE, name: tank?.name ?? TOKKI_CODES.酸素CE, quantity: L, unit: tank?.unitName ?? "Ｌ", unitPrice: unit },
        { record: "TO", code: TOKKI_CODES.酸素補正率, name: corr?.name ?? TOKKI_CODES.酸素補正率 },
      ],
      points,
    },
    formula: `酸素の価格 ${unit}円/L（購入単価。告示の単価 ${cap}円/L 以下）× ${L.toLocaleString("ja-JP")}L × 補正率1.3 = ${yen.toLocaleString("ja-JP")}円 → ${points}点`,
  };
}

/** A 処置薬剤 part (J300: 15円以下は算定しない). Null when the drug has no official code. */
function procDrugPart(code: string, amount: number, issues: ClaimIssue[]): { part: ClaimPart; formula: string } | null {
  const d = findProcDrug(code);
  const official = officialDrugCode(code);
  const q = d ? masterQuantity(code, amount, d.unit) : null;
  if (!d || !official || q === null) {
    issues.push({ level: "review", text: `処置の薬剤 ${d?.name ?? code} を医薬品マスターに結べませんでした。` });
    return null;
  }
  const line = iyLine(official, q);
  const yen = line.yen ?? 0;
  const points = procDrugPoints(yen);
  if (points === 0) issues.push({ level: "info", text: `${line.name} ${q}${line.unit ?? ""}は ${Math.round(yen * 100) / 100}円で15円以下のため、薬剤料を算定しません（J300 注1）。` });
  return { part: { lines: [line], points }, formula: `${line.name} ${q}${line.unit ?? ""} = ${Math.round(yen * 100) / 100}円 → ${points}点` };
}

/**
 * The last day (offset from today) of a period of n months counted from day `first` (民法143条:
 * 応当日の前日、応当日がなければその月の末日).
 */
function lastDayOfMonths(today: string, first: { y: number; m: number; d: number }, n: number): number {
  const ym = first.m - 1 + n;
  const lastOfMonth = new Date(Date.UTC(first.y, ym + 1, 0)).getUTCDate();
  const end = first.d > lastOfMonth ? Date.UTC(first.y, ym, lastOfMonth) : Date.UTC(first.y, ym, first.d) - 86_400_000;
  return Math.round((end - parseDate(today)) / 86_400_000);
}

/** 食事療養標準負担額 (1食あたり、令和8年6月〜) by the patient's 区分, with its 診療行為コード. */
export const MEAL_FUTAN: Record<MealClass, { code: string; label: string }> = {
  一般: { code: "197000810", label: "一般" },
  "低所得Ⅱ（90日以下）": { code: "197000910", label: "低所得Ⅱ・90日以下" },
  "低所得Ⅱ（90日超）": { code: "197001010", label: "低所得Ⅱ・90日超" },
  低所得Ⅰ: { code: "197001110", label: "低所得Ⅰ" },
  指定難病等: { code: "197003310", label: "指定難病・小児慢性特定疾病" },
};

/**
 * 項目数で点数が決まる包括（令和8年度告示）. 群 = 医科診療行為マスター 列16. 生化学的検査（Ⅰ）は seikagaku1Points.
 * The master holds only which group an item counts in; the points per number of items come from the 点数表.
 */
export const OTHER_BUNDLES: Record<string, { name: string; kubun: string; points: (n: number) => number | null }> = {
  "2": { name: "内分泌学的検査（D008 の12〜51）", kubun: "D008", points: (n) => (n < 3 ? null : n <= 5 ? 410 : n <= 7 ? 623 : 900) },
  "5": { name: "腫瘍マーカー（D009 の2〜36）", kubun: "D009", points: (n) => (n < 2 ? null : n === 2 ? 230 : n === 3 ? 290 : 385) },
  "6": { name: "出血・凝固検査（D006 の14〜34）", kubun: "D006", points: (n) => (n < 3 ? null : n <= 4 ? 530 : 722) },
};

/**
 * D007 生化学的検査（Ⅰ）注: 1回に採取した血液で「1」〜「8」の検査を5項目以上 → 項目数で決まる点数
 * （イ 5〜7項目 93点／ロ 8・9項目 99点／ハ 10項目以上 103点。令和8年度告示）。
 * The master has no code for these bundled points (only which tests count, col 16), so they live here.
 */
export function seikagaku1Points(items: number): number | null {
  if (items < 5) return null;
  return items >= 10 ? 103 : items >= 8 ? 99 : 93;
}

function expandLab(codes: string[]): string[] {
  return codes.flatMap((c) => {
    const set = findSet(c);
    if (set) return set.labCodes.flatMap((x) => LAB_CODES[x] ?? []);
    if (findLab(c)) return LAB_CODES[c] ?? [];
    return [];
  });
}

/** Doses of an injection order inside [lo, hi): timed doses, or bags of a continuous fluid. */
function injectionDoses(e: OrderEntry, lo: number, hi: number, nowAbs: number): { count: number; bags: number } {
  const o = e.order as InjectionOrder;
  const from = abs(o.start.day, o.start.time ?? e.time);
  let to = Infinity;
  if (e.status === "中止") to = e.stoppedOn === undefined || e.stoppedOn === 0 ? nowAbs : (e.stoppedOn + 1) * DAY;
  if (o.days) to = Math.min(to, from + o.days * DAY);
  const start = Math.max(lo, from);
  const end = Math.min(hi, to);
  if (end <= start) return { count: 0, bags: 0 };
  if (o.schedule.kind === "every_hours") {
    const step = o.schedule.hours * 60;
    let n = 0;
    for (let t = from; t < end; t += step) if (t >= lo) n++;
    return { count: n, bags: 0 };
  }
  if (o.schedule.kind === "once") return { count: from >= lo && from < hi ? 1 : 0, bags: 0 };
  const main = findDrug(o.items[0]?.drugCode ?? "");
  if (main?.kind === "輸液") {
    // continuous fluid: bags hung for the minutes it ran that day
    const perDay = o.schedule.count;
    return { count: 0, bags: Math.ceil((perDay * (end - start)) / DAY - 1e-9) };
  }
  // N times a day without clock times: proportion of the day the order ran
  return { count: Math.max(1, Math.round((o.schedule.count * (end - start)) / DAY)), bags: 0 };
}

/** Scheduled oral timings taken inside [lo, hi). */
function scheduledTaken(e: OrderEntry, lo: number, hi: number, nowAbs: number): string[] {
  const o = e.order as PrescriptionOrder;
  const times: Record<string, string> = WARD_RULES.medTimes;
  const firstTiming = o.start.timing ?? o.timings[0];
  const from = abs(o.start.day, times[firstTiming]);
  let to = o.days ? from + o.days * DAY : Infinity;
  if (e.status === "中止") to = Math.min(to, e.stoppedOn === undefined || e.stoppedOn === 0 ? nowAbs : (e.stoppedOn + 1) * DAY);
  const day = Math.floor(lo / DAY);
  return o.timings.filter((t) => {
    const at = abs(day, times[t]);
    return at >= from && at < to && at >= lo && at < hi;
  });
}

interface RuleCtx {
  hospitalDay: (d: number) => number;
  cal: ReturnType<typeof calendar>;
  issues: ClaimIssue[];
  base: string;
  days: Set<number>;
}

/** 入外・施設基準・入院基本料加算の組み合わせ・算定回数・背反 (master + 電子点数表). */
function applyRules(acts: DayAct[], ctx: RuleCtx): DayAct[] {
  const siCodes = (a: DayAct) => a.parts.flatMap((p) => p.lines.filter((l) => l.record === "SI").map((l) => l.code));
  let out = acts.filter((a) => {
    for (const code of siCodes(a)) {
      const it = shinryoItem(code);
      if (!it) {
        ctx.issues.push({ level: "excluded", text: `コード ${code} が医科診療行為マスターにありません。`, codes: [code] });
        return false;
      }
      if (it.inOut === "2" || (it.sumInpatient === "0" && a.shikibetsu !== "97")) {
        ctx.issues.push({ level: "excluded", text: `${it.name} は入院外だけの項目なので算定しません（入外適用区分）。`, codes: [code] });
        return false;
      }
      if (!meetsStandards(it.shisetsu)) {
        ctx.issues.push({ level: "excluded", text: `${it.name} は施設基準の届出がないため算定しません。`, codes: [code] });
        return false;
      }
    }
    return true;
  });

  // 入院基本料テーブル: which 加算 this 入院料 may take, and 加算識別 duplicates
  const allowed = allowedKasan(ctx.base);
  const kasanSeen = new Map<string, string>();
  out = out.filter((a) => {
    if (a.shikibetsu !== "90") return true;
    for (const code of siCodes(a)) {
      const it = shinryoItem(code)!;
      if (code === ctx.base || it.chuCode === shinryoItem(ctx.base)!.chuCode) continue; // 入院料 and its 注加算
      if (!it.kubun.startsWith("A2")) continue;
      const ident = allowed.get(code);
      if (ident === undefined) {
        ctx.issues.push({ level: "excluded", text: `${it.name} はこの入院料に加算できません（入院基本料テーブル）。`, codes: [code] });
        return false;
      }
      // Same 加算識別 = alternatives of one 加算 (e.g. 14日以内 / 15日以上): only one of them a day.
      const key = `${a.day}|${ident}`;
      const prev = kasanSeen.get(key);
      if (prev && prev !== code) {
        ctx.issues.push({ level: "choose", text: `${shinryoItem(prev)?.name} と ${it.name} は同じ加算識別で、どちらか一方しか算定できません。`, codes: [prev, code] });
        return false;
      }
      kasanSeen.set(key, code);
    }
    return true;
  });

  // 背反（1日につき・同一週内・同一月内）。The table may hold a pair in one direction only.
  const relation = (window: HaihanWindow, a: string, b: string) => {
    const h = haihan(window, a, b);
    if (h) return h;
    const r = haihan(window, b, a);
    if (!r) return null;
    return { ...r, kubun: (r.kubun === 1 ? 2 : r.kubun === 2 ? 1 : 3) as 1 | 2 | 3 };
  };
  const WINDOW_WORD: Record<HaihanWindow, string> = { day: "同じ日", week: "同じ週", month: "同じ月", same: "同時" };
  const dropped = new Set<DayAct>();
  const check = (list: DayAct[], window: HaihanWindow) => {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const A = list[i];
        const B = list[j];
        if (dropped.has(A) || dropped.has(B)) continue;
        for (const a of siCodes(A)) {
          for (const b of siCodes(B)) {
            if (a === b || dropped.has(A) || dropped.has(B)) continue;
            const h = relation(window, a, b);
            if (!h) continue;
            if (h.kubun === 3) {
              ctx.issues.push({ level: "choose", text: `${shinryoItem(a)?.name} と ${shinryoItem(b)?.name} は${WINDOW_WORD[window]}に併せて算定できません。どちらかを選んでください。`, codes: [a, b] });
              continue;
            }
            const [keep, drop] = h.kubun === 1 ? [a, b] : [b, a];
            dropped.add(h.kubun === 1 ? B : A);
            ctx.issues.push({ level: "excluded", text: `${shinryoItem(drop)?.name} は ${shinryoItem(keep)?.name} と${WINDOW_WORD[window]}には算定できないため外しました（背反）。`, codes: [keep, drop] });
          }
        }
      }
    }
  };
  const groupBy = (key: (a: DayAct) => number) => {
    const m = new Map<number, DayAct[]>();
    for (const a of out) m.set(key(a), [...(m.get(key(a)) ?? []), a]);
    return [...m.values()];
  };
  for (const list of groupBy((a) => a.day)) check(list, "day");
  for (const list of groupBy((a) => a.day - ctx.cal(a.day).dow)) check(list, "week");
  check(out, "month");
  out = out.filter((a) => !dropped.has(a));

  // 算定回数: 日 / 月 / 入院初日 / 入院中 / 週
  const counts = new Map<string, number>();
  out = out.filter((a) => {
    for (const code of siCodes(a)) {
      for (const lim of kaisuLimits(code)) {
        const c = ctx.cal(a.day);
        const key =
          lim.unit === "121" ? `${code}|d${a.day}` : lim.unit === "131" ? `${code}|m${c.y}-${c.m}` : lim.unit === "138" ? `${code}|w${a.day - c.dow}` : lim.unit === "133" || lim.unit === "132" ? `${code}|adm` : null;
        if (!key) continue;
        const n = (counts.get(key) ?? 0) + (a.times ?? 1);
        if (lim.unit === "132" && ctx.hospitalDay(a.day) !== 1) {
          ctx.issues.push({ level: "excluded", text: `${shinryoItem(code)?.name} は入院初日だけ算定できます。`, codes: [code] });
          return false;
        }
        if (n > lim.limit && lim.limit > 0) {
          ctx.issues.push({ level: "excluded", text: `${shinryoItem(code)?.name} は算定回数の上限（${lim.unit === "121" ? "1日" : lim.unit === "131" ? "1月" : lim.unit === "138" ? "1週" : "入院中"} ${lim.limit}回）を超えるため外しました。`, codes: [code] });
          return false;
        }
        if (lim.tokurei && !counts.has(key)) ctx.issues.push({ level: "review", text: `${shinryoItem(code)?.name} には算定回数の特例条件があります（電子点数表に中身はありません）。告示・通知で確かめてください。`, codes: [code] });
        counts.set(key, n);
      }
    }
    return true;
  });
  return out;
}

const ORDER: Shikibetsu[] = ["13", "21", "22", "24", "27", "31", "32", "33", "40", "60", "70", "80", "90", "92", "97"];

/** Merge identical day entries into receipt entries (count = days × times). */
function mergeActs(acts: DayAct[], cal: ReturnType<typeof calendar>): ClaimAct[] {
  const map = new Map<string, ClaimAct>();
  for (const a of acts) {
    const key = `${a.shikibetsu}|${JSON.stringify(a.parts)}`;
    const times = a.times ?? 1;
    const dom = cal(a.day).d;
    const cur = map.get(key);
    if (cur) {
      cur.count += times;
      cur.days[dom] = (cur.days[dom] ?? 0) + times;
    } else {
      map.set(key, { shikibetsu: a.shikibetsu, parts: a.parts, count: times, days: { [dom]: times }, basis: a.basis });
    }
  }
  return [...map.values()].sort((x, y) => ORDER.indexOf(x.shikibetsu) - ORDER.indexOf(y.shikibetsu) || Math.min(...Object.keys(x.days).map(Number)) - Math.min(...Object.keys(y.days).map(Number)));
}

export type { HistoryEntry };
