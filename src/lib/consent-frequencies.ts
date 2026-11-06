import type { ProcedureConsentCode } from "./consent-procedures";
// 出典は画面・印刷には出さない。対象手技・合併症・母集団を区別して保持する。
// 数値を確認できない術式・レジメン等の頻度は担当医が個別欄に記録する。
export const CONSENT_FREQUENCIES: Partial<Record<ProcedureConsentCode, { text: string; source: string }[]>> = {
  // 日本消化器内視鏡学会 第7回全国調査（2019–2021）
  // https://www.jges.net/citizen/check-cure/no3-4
  "CONSENT-ERCP": [{ text: "全国調査における偶発症全体：診断的ERCP 0.169%、治療的ERCP 1.619%。", source: "日本消化器内視鏡学会 第7回全国調査（2019〜2021年）" }],
  // Ashford and St Peter's Hospitals NHS Foundation Trust: diagnostic OGD, perforation 1/10,000.
  // https://www.asph.nhs.uk/leaflets/3528-endoscopy-leaflet-having-a-gastroscopy-ogd
  "CONSENT-EGD": [{ text: "観察を目的とする胃カメラでの穿孔の目安：約1万人に1人。", source: "Ashford and St Peter's Hospitals NHS Foundation Trust, Having a Gastroscopy (OGD)" }],
  // Leeds Teaching Hospitals NHS Trust: colonoscopy perforation 1/1,500; post-polypectomy bleeding 1/100.
  // https://www.leedsth.nhs.uk/patients/resources/having-a-gastroscopy-and-colonoscopy-a-guide-to-the-test/
  "CONSENT-COLONOSCOPY": [{ text: "大腸内視鏡検査での穿孔の目安：約1,500人に1人。ポリープ切除後の出血の目安：約100人に1人。", source: "Leeds Teaching Hospitals NHS Trust, Having a Gastroscopy and Colonoscopy" }],
  // University Hospital Southampton NHS Foundation Trust: adult post-LP headache about 1/10.
  // https://www.uhs.nhs.uk/Media/UHS-website-2019/Patientinformation/Brain-and-spine/Lumbar-puncture-2048-PIL.pdf
  "CONSENT-LP": [{ text: "成人の穿刺後頭痛の目安：約10人に1人。", source: "University Hospital Southampton NHS Foundation Trust, Lumbar puncture" }],
  // Norfolk and Norwich University Hospitals NHS Foundation Trust: blood-stained urine 1/20; transfusion 1/100.
  // https://www.nnuh.nhs.uk/publication/download/kidney-biopsy-v6/
  "CONSENT-RENAL-BIOPSY": [{ text: "血尿の目安：約20人に1人。出血により輸血が必要になる目安：約100人に1人。", source: "Norfolk and Norwich University Hospitals NHS Foundation Trust, Kidney biopsy v6" }],
  // The Rotherham NHS Foundation Trust: bleeding at biopsy site about 1/100.
  // https://www.therotherhamft.nhs.uk/patients-and-visitors/patient-information/bone-marrow-biopsy
  "CONSENT-MARROW": [{ text: "骨髄生検の採取部位からの出血の目安：約100人に1人。", source: "The Rotherham NHS Foundation Trust, Bone marrow biopsy" }],
  // Oxford University Hospitals NHS Foundation Trust: pneumothorax 1/100; infection 1/200.
  // https://www.ouh.nhs.uk/patient-guide/leaflets/files/94038pacemaker.pdf
  "CONSENT-PACEMAKER": [{ text: "気胸の目安：約100人に1人。植込み後の感染の目安：約200人に1人。", source: "Oxford University Hospitals NHS Foundation Trust, Implantation of a pacemaker" }],
  // NHS Highland, Abdominal Paracentesis: significant haemorrhage 0.2%.
  // https://www.rightdecisions.scot.nhs.uk/media/ymkpgxq2/tam671-abdominal-paracentesis-pil.pdf
  "CONSENT-PARACENTESIS": [{ text: "重大な出血の目安：約1,000人に2人。", source: "NHS Highland, Abdominal Paracentesis" }],
  // BSG/RCR/RCP 2020 liver biopsy guideline: major bleeding in image-guided biopsies 0.1–4.6% (review).
  // https://doi.org/10.1136/GUTJNL-2020-321299
  "CONSENT-LIVER-BIOPSY": [{ text: "画像で位置を確認して行う肝生検の重大な出血：報告による目安は0.1〜4.6%。", source: "BSG/RCR/RCP, Guidelines on the use of liver biopsy in clinical practice, 2020" }],
  // Joint ICS/NCCP(I)/IAB 2019 diagnostic flexible bronchoscopy guideline: TBLB pneumothorax 1–6%.
  // https://pmc.ncbi.nlm.nih.gov/articles/PMC6681731/
  "CONSENT-BRONCHOSCOPY": [{ text: "経気管支肺生検を行う場合の気胸の目安：1〜6%。", source: "ICS/NCCP(I)/IAB, Guidelines for Diagnostic Flexible Bronchoscopy in Adults, 2019" }],
};
