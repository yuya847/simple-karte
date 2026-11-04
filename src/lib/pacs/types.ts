// PACS（医用画像の保存と表示の仕組み）ビューアで使う型。画像はすべてコードで作る架空の合成画像。

import type { ImagingStudy } from "../types";

/** 部位（合成画像の形の種類）。 */
export type BodyPart = "chest" | "abdomen" | "chest-abd" | "abd-pelvis" | "head" | "c-spine" | "l-spine" | "knee" | "leg" | "other";

/** X線の撮影方向。 */
export type XrayView = "PA" | "AP" | "LAT" | "FRONT" | "SUPINE" | "ERECT";

/** 患者から見た向き（DICOM の考え方：R 右・L 左・A 前・P 後・H 頭・F 足）。 */
export type Dir = "R" | "L" | "A" | "P" | "H" | "F";

/**
 * 画像の作り方。xray・ct・mr・us はコードで作る架空の合成画像。
 * photo は公開データ（Wikimedia Commons ほか）の本物の医用画像（src/lib/image-credits.ts の ID。1 枚＝1 スライス）。
 */
export type Generator =
  | { kind: "xray"; part: BodyPart; view: XrayView; side?: "R" | "L" }
  | { kind: "ct"; part: BodyPart; contrast: boolean }
  | { kind: "mr"; part: BodyPart; weighting: "T1" | "T2"; plane: "axial" | "sagittal"; side?: "R" | "L" }
  | { kind: "us"; part: BodyPart }
  | { kind: "photo"; images: string[] };

/**
 * 架空の読影レポートに合わせた合成画像の形（架空）。所見を判定するものではなく、
 * 「この架空の検査の画像はこう描く」という描き方の指定。
 */
export interface PhantomHint {
  /** 心胸郭比（0〜1）。心臓の幅 ÷ 胸郭の幅。 */
  ctr?: number;
  /** 胸水の高さ（mm）。 */
  effusion?: { right: number; left: number };
  /** 肺うっ血の強さ（0〜1）。 */
  congestion?: number;
  /** 浸潤影の場所。 */
  consolidation?: { side: "R" | "L"; zone: "upper" | "lower" };
  /** 軟部組織の腫れ（mm）。 */
  swelling?: number;
}

export interface WindowPreset {
  key: string;
  label: string;
  ww: number;
  wl: number;
}

/** 1 シリーズ（同じ条件で撮った画像のまとまり）。画素はここから作る。 */
export interface SeriesSpec {
  uid: string;
  number: number;
  /** 例：「立位正面（PA）」「単純 5mm」「T2強調像」 */
  description: string;
  gen: Generator;
  hint: PhantomHint;
  /** 患者ごとの種（同じ患者なら同じ体つき）。 */
  anatomySeed: number;
  /** 撮影ごとの種（位置のずれ・雑音）。 */
  acqSeed: number;
  sex: "男" | "女";
  /** 列の数（横） */
  width: number;
  /** 行の数（縦） */
  height: number;
  /** 画素の大きさ（mm）。縦横同じ。公開画像（photo）は大きさが分からないので 1（計測は画素の数で出す）。 */
  spacing: number;
  /** スライスの位置（mm）。X線は 1 枚なので [0]。 */
  positions: number[];
  /** スライス厚（mm）。X線にはない。 */
  thickness?: number;
  unit: "HU" | "画素値" | "信号値";
  /** 開いたときの WW/WL。"auto" は画像の画素の分布から決める（X線・超音波）。 */
  window: { ww: number; wl: number } | "auto";
  /** WW/WL のプリセット（CT なら肺野・縦隔・骨・腹部）。 */
  presets: WindowPreset[];
  /** 画像の右（+x）と下（+y）が、患者のどちら向きか。 */
  orient: { right: Dir; down: Dir };
}

/** 1 検査（ビューアの一覧の 1 行）。 */
export interface PacsStudy {
  study: ImagingStudy;
  /** 部位マスターのコード（例：R-CHEST）。比較表示で同じ部位を探すのに使う。 */
  regionKey: string;
  status: "読影済み" | "読影待ち" | "未実施";
  series: SeriesSpec[];
}
