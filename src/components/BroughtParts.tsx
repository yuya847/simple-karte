"use client";

import { displayText } from "@/lib/display-text";
import { matchKind, type BroughtLine, type DecisionShort, type MatchKind } from "@/lib/brought-history";
import { oralName } from "@/lib/format";
import type { BroughtRow } from "@/lib/pharmacy";

const MATCH_TONE: Record<MatchKind, string> = {
  同じ: "border-wakatake/60 text-wakatake",
  同じ成分の別の製品: "border-yamabuki/60 text-yamabuki",
  院内にない: "border-shu/60 text-shu",
};

/** How a drug of the notebook matches the hospital's drugs (by code), as a small tag. */
export function MatchTag({ row, kind }: { row?: Pick<BroughtRow, "said" | "strength" | "match">; kind?: MatchKind }) {
  const k = kind ?? matchKind(row!);
  return <span className={`inline-block whitespace-nowrap rounded border px-1 text-[10px] leading-4 ${MATCH_TONE[k]}`}>{k}</span>;
}

const DECISION_TONE: Record<DecisionShort, string> = { 継続: "text-wakatake", 切替: "text-ai", 中止: "text-shu", まだ: "text-ink-faint" };

/** The drugs of a 持参薬鑑別, one row each (the record's 【持参薬】 card, and the nurse's and doctor's 持参薬 tool). */
export function BroughtLinesTable({ lines, decisions = true }: { lines: BroughtLine[]; decisions?: boolean }) {
  return (
    <table className="nums w-full border-collapse text-[12px] leading-snug">
      <thead className="text-left text-[10px] text-ink-faint">
        <tr>
          <th className="py-0.5 pr-1.5 font-normal">薬</th>
          <th className="py-0.5 pr-1.5 font-normal">1回量・用法</th>
          <th className="py-0.5 pr-1.5 font-normal">残り</th>
          <th className="py-0.5 pr-1.5 font-normal">院内の薬</th>
          {decisions && <th className="py-0.5 font-normal">判断</th>}
        </tr>
      </thead>
      <tbody>
        {lines.map((l, i) => (
          <tr key={i} className="border-t border-rule-soft align-top">
            <td className="py-1 pr-1.5">
              <b>{displayText(l.name)}</b> {displayText(l.strength)}
            </td>
            <td className="py-1 pr-1.5">
              <span className="whitespace-nowrap">1回{l.dose}</span> {displayText(l.usage)}
            </td>
            <td className="whitespace-nowrap py-1 pr-1.5">{l.left}</td>
            <td className="py-1 pr-1.5">
              <MatchTag kind={l.match} />
              {l.hospital && l.match !== "同じ" && <div className="text-[10px] leading-tight text-ink-soft">{oralName(l.hospital)}</div>}
            </td>
            {decisions && <td className={`whitespace-nowrap py-1 font-bold ${DECISION_TONE[l.decision]}`}>{l.decision}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
