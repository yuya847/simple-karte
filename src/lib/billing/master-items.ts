// Typed access to rows of the official 医科診療行為マスター and 医薬品マスター (server side).
// Column numbers are 1-based as in the official file layout (R08rec3).

import { loadMaster } from "../masters/server";

export interface ShinryoItem {
  code: string;
  name: string;
  baseName: string;
  /** 点数識別: 1 金額 / 3 点数 / 4 購入価格 / 5 %加算 / 6 %減算 / 7 減点 / 8 点数（マイナス） */
  pointKind: string;
  points: number;
  /** 入外適用区分: 0 both / 1 inpatient only / 2 outpatient only */
  inOut: string;
  /** 点数欄集計先識別（入院）. 0 = not for inpatient claims. */
  sumInpatient: string;
  /** 包括対象検査 (1 = 生化学的検査（Ⅰ）の包括項目 …) */
  bundleGroup: string;
  /** 検査等実施判断区分 (1 実施料 / 2 判断料) and グループ区分. */
  judgeKind: string;
  judgeGroup: string;
  /** 注加算コード・通番: same code = may be added; same 通番 too = only one of them. */
  chuCode: string;
  chuSeq: string;
  /** 告示等識別区分（１）（２）: 1 基本 / 3 合成 / 5 準用 / 7 加算 / 9 通則加算 */
  kokuji1: string;
  kokuji2: string;
  maxCount: number;
  ageLow: string;
  ageHigh: string;
  shisetsu: string[];
  /** 物価対応料区分 (1 = the 物価対応料 itself, 2 = related) and its group. */
  bukkaKind: string;
  bukkaGroup: string;
  /** 点数表の区分 like "A100", from コード表用番号. */
  kubun: string;
  abolished: string;
}

export interface IyakuItem {
  code: string;
  name: string;
  unit: string;
  /** 薬価（円）per unit. */
  price: number;
  /** 剤形: 1 内用 / 4 注射 / 6 外用 (as in the master). */
  form: string;
  abolished: string;
}

let shinryo: Map<string, ShinryoItem> | null = null;
let iyaku: Map<string, IyakuItem> | null = null;

export function shinryoItem(code: string): ShinryoItem | undefined {
  if (!shinryo) {
    const m = loadMaster("s");
    const at = (col: number) => m.cols!.indexOf(col);
    const i = {
      code: at(3), name: at(5), pk: at(11), pts: at(12), inOut: at(13), bundle: at(16), sumIn: at(66),
      judgeK: at(50), judgeG: at(51), chuC: at(38), chuS: at(39), k1: at(68), k2: at(69), max: at(36),
      ageL: at(41), ageH: at(42), bukkaK: at(132), bukkaG: at(133), alpha: at(85), kubun: at(92), base: at(113), abol: at(88),
    };
    const shisetsuCols = [72, 73, 74, 75, 76, 77, 78, 79, 80, 81].map(at);
    shinryo = new Map(
      m.rows.map((r) => [
        r[i.code],
        {
          code: r[i.code],
          name: r[i.name],
          baseName: r[i.base],
          pointKind: r[i.pk],
          points: Number(r[i.pts]),
          inOut: r[i.inOut],
          sumInpatient: r[i.sumIn],
          bundleGroup: r[i.bundle],
          judgeKind: r[i.judgeK],
          judgeGroup: r[i.judgeG],
          chuCode: r[i.chuC],
          chuSeq: r[i.chuS],
          kokuji1: r[i.k1],
          kokuji2: r[i.k2],
          maxCount: Number(r[i.max]),
          ageLow: r[i.ageL],
          ageHigh: r[i.ageH],
          shisetsu: shisetsuCols.map((c) => r[c]),
          bukkaKind: r[i.bukkaK],
          bukkaGroup: r[i.bukkaG],
          kubun: `${r[i.alpha]}${r[i.kubun].padStart(3, "0")}`,
          abolished: r[i.abol],
        },
      ]),
    );
  }
  return shinryo.get(code);
}

export function iyakuItem(code: string): IyakuItem | undefined {
  if (!iyaku) {
    const m = loadMaster("y");
    const at = (col: number) => m.cols!.indexOf(col);
    iyaku = new Map(
      m.rows.map((r) => [
        r[at(3)],
        { code: r[at(3)], name: r[at(5)], unit: r[at(10)], price: Number(r[at(12)]), form: r[at(28)], abolished: r[at(31)] },
      ]),
    );
  }
  return iyaku.get(code);
}

/** The 物価対応料 codes linked to an 入院料 (same 物価対応料グループ). */
export function bukkaFor(baseCode: string): ShinryoItem[] {
  const base = shinryoItem(baseCode);
  if (!base || base.bukkaKind !== "2") return [];
  const m = loadMaster("s");
  const at = (col: number) => m.cols!.indexOf(col);
  return m.rows
    .filter((r) => r[at(132)] === "1" && r[at(133)] === base.bukkaGroup)
    .map((r) => shinryoItem(r[at(3)])!)
    .filter(Boolean);
}

export interface CommentItem {
  code: string;
  name: string;
  /** パターン (10 自由文, 20 なし, 30 文字の一部, 40 数字の埋め込み, 50 年月日 …). */
  pattern: string;
}

let comments: Map<string, CommentItem> | null = null;

/** コメントマスター (full rows: 4 パターン, 7 漢字名称, 22 コメントコード; 1-based). */
export function commentItem(code: string): CommentItem | undefined {
  if (!comments) {
    const m = loadMaster("c");
    comments = new Map(m.rows.map((r) => [r[21], { code: r[21], name: r[6], pattern: r[3] }]));
  }
  return comments.get(code);
}

export interface TokkiItem {
  code: string;
  name: string;
  /** 単位コード (別表22). "0" = none in the master: the receipt must give one. */
  unitCode: string;
  unitName: string;
  /** 金額種別: 1 金額 / 2 購入価格 / 5 %加算 / 9 乗算割合. */
  priceKind: string;
  /** 金額 (円). For 酸素 it is the upper limit of the 単価. */
  price: number;
  /** 酸素等区分: 0 / 1 補正率・高気圧 / 2 CE / 3 LGC / 4 大型ボンベ / 5 小型ボンベ / 9 窒素. */
  oxygenKind: string;
}

let tokki: Map<string, TokkiItem> | null = null;

/** 特定器材マスター (cols 3 code, 5 name, 8 単位コード, 10 単位名, 11 金額種別, 12 金額, 21 酸素等区分). */
export function tokkiItem(code: string): TokkiItem | undefined {
  if (!tokki) {
    const m = loadMaster("t");
    const at = (col: number) => m.cols!.indexOf(col);
    tokki = new Map(
      m.rows.map((r) => [
        r[at(3)],
        { code: r[at(3)], name: r[at(5)], unitCode: r[at(8)], unitName: r[at(10)], priceKind: r[at(11)], price: Number(r[at(12)]), oxygenKind: r[at(21)] },
      ]),
    );
  }
  return tokki.get(code);
}

/** 外用薬の外来調剤料。コードと点数を現行マスターから取得する。 */
export function topicalDispensingItem(): ShinryoItem | undefined {
  shinryoItem("");
  return [...shinryo!.values()].find(m => m.kubun === "F000" && m.name.normalize("NFKC") === "調剤料(外用薬)" && m.abolished === "99999999");
}
