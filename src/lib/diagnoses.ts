// Registered diagnoses (病名). Codes and names come from the official 傷病名マスター and
// 修飾語マスター unchanged. The patients and their diagnoses are FICTIONAL.

import type { DayOffset } from "./types";

/** 未コード化傷病名: a name typed by hand that is not in the master. Allowed, but flagged on the claim. */
export const UNCODED = "0000999";

export interface Modifier {
  code: string;
  name: string;
}

export type Outcome = "継続" | "治癒" | "死亡" | "中止";

export interface Diagnosis {
  id: string;
  code: string;
  name: string;
  icd10?: string;
  prefixes: Modifier[];
  suffixes: Modifier[];
  main: boolean;
  start: DayOffset;
  outcome: Outcome;
  outcomeDay?: DayOffset;
}

export function diagnosisLabel(d: Pick<Diagnosis, "name" | "prefixes" | "suffixes">): string {
  return `${d.prefixes.map((m) => m.name).join("")}${d.name}${d.suffixes.map((m) => m.name).join("")}`;
}

export const isSuspected = (d: Diagnosis) => d.suffixes.some((m) => m.code === "8002");

const dx = (id: string, code: string, name: string, icd10: string, start: number, extra: Partial<Diagnosis> = {}): Diagnosis => ({
  id,
  code,
  name,
  icd10,
  prefixes: [],
  suffixes: [],
  main: false,
  start,
  outcome: "継続",
  ...extra,
});

const RIGHT: Modifier = { code: "2056", name: "右" };

export const INITIAL_DIAGNOSES: Record<string, Diagnosis[]> = {
  // 佐倉 修
  "90010231": [
    dx("d-sakura-1", "8831322", "下腿蜂巣炎", "L031", -3, { prefixes: [RIGHT], main: true }),
    dx("d-sakura-2", "8851038", "ＭＲＳＡ菌血症", "A410", 0, { main: true }),
    dx("d-sakura-3", "8836770", "足白癬", "B353", -3),
    dx("d-sakura-4", "8833421", "高血圧症", "I10", -3),
    dx("d-sakura-5", "5301002", "逆流性食道炎", "K210", -3),
  ],
  // 大浦 トメ
  "90010244": [
    dx("d-oura-1", "5070003", "誤嚥性肺炎", "J690", -1, { main: true }),
    dx("d-oura-2", "8842549", "アルツハイマー型認知症", "G309", -1),
    dx("d-oura-3", "5301002", "逆流性食道炎", "K210", -1),
  ],
  // 北村 博
  "90010198": [
    dx("d-kita-1", "4289018", "慢性心不全", "I509", -5, { main: true }),
    dx("d-kita-2", "8840042", "便秘症", "K590", -3),
  ],
  // 森 久美子
  "90010260": [
    dx("d-mori-1", "5901002", "急性腎盂腎炎", "N10", -2, { main: true }),
    dx("d-mori-2", "8844446", "脂質異常症", "E785", -2),
  ],
};
