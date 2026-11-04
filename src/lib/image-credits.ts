// 放射線画像の引き出しで出す「本物の医用画像」の出典。すべて Wikimedia Commons の公開ライセンス（CC0・CC BY・CC BY-SA・パブリックドメイン）の
// 教材用の画像で、架空の患者に割り当てたもの。この患者のものではない。実在の患者データ・院のデータは入れない。
// ライセンスは 2026-11-04 に各ページの文言（ライセンスのテンプレート）を読んで確かめた。public/images/ATTRIBUTION.md にも同じ一覧がある。
// 画像は public/images/radiology/ に、幅 1200px 以下の JPEG にして置いてある（縮小のほかは、ここに書いた加工だけ）。

export type ImageLicense = "CC0 1.0" | "CC BY-SA 3.0" | "CC BY-SA 4.0" | "パブリックドメイン";

export interface ImageCredit {
  /** 画像の ID（ファイル名の元） */
  id: string;
  /** サイトの中のパス（public/ から） */
  src: string;
  /** Wikimedia Commons のファイル名 */
  title: string;
  /** 出典のページ */
  page: string;
  /** 作者（ページの記載のまま、短く） */
  author: string;
  license: ImageLicense;
  licenseUrl?: string;
  /** 画像の幅・高さ（置いてある JPEG の画素） */
  width: number;
  height: number;
  /** 何の画像か（ページの説明を短く日本語にしたもの。所見の判定ではない） */
  what: string;
  /** 縮小のほかに加えた加工 */
  modified?: string;
}

const CC0 = "https://creativecommons.org/publicdomain/zero/1.0/";
const BYSA3 = "https://creativecommons.org/licenses/by-sa/3.0/";
const BYSA4 = "https://creativecommons.org/licenses/by-sa/4.0/";
const HAGG = "Mikael Häggström, M.D.";
const UPPSALA = "Department of Radiology, Uppsala University Hospital（Mikael Häggström がアップロード）";
const NEVIT = "Nevit Dilmen";
const COMMONS = "https://commons.wikimedia.org/wiki/";

