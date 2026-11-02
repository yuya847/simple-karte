// Facility standards (施設基準) of the FICTIONAL hospital.
//
// The set mirrors what one real general hospital in Yokohama (一般 134床) has filed, per the
// public 届出受理医療機関名簿 of 関東信越厚生局 (令和8年9月1日現在). The hospital in this app
// stays fictional. Where the public list does not say which variant was filed (e.g. the staffing
// ratio of 急性期看護補助体制加算), a variant was chosen and is marked provisional.
//
// Codes are the 施設基準コード of the official master specification (別紙７－８).

export interface FacilityStandard {
  code: string;
  name: string;
  /** true when the public list does not show the variant and one was chosen for this app. */
  provisional?: boolean;
}

export const HOSPITAL = {
  name: "架空総合病院",
  beds: { general: 134 },
  /** The ward in this app (5階東) bills 急性期一般入院料４. */
  wardBase: "190199910",
} as const;

export const FACILITY_STANDARDS: FacilityStandard[] = [
  // 入院料
  { code: "3528", name: "急性期一般入院料４" },
  { code: "4065", name: "地域包括医療病棟入院料２" },
  { code: "214", name: "短期滞在手術等基本料１" },
  // 入院基本料等加算
  { code: "3659", name: "救急医療管理加算" },
  { code: "3270", name: "診療録管理体制加算１（旧加算２）" },
  { code: "3288", name: "２５対１急性期看護補助体制加算（看護補助者５割以上）", provisional: true },
  { code: "4201", name: "電子的診療情報連携体制整備加算２（入院）" },
  { code: "4208", name: "口腔管理連携加算" },
  { code: "3291", name: "医療安全対策加算１" },
  { code: "3026", name: "感染対策向上加算２" },
  { code: "3028", name: "患者サポート体制充実加算" },
  { code: "4211", name: "地域支援・医薬品供給対応体制加算１" },
  { code: "3033", name: "病棟薬剤業務実施加算２（旧加算１）" },
  { code: "3559", name: "データ提出加算１・３（許可２００床未満）", provisional: true },
  { code: "3455", name: "入退院支援加算１", provisional: true },
  { code: "3667", name: "認知症ケア加算３", provisional: true },
  { code: "3668", name: "せん妄ハイリスク患者ケア加算" },
  { code: "4061", name: "協力対象施設入所者入院加算" },
  { code: "4227", name: "入院手術対応加算（短手３・注３）" },
  // 評価料・食事
  { code: "4427", name: "入院ベースアップ評価料１０３" },
  { code: "3905", name: "看護職員処遇改善評価料３８" },
  { code: "642", name: "入院時食事療養（１）入院時生活療養（１）" },
  // 医学管理・検査・画像・リハビリ・処置・手術など
  { code: "36", name: "薬剤管理指導料" },
  { code: "692", name: "医療機器安全管理料１" },
  { code: "817", name: "検体検査管理加算（１）" },
  { code: "818", name: "検体検査管理加算（２）" },
  { code: "168", name: "心臓カテ血管内視鏡検査加算" },
  { code: "852", name: "ＣＴ撮影（１６列以上マルチスライス型）", provisional: true },
  { code: "3171", name: "ＭＲＩ撮影（１．５テスラ以上の機器）", provisional: true },
  { code: "734", name: "脳血管疾患等リハビリテーション料（３）" },
  { code: "828", name: "運動器リハビリテーション料（１）" },
  { code: "737", name: "呼吸器リハビリテーション料（１）" },
  { code: "3601", name: "導入期加算１（人工腎臓）" },
  { code: "3071", name: "透析液水質確保加算・慢性維持透析濾過加算" },
  { code: "4267", name: "腎代替療法診療体制充実加算" },
  { code: "3496", name: "下肢末梢動脈疾患指導管理加算" },
  { code: "159", name: "ペースメーカー移植術、交換術" },
  { code: "3425", name: "胃瘻造設時嚥下機能評価加算" },
  // 外来・在宅
  { code: "3522", name: "機能強化加算" },
  { code: "3865", name: "二次性骨折予防継続管理料１" },
  { code: "3778", name: "二次性骨折予防継続管理料３" },
  { code: "3862", name: "下肢創傷処置管理料" },
  { code: "4229", name: "院内トリアージ実施体制加算" },
  { code: "612", name: "ニコチン依存症管理料" },
  { code: "3058", name: "在宅療養支援病院（２）" },
  { code: "4099", name: "介護保険施設等連携往診加算" },
  { code: "721", name: "在宅時医学総合管理料及び施設入居時等医学総合管理料" },
];

/**
 * 名寄せコード (別紙７－８ の２): a code that stands for "any one of" these standards.
 * Only the ones that matter for this hospital's codes are listed.
 */
export const NAYOSE: Record<string, string[]> = {
  "8020": ["3525", "3526", "3527", "3528", "3529", "3198", "3531", "3199", "3200", "4148", "4149"],
  "8025": ["3531", "3199", "3200", "3538", "3204", "3205"],
};

const filed = new Set(FACILITY_STANDARDS.map((s) => s.code));

export function hasStandard(code: string): boolean {
  if (filed.has(code)) return true;
  return (NAYOSE[code] ?? []).some((c) => filed.has(c));
}

/**
 * Whether the facility meets a code's 施設基準①〜⑩ (master columns 72–81):
 * three groups (①〜⑥, ⑦〜⑨, ⑩); inside a group any one, across groups all.
 */
export function meetsStandards(shisetsu: string[]): boolean {
  const groups = [shisetsu.slice(0, 6), shisetsu.slice(6, 9), shisetsu.slice(9, 10)];
  return groups.every((g) => {
    const codes = g.filter((c) => c && c !== "0");
    return codes.length === 0 || codes.some(hasStandard);
  });
}
