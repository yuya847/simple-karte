// 研修医の記事とオーダを、指導医か上級医があとで確かめる（カウンターサイン）。
// Who wrote it, and who confirmed it when, are kept with each item. Code only lists what is still
// unconfirmed and checks who may confirm; whether the record is right is decided by the doctor reading it.

import { doctorOf, teamOf, type Doctor } from "./doctors";
import { NARCOTICS } from "./drug-class";
import { findDrug } from "./master";
import type { StandingOrders } from "./standing";
import type { DayOffset, Order } from "./types";

export const COSIGN_SOURCES = {
  record: {
    label: "厚生労働省「医師臨床研修指導ガイドライン －2024年度版－」第2章「その他（経験すべき診察法・検査・手技等）」⑦診療録（24ページ）：指導医あるいは上級医は適切な指導を行った上で記録を残す",
    url: "https://www.mhlw.go.jp/content/001364766.pdf",
  },
  team: {
    label: "厚生労働省医政局長通知「医師法第16条の2第1項に規定する臨床研修に関する省令の施行について」（令和8年3月31日一部改正）第2の5(1)コ(ｱ)：指導医の指導監督の下、上級医（研修医よりも臨床経験の長い医師）が研修医を直接指導する（屋根瓦方式）",
    url: "https://www.mhlw.go.jp/content/10800000/001681347.pdf",
  },
  confirm: {
    label: "厚生労働省「医療情報システムの安全管理に関するガイドライン 第7.0版 システム運用編」14 遵守事項⑨：入力者と確定者の識別情報と日時を記録する。確定は権限のある利用者に限る。代行入力は内容を確かめてから確定（承認）する",
    url: "https://www.mhlw.go.jp/content/10808000/001716295.pdf",
  },
};

/** What the sources above do not say; this fictional hospital's choices. */
export const COSIGN_RULES = {
  effect: "研修医のオーダと指示簿は確定するとすぐ有効になり、指示受け・実施へ進みます。指導医か上級医があとで確かめます（ガイドラインと施行通知には、確認の前にオーダを有効にするかの定めはありません）。",
  blocked: "抗がん薬（レジメン）と麻薬は、研修医は確定できません。指導医か上級医が確定します。",
  who: "確かめるのは同じチームの指導医か上級医です。書いた本人は確かめられません。",
};

/** 麻薬 by drug code: the master items whose 電子添文 marks them 麻薬 (drug-class.ts). A 研修医 does not confirm them. */
export const NARCOTIC_CODES: ReadonlySet<string> = NARCOTICS;

export type CosignKind = "記事" | "記事の修正" | "オーダ" | "中止" | "延長" | "指示簿";

export interface When {
  day: DayOffset;
  time: string;
}

export interface CosignItem {
  id: string;
  /** The record it is about: a note's or an order's id, or "stop:◯" / "extend:◯" for a stop or an extension. */
  ref: string;
  patientId: string;
  kind: CosignKind;
  /** What was written or ordered, as shown to the one who confirms. */
  text: string;
  /** The 研修医 who wrote it. */
  by: string;
  team: string;
  at: When;
  /** 2 and up: the note was corrected after it was written (the earlier confirmation no longer counts). */
  version?: number;
  confirmed?: { by: string; as: "指導医" | "上級医"; at: When; comment?: string };
}

export const pendingOf = (items: CosignItem[], patientId?: string) => items.filter((i) => !i.confirmed && (!patientId || i.patientId === patientId));

/** As what this doctor confirms a 研修医's record, or null when they cannot. */
export function confirmerAs(d: Doctor | undefined): "指導医" | "上級医" | null {
  if (!d) return null;
  return d.rank === "指導医" ? "指導医" : d.rank === "専攻医" ? "上級医" : null;
}

/** Why this doctor cannot confirm the item, or null when they can. */
export function confirmDeny(name: string, item: CosignItem): string | null {
  const d = doctorOf(name);
  const as = confirmerAs(d);
  if (!d || !as) return "研修医の記録を確かめるのは、指導医か上級医です。";
  if (item.by === name) return "自分の記録は確かめられません。";
  if (d.team !== item.team) return `${item.team}の指導医か上級医が確かめます。`;
  if (item.confirmed) return "確認済みです。";
  return null;
}

