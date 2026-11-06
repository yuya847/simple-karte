// More lab items for the order screen (検体検査), in the same shape as LAB_TESTS / LAB_INFO in master.ts.
// Names, abbreviations, materials, containers (SRL の容器記号) and turnaround follow the published test
// guides of SRL (総合検査案内 2026-2027), BML and LSI メディエンス; the billing section of each item
// (D000〜, 診療報酬の検体検査) is read from the official 医科診療行為マスター through billing/codes.ts.
// Whether an item is run in house or sent out, and its turnaround, are the fictional hospital's setting.
// The analyte codes in `contains` let the result table and the duplicate check work (ANALYTES in
// master.ts has reference ranges only for the items the prototype reports).

import type { LabGroup, LabMaster } from "./master";

export interface LabInfo {
  material: string;
  container: string;
  tat: string;
  note?: string;
}

const IN = "院内・当日";
const NOW = "院内・すぐ";
const OUT = "外注・2〜4日";
const OUT7 = "外注・5〜7日";
const DAYS = "院内・数日";

// Common materials (SRL 容器記号: PK2 EDTA-2K 血液, PC2 3.2%クエン酸Na 血漿, PF2 フッ化Na 血漿, S09 血清（分離剤入り）, PN2 EDTA-2Na 血漿, U40 尿).
const EDTA: LabInfo = { material: "血液 2.0mL（EDTA-2K）", container: "PK2", tat: IN };
const CIT: LabInfo = { material: "血漿 0.5mL（3.2%クエン酸Na）", container: "PC2", tat: IN };
const serum = (tat: string, ml = "0.5", note?: string): LabInfo => ({ material: `血清 ${ml}mL`, container: "S09", tat, ...(note ? { note } : {}) });
const edtaPlasmaCold = (tat: string, note = "EDTA-2Na 血漿。採血後すぐ氷冷し、冷却遠心して分離"): LabInfo => ({ material: "血漿 1.0mL（EDTA-2Na、冷却）", container: "PN2", tat, note });
const urine = (tat: string, note?: string): LabInfo => ({ material: "部分尿 10mL", container: "U40", tat, ...(note ? { note } : {}) });
const swab = (what: string, tat: string, note?: string): LabInfo => ({ material: what, container: "スワブ（輸送培地付き）", tat, ...(note ? { note } : {}) });
const sterile = (what: string, tat: string, note?: string): LabInfo => ({ material: what, container: "滅菌容器", tat, ...(note ? { note } : {}) });
const level = (drug: string): LabInfo => ({ material: "血清 0.5mL", container: "S09", tat: IN, note: `${drug}の血中濃度。採血の時刻（トラフなら次の投与の直前）をオーダに書く。特定薬剤治療管理料で算定する` });

interface Row {
  code: string;
  group: LabGroup;
  abbr: string;
  name: string;
  specimen?: LabMaster["specimen"];
  contains?: string[];
  aliases: string[];
  needs?: "sets";
  info: LabInfo;
}

