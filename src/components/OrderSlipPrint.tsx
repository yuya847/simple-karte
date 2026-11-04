import { addDays, formatShort, type CalendarDate } from "@/lib/dates";
import type { SlipLine } from "@/lib/order-confirm";
import type { DayOffset } from "@/lib/types";
import { timeLabel } from "@/lib/worksheet";

const th = "border border-ink/60 px-1.5 py-1 text-left font-bold";
const td = "border border-ink/40 px-1.5 py-1 align-top";

/**
 * 指示票 (A4 portrait): one patient's new, changed and stopped orders of a day, with who gave them and the
 * nurse's 指示受け and 指示確認, and a blank for the hand that carries them out. Printed through usePrintSheet.
 */
export function OrderSlipPrint({ ward, patient, day, today, nowTime, by, lines }: { ward: string; patient: { id: string; name: string; room: string }; day: DayOffset; today: CalendarDate; nowTime: string; by: string; lines: SlipLine[] }) {
  return (
    <div className="nums text-[10pt] leading-snug text-ink">
      <header className="mb-2 flex items-baseline gap-3 border-b-2 border-ink pb-1">
        <h1 className="text-[14pt] font-bold">指示票</h1>
        <span className="font-bold">{formatShort(addDays(today, day))} の指示</span>
        <span className="ml-auto text-[9pt]">
          {ward}　印刷 {formatShort(today)} {nowTime}　{by}
        </span>
      </header>
      <p className="mb-2">
        <b>{patient.room}</b>　<b className="text-[12pt]">{patient.name}</b>　患者番号 {patient.id}　<span className="rounded border border-dashed border-ink px-1 text-[9pt]">架空の患者</span>
      </p>
      {lines.length === 0 ? (
        <p>この日の新しい指示・変更・中止はありません。</p>
      ) : (
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className={`${th} w-14`}>時刻</th>
              <th className={`${th} w-10`}>区分</th>
              <th className={`${th} w-16`}>種別</th>
              <th className={th}>内容</th>
              <th className={`${th} w-24`}>指示医</th>
              <th className={`${th} w-28`}>指示受け</th>
              <th className={`${th} w-28`}>指示確認</th>
              <th className={`${th} w-16`}>実施</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={`${l.at}-${i}`} className="break-inside-avoid">
                <td className={td}>{l.timeKnown ? timeLabel(l.at, day, today) : "時刻なし"}</td>
                <td className={`${td} font-bold`}>{l.kind === "変更" ? "【修】" : l.kind === "中止" ? "【止】" : l.kind}</td>
                <td className={td}>{l.type}</td>
                <td className={td}>
                  {l.flags.length > 0 && <div className="text-[8pt]">{l.flags.map((f) => `［${f}］`).join("")}</div>}
                  {l.before && <div className="text-[8pt] line-through">前：{l.before}</div>}
                  <div className={l.kind === "中止" ? "line-through" : "font-bold"}>{l.main}</div>
                  <div className="text-[9pt]">{l.detail}</div>
                  {l.diff.length > 0 && <div className="text-[9pt]">変わったところ：{l.diff.join("／")}</div>}
                </td>
                <td className={td}>{l.author}</td>
                <td className={td}>{l.take || "□"}</td>
                <td className={td}>{l.confirm || "□"}</td>
                <td className={td}>□</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="mt-2 text-[8pt]">
        【修】は同じ薬の中止と新規が同時に出た変更、【止】は中止。指示受け・指示確認の欄は画面で記録した人と時刻（空欄は手で書く）。実施は与薬・実施の記録（ワークシート・経過表）に残します。Simple Karte の試作。架空の病院・架空の患者で、実際の診療には使えません。
      </p>
    </div>
  );
}