/** "指導医 高橋" / "上級医 山本（専攻医）": the name with what they confirmed as. */
export const signerLabel = (name: string, as: "指導医" | "上級医") => (name.startsWith(as) ? name : `${as} ${name}`);

/** The mark on the record: 「指導医の確認待ち」 or 「確認 指導医 高橋 10:30」. */
export function cosignLabel(item: CosignItem): string {
  if (!item.confirmed) return item.version && item.version > 1 ? `指導医の確認待ち（第${item.version}版）` : "指導医の確認待ち";
  const c = item.confirmed;
  return `確認 ${signerLabel(c.by, c.as)} ${c.at.time}`;
}

/** New items for what a 研修医 confirmed (one per record). */
export function newItems(base: { patientId: string; by: string; at: When }, rows: { ref: string; kind: CosignKind; text: string }[], newId: () => string): CosignItem[] {
  const team = teamOf(base.by);
  return rows.map((r) => ({ id: newId(), ref: r.ref, patientId: base.patientId, kind: r.kind, text: r.text, by: base.by, team, at: base.at }));
}

/**
 * A 研修医 corrected a note: its item goes back to unconfirmed with the new text (the version counts up),
 * or a new item is made when the note had none.
 */
export function noteRevised(items: CosignItem[], base: { ref: string; patientId: string; by: string; at: When; text: string }, newId: () => string): CosignItem[] {
  const i = items.findIndex((x) => x.ref === base.ref);
  if (i < 0) return [...items, ...newItems(base, [{ ref: base.ref, kind: "記事の修正", text: base.text }], newId).map((x) => ({ ...x, version: 2 }))];
  const old = items[i];
  const next: CosignItem = { ...old, kind: "記事の修正", text: base.text, at: base.at, version: (old.version ?? 1) + 1, confirmed: undefined };
  return items.map((x, j) => (j === i ? next : x));
}

/**
 * Confirm the chosen items as this doctor. Items this doctor may not confirm are left as they are and
 * returned in `refused` with the reason.
 */
export function confirmItems(items: CosignItem[], ids: string[], name: string, at: When, comment?: string): { items: CosignItem[]; done: CosignItem[]; refused: { item: CosignItem; why: string }[] } {
  const as = confirmerAs(doctorOf(name));
  const want = new Set(ids);
  const done: CosignItem[] = [];
  const refused: { item: CosignItem; why: string }[] = [];
  const out = items.map((x) => {
    if (!want.has(x.id)) return x;
    const why = confirmDeny(name, x);
    if (why || !as) {
      refused.push({ item: x, why: why ?? "" });
      return x;
    }
    const next: CosignItem = { ...x, confirmed: { by: name, as, at, ...(comment?.trim() ? { comment: comment.trim() } : {}) } };
    done.push(next);
    return next;
  });
  return { items: out, done, refused };
}

/** The item of each record (by ref), for the marks on the record. */
export const byRef = (items: CosignItem[]): Record<string, CosignItem> => Object.fromEntries(items.map((i) => [i.ref, i]));

/** Why a 研修医 cannot confirm this order (抗がん薬・麻薬), or null. */
export function residentBlock(order: Order | StandingOrders, narcotics: ReadonlySet<string> = NARCOTIC_CODES): string | null {
  const codes = !("type" in order) ? order.prn.map((r) => r.drug.code) : order.type === "injection" ? order.items.map((i) => i.drugCode) : order.type === "prescription" ? [order.drugCode] : [];
  if (codes.some((c) => narcotics.has(c))) return "麻薬";
  if (!("type" in order) ? codes.some((c) => findDrug(c)?.chemo) : order.type === "injection" && order.items.some((i) => findDrug(i.drugCode)?.chemo)) return "抗がん薬（レジメン）";
  return null;
}