const ROWS: Row[] = [
  // ---------- 血算・血液像 (D005 血液形態・機能検査) ----------
  { code: "LAB-RBC", group: "血液学", abbr: "RBC", name: "赤血球数（末梢血液一般として算定）", contains: ["RBC"], aliases: ["RBC", "赤血球数", "赤血球"], info: EDTA },
  { code: "LAB-HT", group: "血液学", abbr: "Ht", name: "ヘマトクリット（末梢血液一般として算定）", contains: ["Ht"], aliases: ["Ht", "Hct", "ヘマトクリット", "ヘマト"], info: EDTA },
  { code: "LAB-MDIFF", group: "血液学", abbr: "血液像（鏡検）", name: "末梢血液像（鏡検法）", contains: ["Neut", "Lymph"], aliases: ["鏡検", "目視分画", "血液像鏡検", "異型リンパ球", "芽球の確認"], info: { ...EDTA, note: "機械法の白血球分画とは同じ検体で一方だけ" } },
  { code: "LAB-ESR", group: "血液学", abbr: "赤沈", name: "赤血球沈降速度（ESR）", contains: ["ESR"], aliases: ["赤沈", "血沈", "ESR", "赤血球沈降速度"], info: { material: "血液 1.6mL（3.8%クエン酸Na、赤沈用）", container: "赤沈用容器", tat: IN, note: "採血後2時間以内に測る" } },
  // ---------- 凝固・線溶 (D006 出血・凝固検査) ----------
  { code: "LAB-PTINR", group: "凝固・線溶", abbr: "PT-INR", name: "PT-INR（プロトロンビン時間 国際標準比。ワルファリンの調節に使う値）", contains: ["PT-INR"], aliases: ["INR", "PT-INR", "ワーファリンのINR"], info: { ...CIT, note: "PT と同じ検体・同じ測定。PT を選べば INR も報告される" } },
  { code: "LAB-AT3", group: "凝固・線溶", abbr: "AT III", name: "アンチトロンビン活性（AT III）", contains: ["AT3"], aliases: ["AT3", "ATIII", "AT III", "アンチトロンビン", "AT活性"], info: CIT },
  { code: "LAB-TAT", group: "凝固・線溶", abbr: "TAT", name: "トロンビン・アンチトロンビン複合体（TAT）", contains: ["TAT"], aliases: ["TAT", "トロンビン・アンチトロンビン複合体"], info: { ...CIT, tat: OUT } },
  { code: "LAB-PLG", group: "凝固・線溶", abbr: "PLG", name: "プラスミノゲン活性", contains: ["PLG"], aliases: ["プラスミノゲン", "PLG"], info: { ...CIT, tat: OUT } },
  // ---------- 生化学 (D007 血液化学検査) ----------
  { code: "LAB-LIP", group: "生化学", abbr: "リパーゼ", name: "リパーゼ", contains: ["Lip"], aliases: ["リパーゼ", "Lip"], info: serum(IN) },
  { code: "LAB-PAMY", group: "生化学", abbr: "P-AMY", name: "アミラーゼアイソザイム（膵型アミラーゼ）", contains: ["PAmy"], aliases: ["膵アミラーゼ", "P-AMY", "P型アミラーゼ", "アミラーゼアイソザイム"], info: serum(OUT) },
  { code: "LAB-CYSC", group: "生化学", abbr: "シスタチンC", name: "シスタチンC", contains: ["CysC"], aliases: ["シスタチンC", "CysC"], info: serum(OUT, "0.3", "3か月に1回を限度（D007 注）") },
  { code: "LAB-B2MG", group: "生化学", abbr: "β2-MG", name: "β2-ミクログロブリン（血清）", contains: ["B2MG"], aliases: ["β2MG", "β2-MG", "ベータ2ミクログロブリン"], info: serum(OUT) },
  { code: "LAB-ZN", group: "生化学", abbr: "Zn", name: "亜鉛", contains: ["Zn"], aliases: ["亜鉛", "Zn"], info: serum(OUT, "0.5", "溶血・ゴム栓との接触で高くなることがある") },
  { code: "LAB-CU", group: "生化学", abbr: "Cu", name: "銅", contains: ["Cu"], aliases: ["銅", "Cu"], info: serum(OUT) },
  { code: "LAB-OSM", group: "生化学", abbr: "血清浸透圧", name: "血液浸透圧", contains: ["Osm"], aliases: ["浸透圧", "血清浸透圧", "血漿浸透圧", "Osm"], info: serum(IN, "1.0") },
  { code: "LAB-PREALB", group: "生化学", abbr: "プレアルブミン", name: "トランスサイレチン（プレアルブミン）", contains: ["PreAlb"], aliases: ["プレアルブミン", "トランスサイレチン", "TTR", "栄養評価"], info: serum(OUT) },
  { code: "LAB-HPT", group: "生化学", abbr: "ハプトグロビン", name: "ハプトグロビン", contains: ["Hpt"], aliases: ["ハプトグロビン", "溶血の確認"], info: serum(OUT) },
  { code: "LAB-SPEP", group: "生化学", abbr: "蛋白分画", name: "蛋白分画（電気泳動）", contains: ["SPEP"], aliases: ["蛋白分画", "タンパク分画", "SPEP", "M蛋白の確認"], info: serum(OUT) },
  { code: "LAB-VB12", group: "生化学", abbr: "ビタミンB12", name: "ビタミンB12", contains: ["VB12"], aliases: ["ビタミンB12", "B12", "VB12"], info: serum(OUT, "0.5", "採血後は遮光") },
  { code: "LAB-FOL", group: "生化学", abbr: "葉酸", name: "葉酸", contains: ["Fol"], aliases: ["葉酸", "フォレート"], info: serum(OUT, "0.5", "採血後は遮光") },
  { code: "LAB-VB1", group: "生化学", abbr: "ビタミンB1", name: "ビタミンB1", contains: ["VB1"], aliases: ["ビタミンB1", "B1", "チアミン", "VB1"], info: { material: "血液 2.0mL（EDTA-2K、遮光）", container: "PK2", tat: OUT7, note: "全血。採血後は遮光" } },
  { code: "LAB-VD25", group: "生化学", abbr: "25-OH VD", name: "25-ヒドロキシビタミンD", contains: ["VD25"], aliases: ["ビタミンD", "25-OHビタミンD", "25OHD"], info: serum(OUT, "0.5", "保険では原発性骨粗鬆症の薬剤治療方針の選択時など対象が限られる（D007 注）") },
  { code: "LAB-KL6", group: "生化学", abbr: "KL-6", name: "KL-6（シアル化糖鎖抗原。間質性肺炎の指標）", contains: ["KL6"], aliases: ["KL-6", "KL6", "間質性肺炎マーカー"], info: serum(OUT) },
  // ---------- 炎症・感染症 ----------
  { code: "LAB-PSEP", group: "炎症・感染", abbr: "プレセプシン", name: "プレセプシン（定量）", contains: ["Presepsin"], aliases: ["プレセプシン", "P-SEP"], info: { material: "血漿 0.5mL（EDTA-2K）", container: "PK2", tat: IN } },
  { code: "LAB-BDG", group: "炎症・感染", abbr: "β-D-グルカン", name: "（1→3）-β-D-グルカン", contains: ["BDG"], aliases: ["βDグルカン", "β-D-グルカン", "ベータDグルカン", "真菌マーカー"], info: serum(OUT, "0.5", "グルカンを含まない専用容器。ガーゼ・セルロース膜に触れさせない") },
  { code: "LAB-HBSAG", group: "炎症・感染", abbr: "HBs抗原", name: "HBs抗原（B型肝炎ウイルス表面抗原、定量）", contains: ["HBsAg"], aliases: ["HBs抗原", "HBsAg", "B型肝炎抗原"], info: serum(IN) },
  { code: "LAB-HBSAB", group: "炎症・感染", abbr: "HBs抗体", name: "HBs抗体（定量）", contains: ["HBsAb"], aliases: ["HBs抗体", "HBsAb"], info: serum(IN) },
  { code: "LAB-HBCAB", group: "炎症・感染", abbr: "HBc抗体", name: "HBc抗体（定量）", contains: ["HBcAb"], aliases: ["HBc抗体", "HBcAb"], info: serum(OUT) },
  { code: "LAB-HCVAB", group: "炎症・感染", abbr: "HCV抗体", name: "HCV抗体（C型肝炎ウイルス抗体、定性・定量）", contains: ["HCVAb"], aliases: ["HCV抗体", "HCVAb", "C型肝炎抗体"], info: serum(IN) },
  { code: "LAB-HIV", group: "炎症・感染", abbr: "HIV", name: "HIV-1,2 抗原・抗体同時測定（定性）", contains: ["HIV"], aliases: ["HIV", "HIV抗体", "HIV抗原抗体"], info: serum(IN, "0.5", "結果の説明は医師が行う") },
  { code: "LAB-TPAB", group: "炎症・感染", abbr: "TP抗体", name: "梅毒トレポネーマ抗体（TP抗体、定量）", contains: ["TPAb"], aliases: ["TP抗体", "TPHA", "TPLA", "梅毒抗体"], info: serum(IN) },
  { code: "LAB-RPR", group: "炎症・感染", abbr: "RPR", name: "梅毒血清反応（STS・RPR 定量）", contains: ["RPR"], aliases: ["RPR", "STS", "梅毒定量"], info: serum(IN) },
  { code: "LAB-HTLV1", group: "炎症・感染", abbr: "HTLV-1抗体", name: "HTLV-1抗体", contains: ["HTLV1"], aliases: ["HTLV-1", "HTLV1抗体", "ATL抗体"], info: serum(OUT) },
  { code: "LAB-ASPAG", group: "炎症・感染", abbr: "アスペルギルス抗原", name: "アスペルギルス抗原（ガラクトマンナン）", contains: ["AspAg"], aliases: ["アスペルギルス抗原", "ガラクトマンナン", "GM抗原"], info: serum(OUT) },
  { code: "LAB-CRAG", group: "炎症・感染", abbr: "クリプトコッカス抗原", name: "クリプトコッカス抗原（定性）", contains: ["CrAg"], aliases: ["クリプトコッカス抗原", "クリプト抗原"], info: serum(OUT) },
  { code: "LAB-CMVAG", group: "炎症・感染", abbr: "CMVアンチゲネミア", name: "サイトメガロウイルス pp65抗原（C7-HRP、アンチゲネミア）", contains: ["CMVAg"], aliases: ["CMVアンチゲネミア", "C7-HRP", "CMV抗原", "サイトメガロ抗原"], info: { material: "血液 5.0mL（EDTA-2K）", container: "PK2", tat: OUT, note: "採血当日に提出（白血球を使う）" } },
  { code: "LAB-IGRA", group: "炎症・感染", abbr: "IGRA", name: "結核菌特異的インターフェロン-γ産生能（IGRA：T-SPOT／QFT）", contains: ["IGRA"], aliases: ["IGRA", "T-SPOT", "QFT", "クォンティフェロン", "Tスポット"], info: { material: "血液 専用採血管（ヘパリン）", container: "専用採血管", tat: OUT7, note: "採血後は常温で、当日中に検査室へ" } },
  { code: "LAB-MYCOAB", group: "炎症・感染", abbr: "マイコプラズマ抗体", name: "マイコプラズマ抗体（PA法、半定量）", contains: ["MycoAb"], aliases: ["マイコプラズマ抗体", "マイコ抗体", "PA法"], info: serum(OUT) },
  { code: "LAB-FLUAG", group: "炎症・感染", abbr: "インフルエンザ抗原", name: "インフルエンザウイルス抗原（定性、迅速）", contains: ["FluAg"], aliases: ["インフル迅速", "インフルエンザ抗原", "フル迅速"], info: swab("鼻咽頭ぬぐい液", NOW) },
  { code: "LAB-COVAG", group: "炎症・感染", abbr: "SARS-CoV-2抗原", name: "SARS-CoV-2 抗原（定性、迅速）", contains: ["CovAg"], aliases: ["コロナ抗原", "COVID抗原", "SARS-CoV-2抗原", "コロナ迅速"], info: swab("鼻咽頭ぬぐい液", NOW) },
  { code: "LAB-COVFLUAG", group: "炎症・感染", abbr: "コロナ・インフル抗原", name: "SARS-CoV-2・インフルエンザウイルス抗原同時検出（定性）", contains: ["CovAg", "FluAg"], aliases: ["コロナインフル同時", "同時抗原"], info: swab("鼻咽頭ぬぐい液", NOW, "単独の抗原検査とは同時に算定しない") },
  { code: "LAB-PNEUUAG", group: "炎症・感染", abbr: "肺炎球菌尿中抗原", name: "肺炎球菌抗原（尿、定性）", specimen: "尿", contains: ["PneuUAg"], aliases: ["肺炎球菌尿中抗原", "肺炎球菌抗原"], info: urine(NOW) },
  { code: "LAB-LEGUAG", group: "炎症・感染", abbr: "レジオネラ尿中抗原", name: "レジオネラ抗原（尿、定性）", specimen: "尿", contains: ["LegUAg"], aliases: ["レジオネラ尿中抗原", "レジオネラ抗原"], info: urine(NOW) },
  // ---------- 心筋・心不全 ----------
  { code: "LAB-TNI", group: "心筋・心不全", abbr: "TnI", name: "心筋トロポニンI（高感度）", contains: ["TnI"], aliases: ["トロポニンI", "TnI", "hs-TnI"], info: serum(IN, "0.5", "トロポニンT とは同じ検体で一方だけ") },
  { code: "LAB-CKMB", group: "心筋・心不全", abbr: "CK-MB", name: "CK-MB（蛋白量測定）", contains: ["CKMB"], aliases: ["CK-MB", "CKMB"], info: serum(IN) },
  // ---------- 内分泌 (D008 内分泌学的検査) ----------
  { code: "LAB-FT3", group: "内分泌", abbr: "FT3", name: "FT3（遊離トリヨードサイロニン）", contains: ["FT3"], aliases: ["FT3", "遊離T3"], info: serum(OUT) },
  { code: "LAB-TRAB", group: "内分泌", abbr: "TRAb", name: "TRAb（TSH受容体抗体）", contains: ["TRAb"], aliases: ["TRAb", "TSH受容体抗体", "バセドウの抗体"], info: serum(OUT) },
  { code: "LAB-TPOAB", group: "内分泌", abbr: "TPO抗体", name: "抗甲状腺ペルオキシダーゼ抗体（TPOAb）", contains: ["TPOAb"], aliases: ["TPO抗体", "TPOAb", "抗TPO"], info: serum(OUT) },
  { code: "LAB-TGAB", group: "内分泌", abbr: "Tg抗体", name: "抗サイログロブリン抗体（TgAb）", contains: ["TgAb"], aliases: ["Tg抗体", "TgAb", "抗サイログロブリン"], info: serum(OUT) },
  { code: "LAB-CORT", group: "内分泌", abbr: "コルチゾール", name: "コルチゾール", contains: ["Cort"], aliases: ["コルチゾール", "Cortisol", "F"], info: serum(OUT, "0.5", "日内変動があるので採血時刻をオーダに書く") },
  { code: "LAB-ACTH", group: "内分泌", abbr: "ACTH", name: "ACTH（副腎皮質刺激ホルモン）", contains: ["ACTH"], aliases: ["ACTH", "副腎皮質刺激ホルモン"], info: edtaPlasmaCold(OUT) },
  { code: "LAB-ALD", group: "内分泌", abbr: "アルドステロン", name: "アルドステロン", contains: ["Ald"], aliases: ["アルドステロン", "PAC"], info: serum(OUT, "0.5", "体位（臥位・立位）と採血時刻をオーダに書く") },
  { code: "LAB-PRA", group: "内分泌", abbr: "レニン活性", name: "レニン活性（PRA）", contains: ["PRA"], aliases: ["レニン", "PRA", "レニン活性"], info: edtaPlasmaCold(OUT) },
  { code: "LAB-PRL", group: "内分泌", abbr: "PRL", name: "プロラクチン（PRL）", contains: ["PRL"], aliases: ["プロラクチン", "PRL"], info: serum(OUT) },
  { code: "LAB-GH", group: "内分泌", abbr: "GH", name: "成長ホルモン（GH）", contains: ["GH"], aliases: ["成長ホルモン", "GH"], info: serum(OUT) },
  { code: "LAB-IGF1", group: "内分泌", abbr: "IGF-1", name: "IGF-1（ソマトメジンC）", contains: ["IGF1"], aliases: ["IGF-1", "IGF1", "ソマトメジンC"], info: serum(OUT) },
  { code: "LAB-ADH", group: "内分泌", abbr: "ADH", name: "バソプレシン（抗利尿ホルモン、ADH）", contains: ["ADH"], aliases: ["ADH", "バソプレシン", "抗利尿ホルモン"], info: edtaPlasmaCold(OUT7) },
  { code: "LAB-LH", group: "内分泌", abbr: "LH", name: "LH（黄体形成ホルモン）", contains: ["LH"], aliases: ["LH", "黄体形成ホルモン"], info: serum(OUT) },
  { code: "LAB-FSH", group: "内分泌", abbr: "FSH", name: "FSH（卵胞刺激ホルモン）", contains: ["FSH"], aliases: ["FSH", "卵胞刺激ホルモン"], info: serum(OUT) },
  { code: "LAB-E2", group: "内分泌", abbr: "E2", name: "エストラジオール（E2）", contains: ["E2"], aliases: ["E2", "エストラジオール"], info: serum(OUT) },
  { code: "LAB-TESTO", group: "内分泌", abbr: "テストステロン", name: "テストステロン", contains: ["Testo"], aliases: ["テストステロン", "T"], info: serum(OUT) },
  { code: "LAB-GA", group: "内分泌", abbr: "GA", name: "グリコアルブミン（GA）", contains: ["GA"], aliases: ["グリコアルブミン", "GA"], info: serum(IN) },
  { code: "LAB-IRI", group: "内分泌", abbr: "インスリン", name: "インスリン（IRI）", contains: ["IRI"], aliases: ["インスリン", "IRI", "インスリン値"], info: serum(OUT, "0.5", "空腹時か食後何時間かをオーダに書く") },
  { code: "LAB-CPR", group: "内分泌", abbr: "CPR", name: "Cペプチド（CPR、血清）", contains: ["CPR"], aliases: ["Cペプチド", "CPR", "C-ペプチド"], info: serum(OUT, "0.5", "空腹時か食後何時間かをオーダに書く") },
  { code: "LAB-PTH", group: "内分泌", abbr: "intact PTH", name: "副甲状腺ホルモン（intact PTH）", contains: ["PTH"], aliases: ["PTH", "intact PTH", "副甲状腺ホルモン", "iPTH"], info: edtaPlasmaCold(OUT, "EDTA-2Na 血漿。採血後すぐ分離して凍結") },
  // ---------- 腫瘍マーカー (D009 腫瘍マーカー) ----------
  { code: "LAB-CEA", group: "腫瘍マーカー", abbr: "CEA", name: "CEA（癌胎児性抗原）", contains: ["CEA"], aliases: ["CEA"], info: serum(OUT) },
  { code: "LAB-CA199", group: "腫瘍マーカー", abbr: "CA19-9", name: "CA19-9", contains: ["CA19-9"], aliases: ["CA19-9", "CA199"], info: serum(OUT) },
  { code: "LAB-AFP", group: "腫瘍マーカー", abbr: "AFP", name: "AFP（α-フェトプロテイン）", contains: ["AFP"], aliases: ["AFP", "αフェトプロテイン"], info: serum(OUT) },
  { code: "LAB-PIVKA", group: "腫瘍マーカー", abbr: "PIVKA-II", name: "PIVKA-II（定量）", contains: ["PIVKA2"], aliases: ["PIVKA", "PIVKA-II", "PIVKA2"], info: serum(OUT, "0.5", "ワルファリン・ビタミンK欠乏で高くなる") },
  { code: "LAB-CA125", group: "腫瘍マーカー", abbr: "CA125", name: "CA125", contains: ["CA125"], aliases: ["CA125", "CA-125"], info: serum(OUT) },
  { code: "LAB-CA153", group: "腫瘍マーカー", abbr: "CA15-3", name: "CA15-3", contains: ["CA15-3"], aliases: ["CA15-3", "CA153"], info: serum(OUT) },
  { code: "LAB-PSA", group: "腫瘍マーカー", abbr: "PSA", name: "PSA（前立腺特異抗原）", contains: ["PSA"], aliases: ["PSA", "前立腺特異抗原"], info: serum(OUT, "0.5", "直腸診・導尿のあとは高くなることがある") },
  { code: "LAB-CYFRA", group: "腫瘍マーカー", abbr: "CYFRA", name: "CYFRA（サイトケラチン19フラグメント）", contains: ["CYFRA"], aliases: ["CYFRA", "シフラ", "CYFRA21-1"], info: serum(OUT) },
  { code: "LAB-PROGRP", group: "腫瘍マーカー", abbr: "ProGRP", name: "ProGRP（ガストリン放出ペプチド前駆体）", contains: ["ProGRP"], aliases: ["ProGRP", "プロGRP"], info: serum(OUT) },
  { code: "LAB-SCC", group: "腫瘍マーカー", abbr: "SCC", name: "SCC抗原（扁平上皮癌関連抗原）", contains: ["SCC"], aliases: ["SCC", "SCC抗原"], info: serum(OUT, "0.5", "唾液・皮膚が混じると高くなる") },
  { code: "LAB-NSE", group: "腫瘍マーカー", abbr: "NSE", name: "NSE（神経特異エノラーゼ）", contains: ["NSE"], aliases: ["NSE"], info: serum(OUT, "0.5", "溶血で高くなる") },
  { code: "LAB-SIL2R", group: "腫瘍マーカー", abbr: "sIL-2R", name: "可溶性インターロイキン-2受容体（sIL-2R）", contains: ["sIL2R"], aliases: ["sIL-2R", "可溶性IL-2レセプター", "IL-2R"], info: serum(OUT) },
  // ---------- 免疫・アレルギー (D014 自己抗体検査・D015 血漿蛋白免疫学的検査) ----------
  { code: "LAB-IGG", group: "免疫・アレルギー", abbr: "IgG", name: "IgG（免疫グロブリンG）", contains: ["IgG"], aliases: ["IgG"], info: serum(IN) },
  { code: "LAB-IGA", group: "免疫・アレルギー", abbr: "IgA", name: "IgA（免疫グロブリンA）", contains: ["IgA"], aliases: ["IgA"], info: serum(IN) },
  { code: "LAB-IGM", group: "免疫・アレルギー", abbr: "IgM", name: "IgM（免疫グロブリンM）", contains: ["IgM"], aliases: ["IgM"], info: serum(IN) },
  { code: "LAB-IGE", group: "免疫・アレルギー", abbr: "IgE", name: "非特異的IgE（定量）", contains: ["IgE"], aliases: ["IgE", "総IgE", "非特異的IgE"], info: serum(OUT) },
  { code: "LAB-SIGE", group: "免疫・アレルギー", abbr: "特異的IgE", name: "特異的IgE（アレルゲンをコメントに書く）", contains: ["sIgE"], aliases: ["特異的IgE", "RAST", "アレルゲン検査"], info: serum(OUT, "0.5", "アレルゲンの項目をオーダのコメントに書く。1回に13項目まで（D015 注）") },
  { code: "LAB-RF", group: "免疫・アレルギー", abbr: "RF", name: "リウマトイド因子（RF、定量）", contains: ["RF"], aliases: ["RF", "リウマチ因子", "リウマトイド因子"], info: serum(IN) },
  { code: "LAB-ANA", group: "免疫・アレルギー", abbr: "抗核抗体", name: "抗核抗体（蛍光抗体法、定性）", contains: ["ANA"], aliases: ["抗核抗体", "ANA", "FANA"], info: serum(OUT) },
  { code: "LAB-DSDNA", group: "免疫・アレルギー", abbr: "抗ds-DNA抗体", name: "抗DNA抗体（抗ds-DNA IgG、定量）", contains: ["dsDNA"], aliases: ["抗ds-DNA抗体", "dsDNA", "抗DNA抗体"], info: serum(OUT) },
  { code: "LAB-MPO", group: "免疫・アレルギー", abbr: "MPO-ANCA", name: "MPO-ANCA（抗好中球細胞質ミエロペルオキシダーゼ抗体）", contains: ["MPO-ANCA"], aliases: ["MPO-ANCA", "P-ANCA", "MPOANCA"], info: serum(OUT) },
  { code: "LAB-PR3", group: "免疫・アレルギー", abbr: "PR3-ANCA", name: "PR3-ANCA（抗好中球細胞質プロテイナーゼ3抗体）", contains: ["PR3-ANCA"], aliases: ["PR3-ANCA", "C-ANCA", "PR3ANCA"], info: serum(OUT) },
  { code: "LAB-ACPA", group: "免疫・アレルギー", abbr: "抗CCP抗体", name: "抗シトルリン化ペプチド抗体（抗CCP抗体、定量）", contains: ["ACPA"], aliases: ["抗CCP抗体", "CCP", "ACPA"], info: serum(OUT) },
  { code: "LAB-C3", group: "免疫・アレルギー", abbr: "C3", name: "補体 C3", contains: ["C3"], aliases: ["C3", "補体C3"], info: serum(OUT) },
  { code: "LAB-C4", group: "免疫・アレルギー", abbr: "C4", name: "補体 C4", contains: ["C4"], aliases: ["C4", "補体C4"], info: serum(OUT) },
  { code: "LAB-CH50", group: "免疫・アレルギー", abbr: "CH50", name: "血清補体価（CH50）", contains: ["CH50"], aliases: ["CH50", "補体価"], info: serum(OUT, "0.5", "採血後すぐ分離して凍結") },
  { code: "LAB-IGG4", group: "免疫・アレルギー", abbr: "IgG4", name: "IgG4", contains: ["IgG4"], aliases: ["IgG4"], info: serum(OUT) },
  // ---------- 血液ガス ----------
  { code: "LAB-VBG", group: "血液ガス", abbr: "静脈血ガス", name: "静脈血ガス分析（pH・PvCO2・PvO2・HCO3）", contains: ["pH", "PvCO2", "PvO2", "HCO3"], aliases: ["静脈血ガス", "VBG", "静脈ガス", "静脈血液ガス"], info: { material: "静脈血（ヘパリン加シリンジ）", container: "血ガス用シリンジ", tat: NOW, note: "静脈血の酸素分圧は動脈血の代わりにならない。空気を抜いて密栓し、すぐ測る。院内で行った場合だけ算定できる（D007）" } },
  // ---------- 尿・便 (D000〜D003 尿・糞便等検査) ----------
  { code: "LAB-UALB", group: "尿", abbr: "尿アルブミン", name: "尿中アルブミン（定量）", specimen: "尿", contains: ["UAlb"], aliases: ["尿アルブミン", "尿中アルブミン", "微量アルブミン"], info: urine(OUT, "糖尿病性腎症の早期で3か月に1回を限度（D001 注）") },
  { code: "LAB-UOSM", group: "尿", abbr: "尿浸透圧", name: "尿浸透圧", specimen: "尿", contains: ["UOsm"], aliases: ["尿浸透圧"], info: urine(IN) },
  { code: "LAB-UUN", group: "尿", abbr: "尿UN", name: "尿中尿素窒素", specimen: "尿", contains: ["UUN"], aliases: ["尿中尿素窒素", "尿UN", "尿中BUN"], info: { material: "蓄尿 0.5mL", container: "U00", tat: IN } },
  { code: "LAB-UHCG", group: "尿", abbr: "尿hCG", name: "妊娠反応（尿中hCG、定性）", specimen: "尿", contains: ["UhCG"], aliases: ["妊娠反応", "尿hCG", "hCG定性"], info: urine(NOW) },
  { code: "LAB-FOBT", group: "便", abbr: "便潜血", name: "便潜血（糞便中ヘモグロビン、免疫法）", specimen: "その他", contains: ["FOBT"], aliases: ["便潜血", "FOBT", "便ヘモグロビン"], info: { material: "糞便（採便容器）", container: "採便容器", tat: IN } },
  // ---------- 微生物：培養 (D018 細菌培養同定検査) ----------
  { code: "LAB-SPCX", group: "微生物", abbr: "喀痰培養", name: "喀痰培養（一般細菌）", specimen: "その他", aliases: ["喀痰培養", "痰培養", "痰培"], info: sterile("喀痰", DAYS, "うがいのあと、唾液でない痰を採る。採取が難しいときは吸引痰") },
  { code: "LAB-STOOLCX", group: "微生物", abbr: "便培養", name: "便培養（腸内病原菌）", specimen: "その他", aliases: ["便培養", "便培", "糞便培養"], info: sterile("糞便", DAYS) },
  { code: "LAB-WOUNDCX", group: "微生物", abbr: "創部培養", name: "創部・膿培養", specimen: "その他", aliases: ["創部培養", "膿培養", "創培養", "褥瘡培養"], info: swab("創部・膿のぬぐい液または穿刺した膿", DAYS, "表面を洗ってから、創の底から採る") },
  { code: "LAB-THROATCX", group: "微生物", abbr: "咽頭培養", name: "咽頭培養", specimen: "その他", aliases: ["咽頭培養", "咽頭培", "のど培養"], info: swab("咽頭ぬぐい液", DAYS) },
  { code: "LAB-CSFCX", group: "微生物", abbr: "髄液培養", name: "髄液培養", specimen: "その他", aliases: ["髄液培養", "髄液培", "CSF培養"], info: sterile("髄液 1mL 以上", DAYS, "採取後すぐ、常温で検査室へ（冷やさない）") },
  { code: "LAB-FLUIDCX", group: "微生物", abbr: "穿刺液培養", name: "穿刺液培養（胸水・腹水・関節液）", specimen: "その他", aliases: ["胸水培養", "腹水培養", "関節液培養", "穿刺液培養"], info: sterile("穿刺液（滅菌スピッツ。血液培養ボトルに入れてもよい）", DAYS) },
  { code: "LAB-CATHCX", group: "微生物", abbr: "カテ先培養", name: "カテーテル先端培養", specimen: "その他", aliases: ["カテ先培養", "カテーテル先端培養", "CVカテ先"], info: sterile("カテーテル先端 5cm", DAYS) },
  { code: "LAB-MRSASCR", group: "微生物", abbr: "MRSA鼻腔培養", name: "MRSAスクリーニング培養（鼻腔）", specimen: "その他", aliases: ["MRSAスクリーニング", "鼻腔培養", "MRSA鼻腔"], info: swab("鼻腔ぬぐい液", DAYS) },
  { code: "LAB-AFBCX", group: "微生物", abbr: "抗酸菌培養", name: "抗酸菌培養（液体培地法）", specimen: "その他", aliases: ["抗酸菌培養", "結核菌培養", "TB培養"], info: sterile("喀痰（3日連続）または他の材料", "院内・最長8週", "塗抹と核酸検出をあわせて出すことが多い") },
  // ---------- 微生物：塗抹・遺伝子・抗原 (D017 細菌顕微鏡検査・D023 微生物核酸同定) ----------
  { code: "LAB-SMEAR", group: "微生物（塗抹・遺伝子）", abbr: "塗抹（グラム染色）", name: "細菌顕微鏡検査（グラム染色・塗抹）", specimen: "その他", contains: ["Gram"], aliases: ["グラム染色", "塗抹", "スメア", "塗抹鏡検"], info: sterile("喀痰・尿・膿など（培養と同じ材料）", NOW) },
  { code: "LAB-AFBSMEAR", group: "微生物（塗抹・遺伝子）", abbr: "抗酸菌塗抹", name: "抗酸菌塗抹（蛍光法・チール・ネルゼン）", specimen: "その他", contains: ["AFBsmear"], aliases: ["抗酸菌塗抹", "ガフキー", "AFB塗抹"], info: sterile("喀痰または他の材料", IN) },
  { code: "LAB-TBPCR", group: "微生物（塗抹・遺伝子）", abbr: "結核菌群PCR", name: "結核菌群核酸検出（PCR）", specimen: "その他", contains: ["TBPCR"], aliases: ["結核PCR", "TB-PCR", "結核菌群核酸", "結核菌PCR"], info: sterile("喀痰または他の材料", OUT) },
  { code: "LAB-COVPCR", group: "微生物（塗抹・遺伝子）", abbr: "SARS-CoV-2 PCR", name: "SARS-CoV-2 核酸検出（PCR）", specimen: "その他", contains: ["CovPCR"], aliases: ["コロナPCR", "COVID PCR", "SARS-CoV-2 PCR", "新型コロナPCR"], info: swab("鼻咽頭ぬぐい液または唾液", IN) },
  { code: "LAB-COVFLUPCR", group: "微生物（塗抹・遺伝子）", abbr: "コロナ・インフル PCR", name: "SARS-CoV-2・インフルエンザ核酸同時検出", specimen: "その他", contains: ["CovPCR", "FluPCR"], aliases: ["コロナインフルPCR", "同時PCR"], info: swab("鼻咽頭ぬぐい液", IN) },
  { code: "LAB-CDIFF", group: "微生物（塗抹・遺伝子）", abbr: "CD抗原・トキシン", name: "クロストリジオイデス・ディフィシル抗原（GDH）・トキシン（定性）", specimen: "その他", contains: ["CDtoxin"], aliases: ["CDトキシン", "CD抗原", "CDチェック", "ディフィシル", "C. difficile"], info: { material: "糞便（下痢便）", container: "滅菌容器", tat: NOW, note: "形のある便では検査しない" } },
  // ---------- 薬物濃度（特定薬剤治療管理料で算定） ----------
  { code: "LAB-TEIC", group: "薬物濃度", abbr: "TEIC", name: "テイコプラニン血中濃度", contains: ["TEIC"], aliases: ["テイコプラニン濃度", "TEIC濃度", "タゴシッド濃度"], info: level("テイコプラニン") },
  { code: "LAB-DIG", group: "薬物濃度", abbr: "ジゴキシン", name: "ジゴキシン血中濃度", contains: ["DIG"], aliases: ["ジゴキシン濃度", "ジギタリス濃度", "ジゴシン濃度"], info: level("ジゴキシン") },
  { code: "LAB-VPA", group: "薬物濃度", abbr: "VPA", name: "バルプロ酸血中濃度", contains: ["VPA"], aliases: ["バルプロ酸濃度", "VPA濃度", "デパケン濃度"], info: level("バルプロ酸") },
  { code: "LAB-CBZ", group: "薬物濃度", abbr: "CBZ", name: "カルバマゼピン血中濃度", contains: ["CBZ"], aliases: ["カルバマゼピン濃度", "CBZ濃度", "テグレトール濃度"], info: level("カルバマゼピン") },
  { code: "LAB-PHT", group: "薬物濃度", abbr: "PHT", name: "フェニトイン血中濃度", contains: ["PHT"], aliases: ["フェニトイン濃度", "PHT濃度", "アレビアチン濃度"], info: level("フェニトイン") },
  { code: "LAB-TAC", group: "薬物濃度", abbr: "TAC", name: "タクロリムス血中濃度", contains: ["TAC"], aliases: ["タクロリムス濃度", "TAC濃度", "プログラフ濃度"], info: { ...level("タクロリムス"), material: "血液 2.0mL（EDTA-2K）", container: "PK2" } },
  { code: "LAB-CYA", group: "薬物濃度", abbr: "CyA", name: "シクロスポリン血中濃度", contains: ["CyA"], aliases: ["シクロスポリン濃度", "CyA濃度", "ネオーラル濃度"], info: { ...level("シクロスポリン"), material: "血液 2.0mL（EDTA-2K）", container: "PK2" } },
  { code: "LAB-LI", group: "薬物濃度", abbr: "Li", name: "リチウム血中濃度", contains: ["Li"], aliases: ["リチウム濃度", "Li濃度", "リーマス濃度"], info: level("リチウム") },
  { code: "LAB-THEO", group: "薬物濃度", abbr: "テオフィリン", name: "テオフィリン血中濃度", contains: ["Theo"], aliases: ["テオフィリン濃度", "テオドール濃度"], info: level("テオフィリン") },
  { code: "LAB-MTX", group: "薬物濃度", abbr: "MTX", name: "メトトレキサート血中濃度", contains: ["MTX"], aliases: ["メトトレキサート濃度", "MTX濃度"], info: level("メトトレキサート") },
  // ---------- 輸血検査 (D011 免疫血液学的検査) ----------
  { code: "LAB-ABO", group: "輸血検査", abbr: "血液型", name: "血液型（ABO・RhD）", contains: ["ABO", "RhD"], aliases: ["血液型", "ABO", "Rh", "血型"], info: { material: "血液 2.0mL（EDTA-2K）", container: "PK2", tat: IN, note: "確定には別の時点で採った2検体が要る（輸血部の決まり）" } },
  { code: "LAB-IRRAB", group: "輸血検査", abbr: "不規則抗体", name: "不規則抗体スクリーニング（間接抗グロブリン試験を含む）", contains: ["IrrAb"], aliases: ["不規則抗体", "抗体スクリーニング", "不規則抗体スクリーニング"], info: { material: "血液 2.0mL（EDTA-2K）", container: "PK2", tat: IN } },
  { code: "LAB-XMATCH", group: "輸血検査", abbr: "クロスマッチ", name: "交差適合試験（クロスマッチ）", contains: ["Xmatch"], aliases: ["クロスマッチ", "交差適合試験", "クロス"], info: { material: "血液 2.0mL（EDTA-2K）", container: "PK2", tat: NOW, note: "輸血日を含め3日以内に採った検体。輸血料の加算（K920）として算定する" } },
  { code: "LAB-DAT", group: "輸血検査", abbr: "直接クームス", name: "直接抗グロブリン試験（直接クームス）", contains: ["DAT"], aliases: ["直接クームス", "DAT", "直接抗グロブリン試験"], info: { material: "血液 2.0mL（EDTA-2K）", container: "PK2", tat: IN } },
];

