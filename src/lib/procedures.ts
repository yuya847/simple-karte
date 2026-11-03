// Ward procedures (処置) of a FICTIONAL hospital: the items a doctor can order, what each one
// needs to be complete, and the ward's clock times. The official codes and points live in the
// billing side (billing/codes.ts → 医科診療行為マスター); nothing here is a fee.

import type { ConsultOrder, GuideOrder, HdOrder, LeaveOrder, RehabOrder, TxOrder } from "./types";

/** 範囲 of a wound / pressure ulcer, as the 点数表 divides it (cm²). */
export type AreaClass = "lt100" | "100-500" | "500-3000" | "3000-6000" | "ge6000";

export const AREA_LABEL: Record<AreaClass, string> = {
  lt100: "100cm²未満",
  "100-500": "100〜500cm²未満",
  "500-3000": "500〜3,000cm²未満",
  "3000-6000": "3,000〜6,000cm²未満",
  ge6000: "6,000cm²以上",
};

export const AREA_CLASSES = Object.keys(AREA_LABEL) as AreaClass[];

/** Area in cm² → its class. */
export function areaClassOf(cm2: number): AreaClass {
  if (cm2 < 100) return "lt100";
  if (cm2 < 500) return "100-500";
  if (cm2 < 3000) return "500-3000";
  if (cm2 < 6000) return "3000-6000";
  return "ge6000";
}

/**
 * Read a size said in words: "12×10センチ", "12cm x 10cm", "8かける6", "150平方センチ", "5cm四方", "30×20mm".
 * Returns null when the words do not give a size (e.g. "手のひら大"): the doctor then picks a class.
 */
export function parseSize(said: string): { lengthCm: number; widthCm: number } | { areaCm2: number } | null {
  const t = said.normalize("NFKC").replace(/\s/g, "").replace(/センチメートル|センチ/g, "cm").replace(/ミリメートル|ミリ/g, "mm");
  const area = /(\d+(?:\.\d+)?)(?:平方cm|cm2|cm²|㎠)/.exec(t);
  if (area) return { areaCm2: Number(area[1]) };
  const sq = /(\d+(?:\.\d+)?)(cm|mm)?四方/.exec(t);
  if (sq) {
    const n = Number(sq[1]) / (sq[2] === "mm" ? 10 : 1);
    return { lengthCm: n, widthCm: n };
  }
  const lw = /(\d+(?:\.\d+)?)(cm|mm)?(?:×|x|X|\*|かける)(\d+(?:\.\d+)?)(cm|mm)?/.exec(t);
  if (lw) {
    const unit = lw[4] ?? lw[2] ?? "cm";
    const k = unit === "mm" ? 10 : 1;
    return { lengthCm: Number(lw[1]) / k, widthCm: Number(lw[3]) / k };
  }
  return null;
}

/** DESIGN-R®2020 の深さ（Depth）. */
export type UlcerDepth = "d0" | "d1" | "d2" | "D3" | "D4" | "D5" | "DDTI" | "DU";

export const DEPTH_LABEL: Record<UlcerDepth, string> = {
  d0: "d0 皮膚損傷・発赤なし",
  d1: "d1 持続する発赤",
  d2: "d2 真皮までの損傷",
  D3: "D3 皮下組織までの損傷",
  D4: "D4 皮下組織を越える損傷",
  D5: "D5 関節腔・体腔に至る損傷",
  DDTI: "DDTI 深部損傷褥瘡（DTI）疑い",
  DU: "DU 壊死組織で深さ判定が不能",
};

export const DEPTHS = Object.keys(DEPTH_LABEL) as UlcerDepth[];

/** 重度褥瘡処置（J001-4）の対象: 皮下組織に至る褥瘡（DESIGN-R2020 D3, D4, D5）. 通知 J001-4(1). */
export const isSevereUlcer = (d: UlcerDepth) => d === "D3" || d === "D4" || d === "D5";

export type O2Device = "鼻カニュラ" | "簡易酸素マスク" | "リザーバー付きマスク";

/**
 * Flow each device is used at on this ward (L/分). A ward rule of the fictional hospital,
 * used only to ask the doctor when a flow falls outside it. The doctor decides.
 */
export const O2_DEVICES: Record<O2Device, { min: number; max: number; aliases: string[] }> = {
  鼻カニュラ: { min: 0.5, max: 6, aliases: ["カニュラ", "カヌラ", "鼻カヌラ", "nasal", "経鼻"] },
  簡易酸素マスク: { min: 5, max: 10, aliases: ["マスク", "酸素マスク", "フェイスマスク"] },
  リザーバー付きマスク: { min: 6, max: 15, aliases: ["リザーバー", "リザーバーマスク", "リザーバ"] },
};

