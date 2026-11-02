// Inpatient 出来高 claim for one patient and one month (医科, 令和8年度).
//
// Every point comes from the official 医科診療行為マスター / 医薬品マスター; the rule tables come
// from the 医科電子点数表; the remaining rules follow the 告示 and 留意事項通知 (see docs and
// tests for the section each rule rests on). The engine never assumes a patient's condition:
// 加算 that depend on it come in through `options`, set by a person.

import { minutesOf } from "../dates";
import { findDrug, findLab, findSet, WARD_RULES } from "../master";
import type { HistoryEntry, InjectionOrder, LabOrder, OrderEntry, PrescriptionOrder } from "../types";
import { CODES, LAB_CODES } from "./codes";
import { drugPoints, masterQuantity, officialDrugCode } from "./drug";
import { HOSPITAL, meetsStandards } from "./facility";
import { bukkaFor, iyakuItem, shinryoItem } from "./master-items";
import type { ClaimAct, ClaimInput, ClaimIssue, ClaimLine, ClaimPart, ClaimResult, Shikibetsu } from "./model";
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

  // ===== 80 その他（評価料・物価対応料。1日につき1回）=====
  const bukka = bukkaFor(base).find((b) => !b.name.includes("看護・多職種協働"));
  for (const d of days) {
    add({ day: d, shikibetsu: "80", parts: [{ lines: [si("180737910")], points: pts("180737910") }], basis: "O003 入院ベースアップ評価料１０３（1日につき）" });
    add({ day: d, shikibetsu: "80", parts: [{ lines: [si("180712910")], points: pts("180712910") }], basis: "O000 看護職員処遇改善評価料３８（1日につき）" });
    if (bukka) add({ day: d, shikibetsu: "80", parts: [{ lines: [si(bukka.code)], points: bukka.points }], basis: "O100 入院物価対応料（急性期一般入院料４。1日につき1回）" });
  }

  // ===== 97 食事療養（円）=====
  for (const d of days) {
    const rec = input.daily.find((r) => r.day === d);
    if (!rec?.meals || rec.meals === "絶食") continue;
    const served = rec.meals.filter((m) => m !== null).length;
    if (!served) continue;
    const ryoyo: ClaimLine[] = [si("197000110", served)];
    let ryoyoYen = pts("197000110") * served;
    if (o.specialDiet) {
      ryoyo.push(si("197000470", served));
      ryoyoYen += pts("197000470") * served;
    }
    add({
      day: d,
      shikibetsu: "97",
      parts: [
        { lines: ryoyo, points: ryoyoYen, yen: true },
        { lines: [si("197000810", served)], points: pts("197000810") * served, yen: true },
      ],
      basis: `入院時食事療養（Ⅰ）${served}食${o.specialDiet ? "（特別食加算）" : ""}と標準負担額（一般）。実際に出した食数`,
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
  for (const { e, o: lab } of collections) {
    const d = lab.collect.day;
    if (lab.codes.includes("LAB-VCM")) vcmLevels.push(d);
    if (!inMonth.has(d)) continue;
    const codes = [...new Set(expandLab(lab.codes))];
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
    const otherGroups = new Map<string, number>();
    for (const c of others) {
      const g = shinryoItem(c)?.bundleGroup ?? "0";
      if (g !== "0") otherGroups.set(g, (otherGroups.get(g) ?? 0) + 1);
    }
    for (const [g, n] of otherGroups)
      if (n >= 2) issues.push({ level: "review", text: `包括対象検査の群${g}を1回の採血で${n}項目行っています。この群の項目数による点数はまだ組んでいないので、確かめてください。` });
    if (others.length) {
      add({ day: d, shikibetsu: "60", parts: [{ lines: others.map((c) => si(c)), points: others.reduce((s, c) => s + pts(c), 0) }], basis: "検体検査（各項目の点数の合計）" });
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
    const lines = [si(CODES.特定薬剤治療管理料１)];
    let points = pts(CODES.特定薬剤治療管理料１);
    let basis = "B001「2」特定薬剤治療管理料１（月1回、初回の測定日）";
    if (vcmLevels.length >= 2) {
      lines.push(si("113029170"));
      points += pts("113029170");
      basis += "＋注7 バンコマイシン（血中濃度を複数回測定して投与量を精密に管理。1回に限り）";
      issues.push({ level: "review", text: "特定薬剤治療管理料の注7（バンコマイシン530点）は入院中1回に限ります。前の月に算定していないか確かめてください。" });
    } else if (vcmLevels[0] === d) {
      lines.push(si("113000770"));
      points += pts("113000770");
      basis += "＋注8 初回月加算（第1回目）";
      issues.push({ level: "review", text: "バンコマイシンの濃度を2回以上測ると、注8（初回月加算280点）ではなく注7（530点）になります。測定が増えたら算定し直してください。" });
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
    meals.ryoyoYen += a.parts[0].points * a.count;
    meals.futanYen += (a.parts[1]?.points ?? 0) * a.count;
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

const ORDER: Shikibetsu[] = ["13", "21", "22", "24", "27", "31", "32", "33", "60", "80", "90", "92", "97"];

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