const list: ImageCredit[] = [
  { id: "chest-pa-normal", src: "/images/radiology/chest-pa-normal.jpg", title: "File:Normal posteroanterior (PA) chest radiograph (X-ray).jpg", page: `${COMMONS}File:Normal_posteroanterior_(PA)_chest_radiograph_(X-ray).jpg`, author: HAGG, license: "CC0 1.0", licenseUrl: CC0, width: 1049, height: 1200, what: "胸部X線 立位正面（PA）。21 歳女性、正常" },
  { id: "chest-lobar-pneumonia", src: "/images/radiology/chest-lobar-pneumonia.jpg", title: "File:X-ray of lobar pneumonia.jpg", page: `${COMMONS}File:X-ray_of_lobar_pneumonia.jpg`, author: HAGG, license: "CC0 1.0", licenseUrl: CC0, width: 1200, height: 954, what: "胸部X線 正面。67 歳男性、右中葉の大葉性肺炎（右の下肺野に浸潤影）" },
  { id: "chest-kerley-b", src: "/images/radiology/chest-kerley-b.jpg", title: "File:Chest radiograph of a lung with Kerley B lines.jpg", page: `${COMMONS}File:Chest_radiograph_of_a_lung_with_Kerley_B_lines.jpg`, author: HAGG, license: "CC0 1.0", licenseUrl: CC0, width: 1200, height: 1077, what: "胸部X線 正面。83 歳男性、冠動脈バイパス術後の心不全（Kerley B 線・肺うっ血）" },
  { id: "chest-chf-film", src: "/images/radiology/chest-chf-film.jpg", title: "File:Radiology 1300577 Nevit.jpg", page: `${COMMONS}File:Radiology_1300577_Nevit.jpg`, author: NEVIT, license: "CC BY-SA 3.0", licenseUrl: BYSA3, width: 1200, height: 900, what: "胸部X線 正面（フィルムの写真）。うっ血性心不全（心拡大・両側の肺水腫と胸水）", modified: "グレースケールに変換、左上のラベルを黒で塗りつぶし" },
  { id: "abdomen-supine", src: "/images/radiology/abdomen-supine.jpg", title: "File:Medical X-Ray imaging BXL03 nevit.jpg", page: `${COMMONS}File:Medical_X-Ray_imaging_BXL03_nevit.jpg`, author: NEVIT, license: "CC BY-SA 3.0", licenseUrl: BYSA3, width: 982, height: 1200, what: "腹部X線 臥位正面" },
  { id: "head-ct-08", src: "/images/radiology/head-ct-08.jpg", title: "File:Computed tomography of human brain (8).png", page: `${COMMONS}File:Computed_tomography_of_human_brain_(8).png`, author: UPPSALA, license: "CC0 1.0", licenseUrl: CC0, width: 512, height: 512, what: "頭部CT（造影）横断像 8/34（頭蓋底の側）" },
  { id: "head-ct-13", src: "/images/radiology/head-ct-13.jpg", title: "File:Computed tomography of human brain (13).png", page: `${COMMONS}File:Computed_tomography_of_human_brain_(13).png`, author: UPPSALA, license: "CC0 1.0", licenseUrl: CC0, width: 512, height: 512, what: "頭部CT（造影）横断像 13/34" },
  { id: "head-ct-18", src: "/images/radiology/head-ct-18.jpg", title: "File:Computed tomography of human brain (18).png", page: `${COMMONS}File:Computed_tomography_of_human_brain_(18).png`, author: UPPSALA, license: "CC0 1.0", licenseUrl: CC0, width: 512, height: 512, what: "頭部CT（造影）横断像 18/34（側脳室の高さ）" },
  { id: "head-ct-23", src: "/images/radiology/head-ct-23.jpg", title: "File:Computed tomography of human brain (23).png", page: `${COMMONS}File:Computed_tomography_of_human_brain_(23).png`, author: UPPSALA, license: "CC0 1.0", licenseUrl: CC0, width: 512, height: 512, what: "頭部CT（造影）横断像 23/34" },
  { id: "head-ct-28", src: "/images/radiology/head-ct-28.jpg", title: "File:Computed tomography of human brain (28).png", page: `${COMMONS}File:Computed_tomography_of_human_brain_(28).png`, author: UPPSALA, license: "CC0 1.0", licenseUrl: CC0, width: 512, height: 512, what: "頭部CT（造影）横断像 28/34（頭頂の側）" },
  { id: "chest-ct-lobar-pneumonia", src: "/images/radiology/chest-ct-lobar-pneumonia.jpg", title: "File:CT of lobar pneumonia.jpg", page: `${COMMONS}File:CT_of_lobar_pneumonia.jpg`, author: HAGG, license: "CC0 1.0", licenseUrl: CC0, width: 775, height: 755, what: "胸部CT（横断・冠状断・矢状断の 3 面）。67 歳男性、右中葉の大葉性肺炎" },
  { id: "abdomen-ct-pyelonephritis-plain", src: "/images/radiology/abdomen-ct-pyelonephritis-plain.jpg", title: "File:Bilateral pyelonephritis on plain CT scan.jpg", page: `${COMMONS}File:Bilateral_pyelonephritis_on_plain_CT_scan.jpg`, author: "Cerevisae", license: "CC BY-SA 4.0", licenseUrl: BYSA4, width: 512, height: 512, what: "腹部CT（単純）横断像。腎周囲の脂肪織の濃度上昇（腎盂腎炎）" },
  { id: "abdomen-ct-pyelonephritis-contrast", src: "/images/radiology/abdomen-ct-pyelonephritis-contrast.jpg", title: "File:Akute Pyelonephritis links mit Minderperfusion der linken Niere 52M - CT - 001.jpg", page: `${COMMONS}File:Akute_Pyelonephritis_links_mit_Minderperfusion_der_linken_Niere_52M_-_CT_-_001.jpg`, author: "Hellerhoff", license: "CC BY-SA 4.0", licenseUrl: BYSA4, width: 1200, height: 938, what: "腹部CT（造影）4 面：上が動脈相の横断・冠状断、下が門脈相。52 歳男性、左の急性腎盂腎炎（左腎の造影不良と腎周囲の反応）" },
  { id: "abdomen-ct-normal-20", src: "/images/radiology/abdomen-ct-normal-20.jpg", title: "File:CT of a normal abdomen and pelvis, axial plane 20.png", page: `${COMMONS}File:CT_of_a_normal_abdomen_and_pelvis,_axial_plane_20.png`, author: HAGG, license: "CC0 1.0", licenseUrl: CC0, width: 786, height: 346, what: "腹部・骨盤CT（造影）横断像 20（上腹部）と位置を示す冠状断。正常" },
  { id: "abdomen-ct-normal-33", src: "/images/radiology/abdomen-ct-normal-33.jpg", title: "File:CT of a normal abdomen and pelvis, axial plane 33.png", page: `${COMMONS}File:CT_of_a_normal_abdomen_and_pelvis,_axial_plane_33.png`, author: HAGG, license: "CC0 1.0", licenseUrl: CC0, width: 786, height: 346, what: "腹部・骨盤CT（造影）横断像 33（腎の高さ）と位置を示す冠状断。正常" },
  { id: "knee-ap", src: "/images/radiology/knee-ap.jpg", title: "File:X-ray of a normal knee by anteroposterior projection.jpg", page: `${COMMONS}File:X-ray_of_a_normal_knee_by_anteroposterior_projection.jpg`, author: HAGG, license: "CC0 1.0", licenseUrl: CC0, width: 669, height: 1200, what: "右膝X線 正面。31 歳男性、正常" },
  { id: "knee-lat", src: "/images/radiology/knee-lat.jpg", title: "File:X-ray of a normal knee by lateral projection.jpg", page: `${COMMONS}File:X-ray_of_a_normal_knee_by_lateral_projection.jpg`, author: HAGG, license: "CC0 1.0", licenseUrl: CC0, width: 701, height: 1200, what: "右膝X線 側面。31 歳男性、外傷なし" },
  { id: "pelvis-ap", src: "/images/radiology/pelvis-ap.jpg", title: "File:X-ray of the pelvis of an 18 year old male - case 1 - anteroposterior.jpg", page: `${COMMONS}File:X-ray_of_the_pelvis_of_an_18_year_old_male_-_case_1_-_anteroposterior.jpg`, author: "Staff at the Department of Radiology, UC San Diego Health（bonepit.com、Commons の PD-US-Medical imaging）", license: "パブリックドメイン", width: 1200, height: 935, what: "骨盤・両股関節X線 正面。18 歳男性、正常" },
  { id: "echo-4ch", src: "/images/radiology/echo-4ch.jpg", title: "File:Echocardiogram 4chambers.jpg", page: `${COMMONS}File:Echocardiogram_4chambers.jpg`, author: "Kjetil Lenes, Oslo（PD-self）", license: "パブリックドメイン", width: 636, height: 434, what: "心エコー 心尖部四腔像（静止画）" },
  { id: "us-cellulitis", src: "/images/radiology/us-cellulitis.jpg", title: "File:UOTW 42 - Ultrasound of the Week 2.jpg", page: `${COMMONS}File:UOTW_42_-_Ultrasound_of_the_Week_2.jpg`, author: "Ben Smith（Ultrasound of the Week）", license: "CC BY-SA 4.0", licenseUrl: BYSA4, width: 792, height: 470, what: "軟部組織の超音波。52 歳男性の大腿の蜂窩織炎（皮下の敷石状の浮腫、膿瘍なし）" },
];

export const IMAGE_CREDITS: Record<string, ImageCredit> = Object.fromEntries(list.map((c) => [c.id, c]));

export function findCredit(id: string): ImageCredit | undefined {
  return IMAGE_CREDITS[id];
}

/** 画面に出す 1 行（例：Wikimedia Commons「File:…」Mikael Häggström, M.D.（CC0 1.0）） */
export function creditLine(c: ImageCredit): string {
  return `Wikimedia Commons「${c.title}」${c.author}（${c.license}）${c.modified ? `　加工：${c.modified}` : ""}`;
}

/** 画像の上に常に出す注記（実在の患者の画像と誤解させないため、hint にしない） */
export const PUBLIC_IMAGE_NOTE = "公開データ（Wikimedia Commons ほか）。架空の患者に割り当てた教材用の画像で、この患者のものではありません";
