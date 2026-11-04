// 重複投薬等チェック as the SIMULATED 電子処方箋管理サービス runs it on a prescription before it is registered,
// against the patient's prescriptions and dispensings at other institutions (other-records.ts, FICTIONAL).
// The rules are the ones the public technical guide describes (ERX_CHECK_SOURCES), done in code here:
// - what is checked against: what was prescribed or dispensed in the last 100 days, while it is still being
//   taken — the days of a 内服, and 14 days for what has no days to count by (頓服・外用);
// - 重複投薬: the same ingredient by the same route (all oral here), whatever the brand or strength. The
//   ingredient is this prototype's master's (the real service uses its own drug master);
// - 併用禁忌: only pairs the 電子添文 lists as 併用禁忌 (interactions.ts, and the pairs below for drugs only
//   other institutions gave); 併用注意 is not part of it;
// - without the patient's consent to see the 薬剤情報, only that there is a finding is shown, not the other
//   drug or institution.

import { addDays, formatShort, type CalendarDate } from "../dates";
import { ingredientOf } from "../master";
import { INTERACTIONS, INTERACTION_SOURCES, sourceUrl, type InteractionPair } from "../interactions";
import { OTHER_DRUGS } from "./drug-codes";
import { codesOf, OTHER_INSTITUTIONS, type OtherRx } from "./other-records";
import type { SpecRef } from "./spec";

export const ERX_CHECK_SOURCES: SpecRef[] = [
  { name: "厚生労働省「電子処方箋管理サービス 医療機関・薬局システムベンダ向け技術解説書」", version: "2.05版（令和8年9月）", url: "https://www.mhlw.go.jp/content/001046588.pdf", note: "重複投薬等チェック：同一の投与経路で成分が同じものは1種類と数える、併用禁忌、過去100日、服用期間が判定できない外用・頓服は一律14日、同意がないときは相手の薬まで確認できないこと" },
  { name: "厚生労働省「電子処方箋の運用ガイドライン」（医薬発1218第1号ほか、令和6年12月18日改正）", url: "https://www.mhlw.go.jp/content/11120000/001185244.pdf", note: "電子署名（医師の国家資格を電子的に確かめられる署名とタイムスタンプ）、院内処方の情報には署名が要らないこと" },
];

/** The service looks back this many days. */
export const LOOK_BACK_DAYS = 100;
/** The days a drug with no count of days (頓服・外用) is taken to last. */
export const NO_DAYS_LASTS = 14;

/** The last day the drug is taken, as the service counts it (the issue day is day 1). */
export const takenUntil = (x: OtherRx) => x.issuedOn + (x.timings.length === 0 ? NO_DAYS_LASTS : x.days) - 1;

/** 併用禁忌 with a drug only other institutions gave (the 電子添文 of our drug names it). */
export const OTHER_PAIRS: InteractionPair[] = [
  {
    id: "spl-epl",
    level: "併用禁忌",
    a: ["ORAL-SPL25"],
    b: ["OTHER-EPL25"],
    text: "高カリウム血症が発現することがある（相加・相乗作用により血清カリウム値が上昇する）。",
    refs: [{ doc: "aldactoneA", section: "10.1", as: "エプレレノン（セララ）" }],
  },
];

export interface ErxFinding {
  kind: "重複投薬" | "併用禁忌";
  drug: string;
  drugName: string;
  /** null without the patient's consent to see the 薬剤情報 (only the finding is shown). */
  other: { drugName: string; institution: string; pharmacy: string; issued: string; until: string; via: OtherRx["via"] } | null;
  text: string;
  sources: { label: string; url: string }[];
}

const nameOf = (drug: string) => codesOf(drug)?.name ?? drug;
const ingredient = (drug: string) => OTHER_DRUGS[drug]?.ingredient ?? ingredientOf(drug);
const NO_CONSENT = "（薬剤情報の閲覧に同意がないため、相手の薬と医療機関は出ません）";

/** The checks: every finding names the other record (with consent) and the rule it rests on. */
export function erxChecks(drugs: string[], others: OtherRx[], today: CalendarDate, consent = true): ErxFinding[] {
  const out: ErxFinding[] = [];
  const fmt = (d: number) => formatShort(addDays(today, d));
  const pairs = [...INTERACTIONS.filter((p) => p.level === "併用禁忌"), ...OTHER_PAIRS];
  for (const drug of [...new Set(drugs)]) {
    for (const o of others) {
      // The last 100 days, and only what is still being taken when the new prescription starts (today).
      if (o.issuedOn < -LOOK_BACK_DAYS || takenUntil(o) < 0) continue;
      const other = consent ? { drugName: nameOf(o.drug), institution: OTHER_INSTITUTIONS[o.prescriber].name, pharmacy: OTHER_INSTITUTIONS[o.pharmacy].name, issued: fmt(o.issuedOn), until: fmt(takenUntil(o)), via: o.via } : null;
      const ing = ingredient(drug);
      if (ing && ing === ingredient(o.drug)) {
        out.push({
          kind: "重複投薬",
          drug,
          drugName: nameOf(drug),
          other,
          text: other ? `同じ成分（${ing}）・同じ投与経路（内服）の薬が、${other.institution}の処方で${other.until}まで出ています。` : `ほかの医療機関・薬局の薬と、成分と投与経路が同じです${NO_CONSENT}。`,
          sources: [{ label: `${ERX_CHECK_SOURCES[0].name} ${ERX_CHECK_SOURCES[0].version}（同一の投与経路・同一成分。成分はこの試作のマスターの成分名で比べる）`, url: ERX_CHECK_SOURCES[0].url }],
        });
      }
      for (const p of pairs) {
        const hit = (p.a.includes(drug) && p.b.includes(o.drug)) || (p.b.includes(drug) && p.a.includes(o.drug));
        if (!hit) continue;
        out.push({
          kind: "併用禁忌",
          drug,
          drugName: nameOf(drug),
          other,
          text: other ? p.text : `ほかの医療機関・薬局の薬と併用禁忌です${NO_CONSENT}。`,
          // Without consent the 電子添文 line would name the other drug, so only the guide is shown.
          sources: other
            ? p.refs.map((ref) => {
                const s = INTERACTION_SOURCES[ref.doc];
                return { label: `${s.product} 電子添文 ${ref.section}（${s.revision}）「${ref.as}」`, url: sourceUrl(ref.doc) };
              })
            : [{ label: `${ERX_CHECK_SOURCES[0].name} ${ERX_CHECK_SOURCES[0].version}（併用禁忌）`, url: ERX_CHECK_SOURCES[0].url }],
        });
      }
    }
  }
  return out.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "併用禁忌" ? -1 : 1));
}
