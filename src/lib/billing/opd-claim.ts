import { totalPrescriptionPart } from "./total-prescription";
// 外来の1回の受診の算定 (出来高, 医科, 令和8年度): what the visit's orders come to in points, for the
// window (会計). Server only: every point is read from the official 医科診療行為マスター (master-items.ts),
// the lab 実施料 from lab-points.ts, the 薬剤料 from the 医薬品マスター. Rules this prototype applies are
// named in each act's `basis`; what it does not claim is listed in `excluded` so the window can say so.
// Nothing about the patient is assumed: 加算 that depend on the situation (時間外・乳幼児・一般名処方 など)
// are left out and named.

import { buildOpdVisit, OPD_CODES } from "./opd-visit";
import { findOralDrug, findDrug } from "../master";
import { examAt, findPhysio, findRegion, type ImagingOrder, type PhysioOrder } from "../exams";
import type { RxLine } from "../national/rx-lines";
import { AREA_LABEL, findProc, findProcDrug, isSevereUlcer } from "../procedures";
import { minutesOf } from "../dates";
import type { HistoryEntry, InjectionOrder, LabOrder, OrderEntry, ProcedureOrder } from "../types";
import { CODES, IMAGING_CODES as IC, PROC_CODES, RESP_JUDGE } from "./codes";
import { drugPoints, masterQuantity, officialDrugCode, procDrugPoints } from "./drug";
import { labPoints } from "./lab-points";
import { iyakuItem, shinryoItem, topicalDispensingItem } from "./master-items";
import type { ClaimAct, ClaimIssue, ClaimLine, ClaimPart, Shikibetsu } from "./model";
import { masterMeta } from "../masters/server";

/** 診療行為コード of the outpatient items (医科診療行為マスター 2026-11-02 版; the points are read from it). */
export { OPD_CODES } from "./opd-visit";

export { OPD_CLAIM_SOURCES } from "./opd-claim-sources";

export interface OpdClaimInput {
  /** Today "YYYY-MM-DD" and the time now "HH:MM". */
  today: string;
  nowTime: string;
  visit: { id: string; name: string; age: number; kind: "初診" | "再診"; department: string };
  /** The visit's orders (the chart's record of the visit). */
  entries: HistoryEntry[];
  /** 院外処方せん issued at this visit (confirmed), line by line. */
  rx: { items: RxLine[] }[];
  specificDisease?: boolean;
  outpatientManagement?: boolean;
}

export interface OpdClaim {
  month: string;
  /** Day of month of the visit. */
  day: number;
  acts: ClaimAct[];
  totalPoints: number;
  issues: ClaimIssue[];
  /** What this prototype does not claim for an outpatient visit (shown as is). */
  excluded: string[];
  sources: string[];
}

const DAY = 1440;
const abs = (day: number, time: string) => day * DAY + minutesOf(time);

function si(code: string, quantity?: number): ClaimLine {
  const it = shinryoItem(code);
  return { record: "SI", code, name: it?.name ?? code, quantity };
}
const pts = (code: string): number => shinryoItem(code)?.points ?? 0;

function iyLine(officialCode: string, quantity: number): ClaimLine {
  const it = iyakuItem(officialCode);
  const q = Math.round(quantity * 1000) / 1000;
  return { record: "IY", code: officialCode, name: it?.name ?? officialCode, quantity: q, unit: it?.unit, yen: (it?.price ?? 0) * q };
}

/** The items of a visit this prototype leaves out of the outpatient claim, in plain words. */
export const OPD_NOT_CLAIMED = [
  "時間外・休日・深夜加算、乳幼児加算（受診の時刻と年齢で決まる加算）",
  "医学管理料（特定疾患療養管理料・生活習慣病管理料・診療情報提供料など）",
  "一般名処方加算（この試作では自動算定しない）",
  "院内処方の外用薬・調剤技術基本料（施設・当月の算定歴の確認が必要）",
  "リハビリテーション・手術・麻酔・輸血・透析・内視鏡・在宅医療",
  "画像診断の造影剤の薬剤料（放射線部の記録がないとき）、酸素の加算",
  "同じ月のほかの受診との重なり（判断料・管理加算・CT の2回目減算は月単位の決まり）",
];

