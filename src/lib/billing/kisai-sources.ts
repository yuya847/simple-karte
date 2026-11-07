/** 一次資料を2026-11-07に取得・該当箇所を確認。模擬レセプト用。
 * 点数・回数の算定規則とは独立。未収載は「不要」を意味しない。
 */
export const KISAI_SOURCES = {
  fee: { title: "令和8年 医科点数表", version: "令和8年度", url: "https://www.mhlw.go.jp/content/12400000/001686842.pdf" },
  notice: { title: "保医発0305第6号 別添1", version: "令和8年3月5日・1007訂正後", url: "https://www.mhlw.go.jp/content/12400000/001757385.pdf" },
  facility: { title: "保医発0305第7号 別添2", version: "令和8年3月5日・1007訂正後", url: "https://www.mhlw.go.jp/content/12400000/001757361.pdf" },
  special: { title: "保医発0305第8号", version: "令和8年3月5日・1007訂正後", url: "https://www.mhlw.go.jp/content/12400000/001757367.pdf" },
  instructions: { title: "保医発0327第2号 診療報酬請求書等の記載要領", version: "令和8年3月27日・1007訂正後", url: "https://www.mhlw.go.jp/content/12400000/001757373.pdf" },
  table: { title: "別表Ⅰ 摘要欄への記載事項等一覧（医科）", version: "令和8年度・0730訂正後（記載要領に同梱）", url: "https://www.mhlw.go.jp/content/12400000/001732129.xlsx" },
  spec: { title: "記録条件仕様（医科用）", version: "令和8年8月版・2026-10-01更新", url: "https://shinryohoshu.mhlw.go.jp/shinryohoshu/file/spec/R08bt1_1_kiroku.pdf" },
  guide: { title: "電子レセプトの作成手引き（医科）", version: "令和8年10月版", url: "https://www.hpdx.or.jp/seikyushiharai/iryokikan/iryokikan_02.files/jiki_i01.pdf" },
  master: { title: "公開コメントマスター c_20261001.csv", version: "2026-10-01", url: "https://shinryohoshu.mhlw.go.jp/shinryohoshu/downloadMenu/" },
} as const;
export interface KisaiBasis {
  source: keyof typeof KISAI_SOURCES;
  section: string;
  /** 要件の抜粋または要約（全文は出典を参照）。 */
  text: string;
}
export const SOURCE_CHECKED_ON = "2026-11-07";