export const O2_DEVICE_NAMES = Object.keys(O2_DEVICES) as O2Device[];

/** How often a procedure is done. */
export type ProcSchedule =
  | { kind: "per_day"; count: number } // 1日N回（時刻は病棟の約束）
  | { kind: "every_days"; days: number } // 隔日 = 2
  | { kind: "prn"; condition?: string } // 必要時
  | { kind: "once" } // 1回
  | { kind: "continuous" }; // 継続（酸素、留置）

export function procScheduleText(s: ProcSchedule): string {
  switch (s.kind) {
    case "per_day":
      return `1日${s.count}回`;
    case "every_days":
      return s.days === 2 ? "隔日" : `${s.days}日ごと`;
    case "prn":
      return `必要時${s.condition ? `（${s.condition}）` : ""}`;
    case "once":
      return "1回";
    case "continuous":
      return "継続";
  }
}

export interface ProcMaster {
  code: string;
  name: string;
  /** What the order must say to be complete. */
  needs: ("site" | "area" | "depth" | "o2" | "hd" | "tx" | "rehab" | "consult" | "leave" | "guide")[];
  /** Schedules a doctor may choose for this item. The first is never preselected. */
  schedules: ProcSchedule[];
  /** For 留置 and 酸素: the order runs until stopped; its schedule is always 継続. */
  continuous?: boolean;
  /** A drug or material the procedure always uses, once per time it is done. */
  uses?: { code: string; amount: number };
  /** Drugs that may be used with it (amount per time asked). */
  drugs?: string[];
  /** Sites offered as choices when the site is missing. */
  sites?: string[];
  aliases: string[];
}

export const PROC_DRUGS: { code: string; name: string; unit: string; aliases: string[] }[] = [
  { code: "TOP-GEBEN", name: "スルファジアジン銀クリーム1%（ゲーベン）", unit: "g", aliases: ["ゲーベン", "ゲーベンクリーム"] },
  { code: "TOP-UPASTA", name: "精製白糖・ポビドンヨード軟膏（ユーパスタ）", unit: "g", aliases: ["ユーパスタ"] },
  { code: "TOP-VASELINE", name: "白色ワセリン", unit: "g", aliases: ["ワセリン", "白色ワセリン", "プロペト"] },
  { code: "TOP-GE120", name: "グリセリン浣腸液50% 120mL", unit: "個", aliases: ["GE", "グリセリン浣腸", "浣腸液"] },
];

/** The urinary catheter the fictional hospital stocks (a 特定保険医療材料). */
export const CATHETER = { code: "MAT-FOLEY16", name: "2管バルーンカテーテル 16Fr（架空の院内採用品）" };