export const MORE_LAB_TESTS: LabMaster[] = ROWS.map((r) => ({
  code: r.code,
  name: r.name,
  abbr: r.abbr,
  group: r.group,
  specimen: r.specimen ?? "血液",
  ...(r.contains ? { contains: r.contains } : {}),
  aliases: r.aliases,
  ...(r.needs ? { needs: r.needs } : {}),
}));

export const MORE_LAB_INFO: Record<string, LabInfo> = Object.fromEntries(ROWS.map((r) => [r.code, r.info]));

/** Where the item lists and their billing sections come from (shown under the order screen). */
export const LAB_SOURCES = [
  { name: "SRL 総合検査案内 2026-2027（項目・略語・材料・容器記号・所要日数）", url: "https://test-guide.srl.info/" },
  { name: "BML 検査案内（項目・材料の照らし合わせ）", url: "https://uwb01.bml.co.jp/kensa/" },
  { name: "LSI メディエンス 検査項目解説（項目・材料の照らし合わせ）", url: "https://data.medience.co.jp/guide/" },
  { name: "医科診療行為マスター（検体検査の区分 D000〜 と点数。厚生労働省 診療報酬情報提供サービス）", url: "https://shinryohoshu.mhlw.go.jp/shinryohoshu/downloadMenu/sFile" },
] as const;
