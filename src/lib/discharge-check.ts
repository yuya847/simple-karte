// 退院の準備: what is usually finished before a patient leaves, gathered by code from the record. It is
// shown when 退院 is carried out (実施); the person decides whether to go ahead. Nothing is judged here.

import type { OrderEntry } from "./types";

export interface DischargeFacts {
  entries: OrderEntry[];
  /** 退院時処方 exists, and when it was handed over (薬剤部「退院時の薬」). */
  homeRx: { exists: boolean; handed: boolean };
  /** Kinds of documents made for this patient (書類作成). */
  documents: string[];
  /** 指導の記録 kinds for this patient. */
  guidance: string[];
  /** An ongoing 身体的拘束. */
  restrained: boolean;
}

export interface CheckItem {
  label: string;
  state: "ok" | "todo" | "none";
  detail: string;
}

export function dischargeChecklist(f: DischargeFacts): CheckItem[] {
  const running = f.entries.filter((e) => e.status === "有効" && (e.order.type === "injection" || (e.order.type === "procedure" && ["PROC-O2", "PROC-FOLEY", "PROC-CVC"].includes(e.order.code))));
  const openGuide = f.entries.filter((e) => e.status === "有効" && e.order.type === "procedure" && e.order.guide?.kind && !f.guidance.includes(e.order.guide.kind));
  return [
    { label: "退院時の薬", state: !f.homeRx.exists ? "none" : f.homeRx.handed ? "ok" : "todo", detail: !f.homeRx.exists ? "退院時処方はありません" : f.homeRx.handed ? "薬剤部が説明して渡しました" : "薬剤部でまだ渡していません" },
    { label: "退院証明書", state: f.documents.includes("退院証明書") ? "ok" : "todo", detail: f.documents.includes("退院証明書") ? "作成済み" : "書類作成でまだ作っていません" },
    { label: "退院療養計画書", state: f.documents.includes("退院療養計画書") ? "ok" : "todo", detail: f.documents.includes("退院療養計画書") ? "作成済み" : "書類作成でまだ作っていません" },
    { label: "指導の依頼", state: openGuide.length ? "todo" : "ok", detail: openGuide.length ? `済んでいない依頼：${[...new Set(openGuide.map((e) => (e.order.type === "procedure" ? e.order.guide?.kind : "")))].join("・")}` : "開いている依頼はありません" },
    { label: "身体的拘束", state: f.restrained ? "todo" : "ok", detail: f.restrained ? "続いています（終了の記録がまだ）" : "続いているものはありません" },
    { label: "注射・酸素・カテーテルの有効なオーダ", state: running.length ? "todo" : "ok", detail: running.length ? `${running.length}件が有効です（退院の前に中止する）` : "有効なものはありません" },
  ];
}
