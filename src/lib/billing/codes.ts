// Which official codes this FICTIONAL hospital bills for its own order items.
// Only codes live here: names, points and drug prices are always read from the official
// masters at calculation time, so a revision never leaves stale numbers behind.

/** Products the fictional hospital stocks (医薬品マスター codes). */
export const DRUG_CODES: Record<string, string> = {
  // injections
  "INJ-NS500": "620767302", // 生理食塩液「ＮＰ」 500mL 袋
  "INJ-NS100": "640412105", // 生理食塩液 100mL 袋
  "INJ-VEENF500": "622572201", // ヴィーンＦ輸液 500mL
  "INJ-SOL3A500": "620007344", // ソルデム３Ａ輸液 500mL
  "INJ-GLU5-500": "643230287", // 大塚糖液５％ 500mL
  "INJ-VCM05": "620005694", // バンコマイシン塩酸塩点滴静注用０．５ｇ「サワイ」
  "INJ-CEZ1": "621096802", // セファゾリンナトリウム注射用１ｇ「日医工」
  "INJ-SBTABPC3": "622419601", // スルバシリン静注用３ｇ
  "INJ-CTRX1": "621538303", // セフトリアキソンナトリウム静注用１ｇ「日医工」
  "INJ-FRS20": "620004758", // フロセミド注２０ｍｇ「トーワ」
  "INJ-APAP1000": "622525501", // アセリオ静注液１０００ｍｇバッグ
  // oral drugs dispensed by the hospital (持参薬 are the patient's own and are not billed)
  "ORAL-AMLO5": "620007860",
  "ORAL-LPZ15": "620009451",
  "ORAL-APAP500": "622381201",
  "ORAL-DNP5": "622092001",
  "ORAL-ENA5": "621244404",
  "ORAL-BISO25": "621399401",
  "ORAL-SPL25": "620003560",
  "ORAL-ROSU25": "622582001",
  "ORAL-MGO330": "620005434",
};

/** 診療行為コード for each lab item of the fictional hospital (sets expand to their items). */
export const LAB_CODES: Record<string, string[]> = {
  "LAB-CBC": ["160008010"], // 末梢血液一般検査
  "LAB-DIFF": ["160191510"], // 末梢血液像（自動機械法）
  "LAB-CHEM": [
    "160017410", // ＴＰ
    "160018910", // Ａｌｂ（ＢＣＰ改良法）
    "160022510", // ＡＳＴ
    "160022610", // ＡＬＴ
    "160019510", // ＬＤ
    "160020010", // ＡＬＰ
    "160017010", // ＢＩＬ／総
    "160019010", // ＢＵＮ
    "160019210", // クレアチニン
    "160021110", // ナトリウム及びクロール
    "160021410", // カリウム
    "160019410", // グルコース
  ],
  "LAB-CRP": ["160054710"], // ＣＲＰ
  "LAB-COAG": ["160012010", "160012310"], // ＰＴ、ＡＰＴＴ
  "LAB-BNP": ["160162350"], // ＢＮＰ
  "LAB-BCX": ["160058610"], // 細菌培養同定検査（血液）
  "LAB-UA": ["160000310", "160005010"], // 尿一般、尿沈渣（鏡検法）
  "LAB-UCX": ["160058410"], // 細菌培養同定検査（泌尿器）
  // A drug level (バンコマイシン) is billed through 特定薬剤治療管理料１, not as a lab item.
  "LAB-VCM": [],
};

/** Other codes the engine uses by name (looked up in the master for points). */
export const CODES = {
  点滴注射: "130003810",
  調剤料入院: "120001110",
  調剤技術基本料入院: "120001710",
  特定薬剤治療管理料１: "113000410",
  嫌気性培養加算: "160058970",
  血液学的検査判断料: "160061810",
  生化学的検査１判断料: "160061910",
  生化学的検査２判断料: "160062010",
  免疫学的検査判断料: "160062110",
  微生物学的検査判断料: "160062210",
  尿糞便等検査判断料: "160061710",
} as const;