export const PROCEDURES: ProcMaster[] = [
  {
    code: "PROC-O2",
    name: "酸素吸入",
    needs: ["o2"],
    schedules: [{ kind: "continuous" }],
    continuous: true,
    aliases: ["酸素", "O2", "酸素投与", "オーツー"],
  },
  {
    code: "PROC-SUCTION",
    name: "喀痰吸引",
    needs: [],
    schedules: [{ kind: "prn" }, { kind: "per_day", count: 3 }],
    aliases: ["吸引", "痰の吸引", "サクション", "口鼻腔吸引"],
  },
  {
    code: "PROC-ULCER",
    name: "褥瘡処置",
    needs: ["site", "area", "depth"],
    schedules: [{ kind: "per_day", count: 1 }, { kind: "per_day", count: 2 }, { kind: "every_days", days: 2 }],
    drugs: ["TOP-GEBEN", "TOP-UPASTA", "TOP-VASELINE"],
    sites: ["仙骨部", "尾骨部", "右大転子部", "左大転子部", "右踵部", "左踵部"],
    aliases: ["褥瘡", "床ずれ", "じょくそう", "デクビ"],
  },
  {
    code: "PROC-WOUND",
    name: "創傷処置",
    needs: ["site", "area"],
    schedules: [{ kind: "per_day", count: 1 }, { kind: "per_day", count: 2 }, { kind: "every_days", days: 2 }],
    drugs: ["TOP-GEBEN", "TOP-UPASTA", "TOP-VASELINE"],
    aliases: ["創処置", "ガーゼ交換", "包交", "包帯交換", "傷の処置"],
  },
  {
    code: "PROC-FOLEY",
    name: "膀胱留置カテーテル",
    needs: [],
    schedules: [{ kind: "continuous" }],
    continuous: true,
    aliases: ["バルーン", "尿カテ", "尿道カテーテル", "フォーリー", "膀胱カテーテル", "尿道バルーン"],
  },
  {
    code: "PROC-CVC",
    name: "中心静脈カテーテル挿入",
    needs: ["site"],
    schedules: [{ kind: "continuous" }],
    continuous: true,
    sites: ["右内頸静脈", "左内頸静脈", "右鎖骨下静脈", "左鎖骨下静脈", "右大腿静脈", "左大腿静脈", "右上腕（PICC）", "左上腕（PICC）"],
    aliases: ["CV", "CVC", "中心静脈", "中心静脈カテーテル", "CVカテ", "PICC"],
  },
  {
    code: "PROC-TEKIBEN",
    name: "摘便",
    needs: [],
    schedules: [{ kind: "once" }, { kind: "prn" }],
    aliases: ["摘便"],
  },
  {
    code: "PROC-GE",
    name: "グリセリン浣腸",
    needs: [],
    schedules: [{ kind: "once" }, { kind: "prn" }],
    uses: { code: "TOP-GE120", amount: 1 },
    aliases: ["浣腸", "GE", "グリセリン浣腸"],
  },
  {
    code: "PROC-REHAB",
    name: "リハビリ処方",
    needs: ["rehab"],
    schedules: [{ kind: "per_day", count: 1 }],
    aliases: ["リハビリ", "リハ", "PT", "OT", "ST", "理学療法", "作業療法", "言語聴覚療法"],
  },
  {
    code: "PROC-CONSULT",
    name: "他科依頼",
    needs: ["consult"],
    schedules: [{ kind: "once" }],
    aliases: ["他科依頼", "他科診", "コンサルト", "対診", "紹介"],
  },
  {
    code: "PROC-LEAVE",
    name: "退院・外泊・外出",
    needs: ["leave"],
    schedules: [{ kind: "once" }],
    aliases: ["退院", "退院申込", "外泊", "外出"],
  },
  {
    code: "PROC-GUIDE",
    name: "指導の依頼",
    needs: ["guide"],
    schedules: [{ kind: "once" }],
    aliases: ["栄養指導", "栄養食事指導", "服薬指導", "退院指導"],
  },
  {
    code: "PROC-TX",
    name: "輸血",
    needs: ["tx"],
    schedules: [{ kind: "once" }],
    aliases: ["輸血", "赤血球", "RBC", "FFP", "血小板輸血", "PC", "濃厚血小板", "新鮮凍結血漿"],
  },
  {
    code: "PROC-HD",
    name: "血液透析（透析指示）",
    needs: ["hd"],
    schedules: [{ kind: "once" }, { kind: "every_days", days: 2 }],
    aliases: ["透析", "HD", "血液透析", "人工透析", "HDF", "ECUM", "透析指示"],
  },
];

// ---------------------------------------------------------------------------
// 透析指示（PROC-HD）: the choices on the order sheet, and the ultrafiltration rate worked out in code
// ---------------------------------------------------------------------------

export const HD_PURPOSES: HdOrder["purpose"][] = ["導入", "維持", "緊急"];
export const HD_METHODS: HdOrder["method"][] = ["HD", "オンラインHDF", "ECUM"];
export const HD_MINUTES = [120, 180, 240, 300];
export const HD_QB = [100, 150, 200, 250];
export const HD_MEMBRANES = [1.0, 1.3, 1.5, 1.8, 2.1];
export const HD_UF = [0, 0.5, 1, 1.5, 2, 2.5, 3];
export const HD_ACCESS = ["透析用カテーテル（右内頸静脈）", "透析用カテーテル（左内頸静脈）", "透析用カテーテル（大腿静脈）", "AVF（シャント）", "AVG（人工血管）"];
/** Amounts offered for each anticoagulant (the doctor may type another). */
export const HD_ANTICOAG: Record<HdOrder["anticoag"]["drug"], { initial?: { unit: string; choices: number[] }; hourly?: { unit: string; choices: number[] } }> = {
  ヘパリン: { initial: { unit: "単位", choices: [0, 500, 1000, 2000] }, hourly: { unit: "単位/時", choices: [250, 500, 750, 1000] } },
  ナファモスタット: { hourly: { unit: "mg/時", choices: [20, 30, 40, 50] } },
  なし: {},
};
/** 平均除水速度の目安. For maintenance dialysis; on the ward it is shown as a reference to weigh. */
export const HD_UF_RATE = { max: 15, source: "日本透析医学会「維持血液透析ガイドライン：血液透析処方」（2013）：平均除水速度 15mL/kg/時 以下" };