export function calculateOpdClaim(input: OpdClaimInput): OpdClaim {
  const [y, m, d] = input.today.split("-").map(Number);
  const month = `${y}-${String(m).padStart(2, "0")}`;
  const nowAbs = abs(0, input.nowTime);
  const issues: ClaimIssue[] = [];
  const acts: ClaimAct[] = [];
  const add = (shikibetsu: Shikibetsu, parts: ClaimPart[], basis: string, count = 1) => acts.push({ shikibetsu, parts, count, days: { [d]: count }, basis });
  const one = (shikibetsu: Shikibetsu, codes: string[], basis: string, count = 1) => add(shikibetsu, [{ lines: codes.map((c) => si(c)), points: codes.reduce((s, c) => s + pts(c), 0) }], basis, count);
  const orders = input.entries.filter((e): e is OrderEntry => e.kind === "order" && e.status !== "中止");
  const age = input.visit.age;

  // ===== 70 画像診断・60 生理検査 (done once their time has passed; 放射線部's record wins when there is one) =====
  const studies = orders
    .filter((e) => (e.order.type === "imaging" || e.order.type === "physio") && !e.exam?.notDone)
    .map((e) => ({ e, at: e.exam ? (e.exam.done ? abs(e.exam.done.day, e.exam.done.time) : Infinity) : examAt(e.order as ImagingOrder | PhysioOrder, abs(e.day, e.time)) }));
  const notYet = studies.filter(({ at }) => at > nowAbs);
  for (const { e } of notYet) issues.push({ level: "info", text: `${e.order.type === "imaging" ? `${(e.order as ImagingOrder).modality} ${findRegion((e.order as ImagingOrder).region)?.name ?? ""}` : findPhysio((e.order as PhysioOrder).test)?.name ?? "生体検査"}はまだ実施の時刻になっていないので算定しません（実施後に会計をやり直してください）。` });
  const done = studies.filter(({ at }) => at <= nowAbs).sort((a, b) => a.at - b.at);
  let ctMri = 0;
  for (const { e } of done) {
    if (e.order.type === "physio") {
      const o = e.order as PhysioOrder;
      const pm = findPhysio(o.test);
      if (!pm) continue;
      one("60", pm.codes, `${pm.name}（生体検査）`);
      if (o.test === "PHY-SPIRO") one("60", [RESP_JUDGE], "D205 呼吸機能検査等判断料（月1回）");
      continue;
    }
    const o = e.order as ImagingOrder;
    const region = findRegion(o.region);
    if (o.modality === "X線" || o.modality === "ポータブルX線") {
      const films = Math.min(o.views?.length ?? 1, 5);
      const k = 1 + 0.5 * (films - 1);
      const diag = region?.xray === "ロ" ? IC.写真診断ロ : IC.写真診断イ;
      const lines = [si(diag), ...(films > 1 && diag === IC.写真診断イ ? [si(IC.写真診断イ2枚以上)] : []), si(IC.単純撮影デジタル), ...(films > 1 ? [si(IC.単純撮影デジタル2枚以上)] : []), si(IC.電子画像管理加算単純)];
      const points = Math.round(pts(diag) * k) + Math.round(pts(IC.単純撮影デジタル) * k) + pts(IC.電子画像管理加算単純);
      add("70", [{ lines, points }], `E001 写真診断（${region?.xray ?? "イ"}：${region?.name ?? o.region}）＋ E002 撮影（デジタル）＋ 電子画像管理加算（単純撮影）。${films}枚${films > 1 ? `（2枚目から100分の50：(${pts(diag)} + ${pts(IC.単純撮影デジタル)}) × ${k}）` : ""}`);
      continue;
    }
    ctMri++;
    const ct = o.modality === "CT";
    const base = ct ? IC.CT : IC.MRI;
    const used = e.exam ? !!e.exam.contrast : !!o.contrast && o.contrast !== "単純";
    const contrast = used ? (ct ? IC.CT造影 : IC.MRI造影) : null;
    const second = ctMri >= 2;
    const shoot = (second ? Math.round(pts(base) * 0.8) : pts(base)) + (contrast ? pts(contrast) : 0);
    add("70", [{ lines: [si(base), ...(second ? [si(IC.CTMRI2回目減算)] : []), ...(contrast ? [si(contrast)] : [])], points: shoot }, { lines: [si(IC.電子画像管理加算断層)], points: pts(IC.電子画像管理加算断層) }], `${ct ? "E200 CT撮影（16列以上64列未満）" : "E202 MRI撮影（1.5テスラ以上3テスラ未満）"}${contrast ? "＋造影剤使用加算" : ""}${second ? "（同一月2回目以降：撮影料は100分の80。第3節 通則2）" : ""} ＋ 電子画像管理加算（一連につき）。${region?.name ?? ""}`);
    if (!second) one("70", [IC.断層診断], "E203 コンピューター断層診断（CT・MRI の種類・回数にかかわらず月1回）");
    const agent = e.exam?.contrast;
    if (agent && iyakuItem(agent.code)) {
      const line = iyLine(agent.code, agent.count);
      const yen = line.yen ?? 0;
      if (procDrugPoints(yen) > 0) add("70", [{ lines: [line], points: procDrugPoints(yen) }], `E300 薬剤（造影剤）：${agent.name} ${agent.count}（薬価 ${yen.toLocaleString("ja-JP")}円 → (${yen} − 15) ÷ 10 の切り上げ ＋ 1 = ${procDrugPoints(yen)}点）。放射線部の記録から`);
    } else if (contrast) issues.push({ level: "review", text: "造影剤の薬剤料は放射線部の記録がないので入っていません。使った造影剤を確かめてください。" });
  }

  // ===== 40 処置 (what was done today; the time has to have passed) =====
  const procs = orders.filter((e) => e.order.type === "procedure");
  let anyProc = false;
  for (const e of procs) {
    const o = e.order as ProcedureOrder;
    const startAbs = abs(o.start.day, o.start.time ?? e.time);
    const doneTimes = (o.done ?? []).map((x) => abs(x.day, x.time)).filter((t) => t <= nowAbs);
    const n = Math.max(doneTimes.length, startAbs <= nowAbs ? 1 : 0);
    if (n === 0) {
      issues.push({ level: "info", text: `${findProc(o.code)?.name ?? o.code}はまだ行っていない時刻なので算定しません。` });
      continue;
    }
    const drugPart = (times: number): { part: ClaimPart; formula: string } | null => {
      if (!o.drug) return null;
      const dm = findProcDrug(o.drug.code);
      const official = officialDrugCode(o.drug.code);
      const q = dm ? masterQuantity(o.drug.code, o.drug.amount * times, dm.unit) : null;
      if (!dm || !official || q === null) {
        issues.push({ level: "review", text: `処置の薬剤 ${dm?.name ?? o.drug.code} を医薬品マスターに結べませんでした。` });
        return null;
      }
      const line = iyLine(official, q);
      const yen = line.yen ?? 0;
      const points = procDrugPoints(yen);
      return { part: { lines: [line], points }, formula: `${line.name} ${q}${line.unit ?? ""} = ${Math.round(yen * 100) / 100}円 → ${points}点${points === 0 ? "（15円以下は算定しない：J300 注1）" : ""}` };
    };
    switch (o.code) {
      case "PROC-WOUND":
      case "PROC-ULCER": {
        anyProc = true;
        const area = o.area ?? "lt100";
        const severe = o.code === "PROC-ULCER" && !!o.depth && isSevereUlcer(o.depth);
        const code = severe ? PROC_CODES.重度褥瘡処置[area] : PROC_CODES.創傷処置[area];
        const parts: ClaimPart[] = [{ lines: [si(code)], points: pts(code) }];
        const dp = drugPart(1);
        if (dp && dp.part.points > 0) parts.push(dp.part);
        add("40", parts, `${severe ? `J001-4 重度褥瘡処置（${o.depth}、${AREA_LABEL[area]}、1日につき）` : `J000 創傷処置（${AREA_LABEL[area]}）。外来では100cm²未満も算定できる（J000 注1 は入院中の患者の制限）`}${dp ? `　薬剤：${dp.formula}` : ""}`, severe ? 1 : n);
        break;
      }
      case "PROC-SUCTION":
        anyProc = true;
        one("40", [PROC_CODES.喀痰吸引], "J018 喀痰吸引（1日につき）");
        break;
      case "PROC-TEKIBEN":
        anyProc = true;
        one("40", [PROC_CODES.摘便], "J022-2 摘便（行った回数ごと）", n);
        break;
      case "PROC-O2":
        anyProc = true;
        one("40", [PROC_CODES.酸素吸入], "J024 酸素吸入（1日につき）。J201 酸素加算（使った量 × 単価）はこの試作の外来では入れていない");
        issues.push({ level: "review", text: "酸素吸入の酸素加算（J201）は、使った量がわかってから足してください（この試作の外来では入れていません）。" });
        break;
      case "PROC-GE": {
        const dp = drugPart(n);
        if (dp && dp.part.points > 0) add("40", [dp.part], `浣腸の手技は基本診療料に含まれ算定できない。薬剤料のみ（第9部 通則 通知3）。${dp.formula}`);
        break;
      }
      default:
        issues.push({ level: "excluded", text: `${findProc(o.code)?.name ?? o.code}はこの試作の外来では算定しません。` });
    }
  }

  // ===== 注射 (one dose today per order; 外来 bills the 手技料 unlike the ward) =====
  for (const e of orders.filter((x) => x.order.type === "injection")) {
    const ord = e.order as InjectionOrder;
    const startAbs = abs(ord.start.day, ord.start.time ?? e.time);
    if (startAbs > nowAbs) {
      issues.push({ level: "info", text: `${findDrug(ord.items[0]?.drugCode ?? "")?.name ?? "注射"}はまだ実施の時刻になっていないので算定しません。` });
      continue;
    }
    const lines: ClaimLine[] = [];
    let volume = 0;
    for (const it of ord.items) {
      const q = masterQuantity(it.drugCode, it.amount, it.unit);
      const official = officialDrugCode(it.drugCode);
      if (q === null || !official) {
        issues.push({ level: "review", text: `${findDrug(it.drugCode)?.name ?? it.drugCode} の量（${it.amount}${it.unit}）を医薬品マスターの単位に直せませんでした。` });
        continue;
      }
      lines.push(iyLine(official, q));
      const vol = findDrug(it.drugCode)?.volumeMl;
      if (vol) volume += vol * q;
    }
    if (!lines.length) continue;
    const yen = lines.reduce((s, l) => s + (l.yen ?? 0), 0);
    const drug: ClaimPart = { lines, points: drugPoints(yen) };
    if (ord.route === "点滴静注") {
      const big = volume >= 500 && age >= 6;
      const code = big ? OPD_CODES.点滴注射500以上 : OPD_CODES.点滴注射入院外500未満;
      add("33", [{ lines: [si(code)], points: pts(code) }, drug], `G004 点滴注射（1日につき。注射量 ${Math.round(volume)}mL ${big ? "≧ 500mL" : "＜ 500mL（入院外）"}）＋ 薬剤料`);
    } else if (ord.route === "静注") add("32", [{ lines: [si(OPD_CODES.静脈内注射)], points: pts(OPD_CODES.静脈内注射) }, drug], "G001 静脈内注射（1回につき）＋ 薬剤料");
    else add("31", [{ lines: [si(OPD_CODES.皮内皮下筋肉内注射)], points: pts(OPD_CODES.皮内皮下筋肉内注射) }, drug], `G000 皮内、皮下及び筋肉内注射（1回につき。${ord.route}）＋ 薬剤料`);
  }

  // ===== 60 検体検査 (実施料 from lab-points.ts; 判断料・採血料 here) =====
  const labs = orders.filter((e) => e.order.type === "lab").map((e) => ({ e, o: e.order as LabOrder }));
  const collected = labs.filter(({ o }) => abs(o.collect.day, o.collect.time) <= nowAbs);
  for (const { o } of labs.filter(({ o }) => abs(o.collect.day, o.collect.time) > nowAbs)) issues.push({ level: "info", text: `${o.collect.time} 採取の検体検査はまだ採っていないので算定しません。` });
  const judgeGroups = new Set<string>();
  const drawDays = new Set<number>();
  for (const { o } of collected) {
    const lp = labPoints(o.codes);
    drawDays.add(o.collect.day);
    const byBundle = new Map<string, { codes: string[]; alone: number }>();
    const singles: string[] = [];
    const seen = new Set<string>();
    for (const line of lp.lines) {
      if (line.note) issues.push({ level: "info", text: `${line.label}：${line.note}。` });
      for (const it of line.items) {
        if (seen.has(it.code)) continue;
        seen.add(it.code);
        const g = shinryoItem(it.code)?.judgeKind === "1" ? shinryoItem(it.code)!.judgeGroup : "";
        if (g && g !== "0") judgeGroups.add(g);
        if (it.bundle) {
          const b = byBundle.get(it.bundle) ?? { codes: [], alone: 0 };
          byBundle.set(it.bundle, { codes: [...b.codes, it.code], alone: b.alone + it.points });
        } else singles.push(it.code);
      }
    }
    for (const [g, b] of byBundle) {
      const bundle = lp.bundles.find((x) => x.group === g);
      const points = bundle?.points ?? null;
      add("60", [{ lines: b.codes.map((c) => si(c)), points: points ?? b.alone }], points !== null ? `${bundle!.name}：1回の採血で${b.codes.length}項目（まとめた点数 ${points}点）` : `${bundle?.name ?? `包括対象検査 群${g}`}：${b.codes.length}項目（まとめる数に届かないので各点数の合計）`);
    }
    if (singles.length) add("60", [{ lines: singles.map((c) => si(c)), points: singles.reduce((s, c) => s + pts(c), 0) }], "検体検査（各項目の点数の合計）");
  }
  const judgeCode: Record<string, string> = { "1": CODES.尿糞便等検査判断料, "2": CODES.血液学的検査判断料, "3": CODES.生化学的検査１判断料, "4": CODES.生化学的検査２判断料, "5": CODES.免疫学的検査判断料, "6": CODES.微生物学的検査判断料 };
  for (const g of [...judgeGroups].sort()) {
    const code = judgeCode[g];
    if (code) one("60", [code], `D026 ${shinryoItem(code)?.name}（月1回。同じ月に算定済みなら二重になるので確かめる）`);
  }
  if (judgeGroups.size) {
    one("60", [OPD_CODES.検体検査管理加算1], "D026 注4 検体検査管理加算（Ⅰ）（届出あり。判断料を算定する月に1回）");
    issues.push({ level: "review", text: "検体検査判断料と検体検査管理加算は月1回です。同じ月にこの患者が別の日にも受診していれば、算定済みかを確かめてください。" });
  }
  for (const day of drawDays) {
    void day;
    one("60", [OPD_CODES.血液採取静脈], "D400 血液採取 1 静脈（1日につき。入院中の患者以外）");
  }

  const plan = buildOpdVisit({ kind: input.visit.kind, entries: orders, legacy: input.rx, managementExcluded: done.length > 0 || anyProc, outpatientManagement: input.outpatientManagement });
  const { prescriptions, outside, inside } = plan;
  // ===== 処方箋料 (院外処方せん) =====
  if (outside.length) {
    const orals = new Set<string>();
    for (const r of outside) for (const it of r.items) if (it.timings.length) orals.add(it.drug);
    const many = orals.size >= 7;
    const code = many ? OPD_CODES.処方箋料7種類以上 : OPD_CODES.処方箋料その他;
    one("80", [code], `F400 処方箋料 ${many ? "1（7種類以上の内服薬）" : "3（その他）"}（交付1回につき。${outside.length}枚は同じ受診なので1回）。一般名処方加算はこの試作では入れていない`);
    if (outside.length > 1) issues.push({ level: "review", text: `処方せんを${outside.length}回に分けて出しています。同じ受診の処方せんは1回分の処方箋料です（まとめて1枚にしたか確かめる）。` });
  }

  if (inside.length) {
    const items = inside.flatMap((r) => r.items);
    one("80", [new Set(items.filter((i) => i.timings.length).map((i) => i.drug)).size >= 7 ? OPD_CODES.処方料7種類以上 : OPD_CODES.処方料その他], "F100 処方料（院内）");
    if (items.some(i => !i.administration)) one("24", [OPD_CODES.調剤料外来], "F000 調剤料（入院外・内服薬・屯服薬、1処方につき）");
    if (items.some(i => i.administration?.kind === "外用")) {
      const dispensing = topicalDispensingItem();
      if (dispensing) one("24", [dispensing.code], "F000 調剤料（外用薬・1回の処方に係る調剤）");
      else issues.push({ level: "review", text: "外用薬の調剤料の現行マスターを確認してください。" });
    }
    for (const r of inside) {
      const lines: ClaimLine[] = [];
      let days: number | null = null;
      for (const it of r.items) {
        if (it.administration) {
          const part = totalPrescriptionPart(it.drug, it.perDose ?? 0, it.unit, it.administration);
          if (part) add(it.administration.kind === "外用" ? "23" : "14", [part], `${it.administration.kind}（総量・1調剤）`);
          else issues.push({ level: "review", text: "外用・材料・自己注射の総量と単位を確認してください。" });
          continue;
        }
        const m = findOralDrug(it.drug);
        const q = m && it.perDose !== null ? masterQuantity(it.drug, it.perDose * (it.timings.length || 1), it.unit) : null;
        const code = officialDrugCode(it.drug);
        if (!code || q === null || !it.days) { issues.push({ level: "review", text: "院内処方の薬剤・量・日数を確認してください。薬剤料に含めていません。" }); continue; }
        days = it.days;
        lines.push(iyLine(code, q));
      }
      if (lines.length && days) add(r.items[0].timings.length ? "21" : "22", [{ lines, points: drugPoints(lines.reduce((sum, l) => sum + (l.yen ?? 0), 0)) }], "F200 薬剤料（同じ用法の1日量／屯服1回量の薬価から算出し日数／回数を乗じる）", days);
    }
  }
  if (prescriptions.length) {
    const long = plan.longPrescription;
    issues.push({ level: "choose", text: "特定疾患処方管理加算は、対象の主病・28日以上の処方・当月未算定を人が確認して選びます。7日分のみの処方は対象外です。" });
    if (input.specificDisease && long) one("80", [outside.length ? OPD_CODES.特定疾患院外 : OPD_CODES.特定疾患院内], "F100・F400 特定疾患処方管理加算（月1回。対象主病・処方期間・当月未算定を人が確認）");
    else if (input.specificDisease) issues.push({ level: "review", text: "28日以上の処方がないため、特定疾患処方管理加算は算定しません。" });
  }

  // ===== 11・12 初診料・再診料 =====
  if (input.visit.kind === "初診") one("11", plan.basicCodes, "A000 初診料");
  else {
    const codes = plan.basicCodes;
    const noKasan = done.length > 0 || anyProc;
    if (!noKasan) issues.push({ level: "choose", text: "外来管理加算の候補：計画的な医学管理を行い、併算定できない診療がないことを人が確認して選びます。" });
    one("12", codes, `A001 再診料（許可病床200床未満の病院）${noKasan ? "。外来管理加算は、処置・画像診断・生体検査を行った日は算定しない（A001 注8）" : input.outpatientManagement ? "＋注8 外来管理加算（人が確認して選択）" : "。外来管理加算は未選択"}`);
  }
  if (age < 6) issues.push({ level: "review", text: "6歳未満の乳幼児加算（初診・再診・処方箋料・注射など）はこの試作では入れていません。" });

  // 初診料・再診料 first, then the parts in the order of the 点数表.
  const order = ["11", "12", "13", "14", "21", "22", "23", "24", "27", "31", "32", "33", "40", "60", "70", "80", "90", "92", "97"];
  acts.sort((a, b) => order.indexOf(a.shikibetsu) - order.indexOf(b.shikibetsu));
  const totalPoints = acts.reduce((s, a) => s + a.parts.reduce((t, p) => t + p.points, 0) * a.count, 0);
  const meta = masterMeta();
  return {
    month,
    day: d,
    acts,
    totalPoints,
    issues: issues.filter((x, i) => issues.findIndex((y) => y.level === x.level && y.text === x.text) === i),
    excluded: OPD_NOT_CLAIMED,
    sources: meta.sources
      .filter((s) => s.key === "s" || s.key === "y")
      .map((s) => {
        const dated = s.files.find((f) => /\d{8}/.test(f));
        const ymd = dated ? /(\d{4})(\d{2})(\d{2})/.exec(dated)! : null;
        return ymd ? `${s.label}（${ymd[1]}年${Number(ymd[2])}月${Number(ymd[3])}日版）` : s.label;
      }),
  };
}
