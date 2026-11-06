import type { ReceiptSheetData } from "@/lib/billing/receipt-sheet";
import { SHIKIBETSU_NAME, type Shikibetsu } from "@/lib/billing/model";

const date = (s: string) => s.replace(/^(\d{4})(\d{2})(\d{2})$/, "$1/$2/$3");
const n = (v: number) => v.toLocaleString("ja-JP");

export function ReceiptSheet({ data: d }: { data: ReceiptSheetData }) {
  const days = new Date(Number(d.month.slice(0,4)), Number(d.month.slice(5)), 0).getDate();
  const fields = [
    ["請求月", d.month], ["医療機関", d.hospital], ["保険者番号", d.insurer],
    ["記号・番号", `${d.symbol} ／ ${d.number}`], ["本人・家族", d.relation], ["給付割合", `${d.benefit}%`],
    ["氏名", d.name], ["性別", d.sex], ["生年月日", date(d.birthDate)],
    ["公費（負担者・受給者番号）", d.kohi.join("、") || "—"], ["特記事項", d.special],
  ];
  return <article aria-label="診療報酬明細書" className="nums bg-white p-3 text-xs text-ink print:p-0 print:text-[8pt]">
    <h3 className="mb-3 text-center text-lg font-bold">診療報酬明細書（医科・入院・{d.dpc ? "DPC" : "出来高"}）</h3>
    <dl className="mb-3 grid grid-cols-3 border-l border-t border-rule">
      {fields.map(([label,value]) => <div key={label} className="border-b border-r border-rule p-2"><dt className="text-[10px] text-ink-soft">{label}</dt><dd className="mt-1 break-words font-bold">{value}</dd></div>)}
    </dl>
    <table className="mb-3 w-full border-collapse text-left [&_td]:border [&_td]:border-rule [&_td]:p-1 [&_th]:border [&_th]:border-rule [&_th]:p-1">
      <caption className="mb-1 text-left font-bold">傷病名</caption>
      <thead><tr>{d.dpc && <th>区分</th>}<th>病名（◎ 主病名）</th><th>開始日</th><th>転帰</th></tr></thead>
      <tbody>{d.diagnoses.map((x,i) => <tr key={i}>{d.dpc && <td>{d.dpc.categories[i] || "—"}</td>}<td>{x.main ? "◎ " : ""}{x.name}{x.comment && <div>{x.comment}</div>}</td><td className="whitespace-nowrap">{date(x.start)}</td><td>{x.outcome}</td></tr>)}{!d.diagnoses.length && <tr><td colSpan={d.dpc ? 4 : 3}>傷病名の登録なし</td></tr>}</tbody>
    </table>
    {d.dpc && <section className="mb-3 space-y-2 border border-rule p-2">
      <h4 className="font-bold">診断群分類番号 {d.dpc.code}　{d.dpc.name}</h4>
      <p>入院期間 {d.dpc.periods.map((v,i) => `${["Ⅰ", "Ⅱ", "Ⅲ"][i]}：${i ? d.dpc!.periods[i-1] + 1 : 1}〜${v}日`).join(" ／ ")}　医療機関別係数 {d.dpc.coefficient.toFixed(4)}</p>
      <h4 className="font-bold">包括評価部分</h4>
      {d.dpc.lines.filter(l => l.points !== null).map((l,i) => <p key={i}>期間{l.period}（入院第{l.from}〜{l.to}日）　{n(l.points!)}点 × {l.days}日 × {d.dpc!.coefficient.toFixed(4)} ＝ {l.subtotal.toLocaleString("ja-JP", { maximumFractionDigits: 4 })}点</p>)}
      <p className="font-bold">包括評価計（月計を四捨五入） {n(d.dpc.total)}点 ／ 出来高部分計 {n(d.dpc.outsideTotal)}点</p>
    </section>}
    <table className="w-full table-fixed border-collapse text-[10px] print:text-[6pt] [&_td]:border [&_td]:border-rule [&_td]:px-0.5 [&_td]:py-1 [&_th]:border [&_th]:border-rule [&_th]:px-0.5 [&_th]:py-1">
      <caption className="mb-1 text-left text-xs font-bold">{d.dpc ? "出来高部分・摘要" : "摘要・算定日（各日の回数）"}</caption>
      <colgroup><col className="w-[8%]"/><col className="w-[29%]"/><col className="w-[8%]"/><col className="w-[12%]"/>{Array.from({length:days},(_,i)=><col key={i}/>)}</colgroup>
      <thead className="bg-paper"><tr><th>識別</th><th>品名・規格</th><th>数量</th><th>点数×回数</th>{Array.from({length:days},(_,i)=><th key={i}>{i+1}</th>)}</tr></thead>
      <tbody>{d.rows.map((r,i) => <tr key={i} className="break-inside-avoid align-top">
        <td>{r.group}<br/>{SHIKIBETSU_NAME[r.group as Shikibetsu]}</td>
        <td className="break-words">{r.checks.length > 0 && <span className="font-bold text-yamabuki" aria-label="点検の指摘あり">△ </span>}{r.name}{r.product && <div>{r.product}</div>}{r.comments.map((c,j)=><div key={j}>{c}</div>)}{r.checks.map((c,j)=><div key={j} className="text-yamabuki">△ {c}</div>)}</td>
        <td className="text-right">{r.quantity}{r.quantity ? r.unit : ""}</td><td className="text-right">{r.points === null ? "（合算）" : `${n(r.points)}${r.group === "97" ? "円" : "点"} × ${r.count}`}</td>
        {r.days.slice(0,days).map((v,j)=><td key={j} className="text-center">{v ?? ""}</td>)}
      </tr>)}</tbody>
    </table>
    <dl className="mt-3 grid grid-cols-2 border-l border-t border-rule">
      {[["合計点数", `${n(d.totalPoints)}点`], ["一部負担金", `${n(d.medicalYen)}円`], ["食事回数", `${n(d.meals)}食`], ["食事療養費", `${n(d.mealYen)}円`], ["食事の標準負担額", `${n(d.mealFutan)}円`]].map(([label,value])=><div key={label} className="flex justify-between gap-2 border-b border-r border-rule p-2"><dt>{label}</dt><dd className="font-bold">{value}</dd></div>)}
    </dl>
    {d.checks.length > 0 && <div className="mt-3"><h4 className="font-bold">△ 点検</h4><ul>{[...new Set(d.checks)].map(c=><li key={c}>{c}</li>)}</ul></div>}
  </article>;
}