const hm = (m: number) => (m % 60 ? `${Math.floor(m / 60)}時間${m % 60}分` : `${m / 60}時間`);

/** 除水速度 = 除水量 ÷ 時間 ÷ 体重 (mL/kg/時), with the sum written out. */
export function hdUfRate(uf: number, minutes: number, weightKg: number): { rate: number; formula: string } {
  const rate = Math.round(((uf * 1000) / (minutes / 60) / weightKg) * 10) / 10;
  return { rate, formula: `${(uf * 1000).toLocaleString("ja-JP")}mL ÷ ${hm(minutes)} ÷ ${weightKg}kg = ${rate}mL/kg/時` };
}

/** "4時間　Qb 200mL/分　膜面積 1.5m²　ヘパリン 初回1000単位・持続500単位/時　除水 2L　DW 50kg　透析用カテーテル（右内頸静脈）" */
export function hdText(h: HdOrder): string {
  const a = HD_ANTICOAG[h.anticoag.drug];
  const ac =
    h.anticoag.drug === "なし"
      ? "抗凝固薬なし"
      : `${h.anticoag.drug} ${[a.initial && h.anticoag.initial !== null ? `初回${h.anticoag.initial.toLocaleString("ja-JP")}${a.initial.unit}` : null, a.hourly && h.anticoag.hourly !== null ? `持続${h.anticoag.hourly.toLocaleString("ja-JP")}${a.hourly.unit}` : null].filter(Boolean).join("・")}`;
  return [hm(h.minutes), `Qb ${h.qb}mL/分`, `膜面積 ${h.membrane.toFixed(1)}m²`, ac, `除水 ${h.uf}L`, h.dw !== null ? `DW ${h.dw}kg` : null, h.access].filter(Boolean).join("　");
}

// ---------------------------------------------------------------------------
// 輸血（PROC-TX）: blood products of the Japanese Red Cross as the fictional hospital stocks them, and
// the expected effect worked out in code with the formulas of the Ministry's guideline.
// ---------------------------------------------------------------------------

export const TX_USE = { label: "厚生労働省「血液製剤の使用指針」", url: "https://www.mhlw.go.jp/new-info/kobetu/iyaku/kenketsugo/5tekisei3b01.html" };
export const TX_DO = { label: "厚生労働省「輸血療法の実施に関する指針」（令和2年3月改正）", url: "https://www.mhlw.go.jp/new-info/kobetu/iyaku/kenketsugo/dl/5tekisei3a.pdf" };

export const TX_PRODUCTS: Record<TxOrder["product"], { name: string; short: string; units: { units: number; label: string; ml: number }[]; lab: string; labLabel: string }> = {
  RBC: {
    name: "照射赤血球液-LR「日赤」",
    short: "赤血球",
    units: [
      { units: 1, label: "1単位（約140mL）", ml: 140 },
      { units: 2, label: "2単位（約280mL）", ml: 280 },
      { units: 4, label: "4単位（2袋）", ml: 560 },
    ],
    lab: "Hb",
    labLabel: "Hb",
  },
  FFP: {
    name: "新鮮凍結血漿-LR「日赤」",
    short: "血漿（FFP）",
    units: [
      { units: 2, label: "240（2単位・約240mL）", ml: 240 },
      { units: 4, label: "480（4単位・約480mL）", ml: 480 },
      { units: 6, label: "240＋480（6単位）", ml: 720 },
    ],
    lab: "PT-INR",
    labLabel: "PT-INR",
  },
  PC: {
    name: "照射濃厚血小板「日赤」",
    short: "血小板",
    units: [
      { units: 10, label: "10単位（約200mL）", ml: 200 },
      { units: 15, label: "15単位（約250mL）", ml: 250 },
      { units: 20, label: "20単位（約250mL）", ml: 250 },
    ],
    lab: "Plt",
    labLabel: "Plt",
  },
};

export const txVolume = (o: Pick<TxOrder, "product" | "units">) => TX_PRODUCTS[o.product].units.find((u) => u.units === o.units)?.ml ?? 0;

