"use client";

import { displayText } from "@/lib/display-text";
import { formulary, kiseiText } from "@/lib/formulary";
import { daysOfCount, type BroughtReport } from "@/lib/pharmacy";
import { oralName } from "@/lib/format";
import type { Patient } from "@/lib/types";
import { DrugMarks } from "./DrugMarks";

const ITEMS = formulary();

/**
 * 持参薬鑑別報告書 (printed): what the お薬手帳 says, what the pharmacist counted, the hospital's drug with
 * the same ingredient and strength (code), its 規制区分, the doctor's choice and the pharmacist's notes.
 */
export function BroughtReportSheet({ r, patient, room, date }: { r: BroughtReport; patient: Pick<Patient, "name" | "id" | "age" | "sex"> | undefined; room: string; date: string }) {
  return (
    <div className="w-[190mm] text-[9pt] leading-snug text-black">
      <div className="flex items-baseline border-b-2 border-black pb-1">
        <h1 className="text-[14pt] font-bold tracking-widest">持参薬鑑別報告書</h1>
        <span className="ml-auto text-[8.5pt]">架空総合病院 薬剤部</span>
      </div>
      <table className="mt-2 w-full">
        <tbody>
          <tr>
            <td className="w-[28mm]">患者</td>
            <td>
              {patient?.name}　ID {patient?.id}　{patient?.age}歳 {patient?.sex}　{room}
            </td>
            <td className="w-[28mm]">鑑別</td>
            <td>
              {date} {r.at}　{displayText(r.by)}
            </td>
          </tr>
          <tr>
            <td>情報のもと</td>
            <td colSpan={3}>お薬手帳（文を表に写したのは Claude）と持参した薬の実物（薬剤師が照らした）</td>
          </tr>
        </tbody>
      </table>
      <table className="mt-2 w-full border-collapse">
        <thead>
          <tr className="border-y border-black text-left">
            <th className="py-0.5">No</th>
            <th>手帳の記載（薬品名・規格）</th>
            <th>用法・用量</th>
            <th>実物の残数</th>
            <th>院内の同じ成分・規格</th>
            <th>規制区分</th>
            <th>医師の判断</th>
            <th>備考</th>
          </tr>
        </thead>
        <tbody>
          {r.rows.map((x, i) => {
            const d = daysOfCount(x);
            const item = x.match ? ITEMS.find((y) => y.code === x.match) : undefined;
            return (
              <tr key={i} className="border-b border-black/40 align-top">
                <td className="py-0.5">{i + 1}</td>
                <td>
                  {x.said} {x.strength}
                </td>
                <td>
                  1回{x.amount ?? "？"}
                  {x.unit} {x.usage ?? (x.timings.length ? `1日${x.timings.length}回（${x.timings.join("・")}）` : `頓用 ${x.prn ?? ""}`)}
                  {x.daysLeft ? ` ${x.daysLeft}日分（手帳）` : ""}
                </td>
                <td>
                  {x.counted !== null && x.counted !== undefined ? `${x.counted}${x.unit}` : "—"}
                  {d && <span className="block text-[7.5pt]">{d.formula}</span>}
                </td>
                <td>{x.match ? oralName(x.match) : "院内に同じ成分・規格なし"}</td>
                <td>
                  {displayText(item ? kiseiText(item) : "—")}
                  {x.match && <DrugMarks codes={[x.match]} print />}
                </td>
                <td>{x.decision ?? "（医師の判断待ち）"}</td>
                <td>{displayText(x.note ?? "")}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="mt-2 min-h-[18mm] border border-black p-1.5">
        <b>所見</b>　{r.comment || ""}
      </div>
      <p className="mt-1 text-[7.5pt]">院内の薬との照合（同じ成分・規格）と日数の計算はコードが行い、薬剤師が実物と照らして確かめた。続ける・切り替える・止めるは医師が決める（状態：{r.status}）。</p>
    </div>
  );
}
