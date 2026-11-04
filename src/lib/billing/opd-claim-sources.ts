// 外来の算定の出典。画面（クライアント）からも読むので、サーバー専用の opd-claim.ts から分けてある。
export const OPD_CLAIM_SOURCES = [
  { label: "診療報酬の算定方法（令和6年厚生労働省告示第57号）医科 第1章 基本診療料 A000 初診料・A001 再診料（注8 外来管理加算）、第2章 D026 検体検査判断料・D400 血液採取、E001〜E203 画像診断、F400 処方箋料、G000〜G004 注射、J000 創傷処置・J018 喀痰吸引・J022-2 摘便・J024 酸素吸入", url: "https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/0000188411_00060.html" },
  { label: "医科診療行為マスター（点数はこのファイルから読む）", url: "https://shinryohoshu.mhlw.go.jp/shinryohoshu/downloadMenu/sFile" },
];