/** The expected effect, with the sum written out (循環血液量 70mL/kg). */
export function txEffect(o: Pick<TxOrder, "product" | "units">, weightKg: number): { text: string; formula: string } {
  const bloodMl = weightKg * 70;
  if (o.product === "RBC") {
    // 1単位 (200mL 献血由来) は Hb 14〜15g/dL × 2dL ≒ 29g の Hb を含む（指針の例：2単位で 56〜60g）。
    const hb = o.units * 29;
    const rise = Math.round((hb / (bloodMl / 100)) * 10) / 10;
    return { text: `予測上昇 Hb 約 +${rise}g/dL`, formula: `${o.units}単位 × 約29g = 約${hb}g ÷ 循環血液量 ${weightKg}kg × 70mL/kg = ${(bloodMl / 100).toFixed(1)}dL = +${rise}g/dL` };
  }
  if (o.product === "PC") {
    // 10単位あたり 2.0×10¹¹ 個以上。予測血小板増加数(/µL) = 輸血血小板総数 ÷ (循環血液量(mL) × 10³) × 2/3
    const count = (o.units / 10) * 2.0e11;
    const rise = Math.round((count / (bloodMl * 1000)) * (2 / 3));
    return { text: `予測血小板増加数 約 +${(rise / 10000).toFixed(1)}万/µL`, formula: `${(count / 1e11).toFixed(1)}×10¹¹個 ÷ (${bloodMl.toLocaleString("ja-JP")}mL × 10³) × 2/3 = ${rise.toLocaleString("ja-JP")}/µL` };
  }
  const ml = txVolume(o);
  const lo = Math.round(weightKg * 8);
  const hi = Math.round(weightKg * 12);
  return { text: `${ml}mL（${(ml / weightKg).toFixed(1)}mL/kg）。凝固因子を20〜30%上げる量の目安は ${lo}〜${hi}mL`, formula: `${weightKg}kg × 8〜12mL/kg = ${lo}〜${hi}mL` };
}

/** How long it runs at the guideline's pace: about 1mL/分 for the first 15 minutes, then about 5mL/分. */
export function txMinutes(ml: number): { minutes: number; formula: string } {
  const after = Math.max(0, ml - 15);
  const minutes = 15 + Math.ceil(after / 5);
  return { minutes, formula: `最初の15分 15mL ＋ 残り ${after}mL ÷ 5mL/分 = ${minutes}分` };
}

export const txText = (o: TxOrder) => `${TX_PRODUCTS[o.product].name} ${TX_PRODUCTS[o.product].units.find((u) => u.units === o.units)?.label ?? `${o.units}単位`}　${o.abo}型 Rh${o.rh === "+" ? "(+)" : "(−)"}`;

// リハビリ処方・他科依頼
export const REHAB_FIELDS: RehabOrder["field"][] = ["脳血管疾患等", "運動器", "呼吸器", "心大血管疾患", "廃用症候群"];
export const CONSULT_DEPTS = ["循環器内科", "呼吸器内科", "消化器内科", "腎臓内科", "脳神経内科", "整形外科", "外科", "泌尿器科", "皮膚科", "精神科", "リハビリテーション科"];
export const rehabText = (r: RehabOrder) => `${r.field}リハビリ（${r.therapists.join("・")}）　目標：${r.goal}${r.cautions ? `　注意：${r.cautions}` : ""}`;
export const consultText = (c: ConsultOrder) => `${c.dept}へ（${c.urgency}）：${c.question}`;
export const GUIDE_TO: Record<GuideOrder["kind"], "管理栄養士" | "薬剤師" | "看護師"> = { 栄養食事指導: "管理栄養士", 服薬指導: "薬剤師", 退院時の生活指導: "看護師" };
export const guideText = (g: GuideOrder) => `${g.kind}（${GUIDE_TO[g.kind]}へ）${g.note ? `：${g.note}` : ""}`;
export const leaveText = (l: LeaveOrder, fmtDay: (d: number) => string) =>
  `${l.kind}　${fmtDay(l.from.day)} ${l.from.time}${l.back ? `〜${fmtDay(l.back.day)} ${l.back.time}` : ""}　${l.destination}${l.note ? `　${l.note}` : ""}`;

export function findProc(code: string): ProcMaster | undefined {
  return PROCEDURES.find((p) => p.code === code);
}

export function findProcDrug(code: string) {
  return PROC_DRUGS.find((d) => d.code === code);
}

/** Ward rules of the fictional hospital for procedures done at set times. */
export const PROC_RULES = {
  /** Clock time of each time in "1日N回". */
  times: { 1: ["10:00"], 2: ["10:00", "18:00"], 3: ["06:00", "14:00", "22:00"] } as Record<number, string[]>,
} as const;

export function procTimes(count: number): string[] {
  return PROC_RULES.times[count] ?? Array.from({ length: count }, (_, i) => `${String(Math.floor((i * 24) / count)).padStart(2, "0")}:00`);
}
