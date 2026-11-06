"use client";

import { displayText } from "@/lib/display-text";
import { amountText, type MedBag } from "@/lib/discharge-rx";
import { DRUG_INFO_SOURCE } from "@/lib/drug-info";

export const HOSPITAL = "架空総合病院";

export interface HomeRxPatient {
  id: string;
  name: string;
  kana: string;
  ageSex: string;
  allergies: string[];
}

/** 薬袋: what is inside, how to take it, how much, for whom. One per Rp. */
export function MedBagFace({ p, b, date, by }: { p: HomeRxPatient; b: MedBag; date: string; by: { dispensed?: string; checked?: string } }) {
  const tonpuku = b.kind === "頓服";
  return (
    <div className="flex h-[140mm] w-[95mm] break-inside-avoid flex-col border border-ink/70 bg-white text-ink">
      <div className={`py-2 text-center text-[20pt] font-bold tracking-[0.3em] text-white ${tonpuku ? "bg-shu" : "bg-ai"}`}>{tonpuku ? "頓服薬" : "内服薬"}</div>
      <div className="flex-1 space-y-2 px-4 py-3 text-[10pt]">
        <div className="border-b border-ink/40 pb-1">
          <span className="text-[16pt] font-bold">{p.name}</span> 様<span className="nums ml-2 text-[8pt]">ID {p.id}</span>
        </div>
        <div>
          <div className="text-[8pt] text-ink-soft">{tonpuku ? "飲むとき" : "飲み方"}</div>
          <div className="text-[14pt] font-bold leading-snug">{b.how}</div>
        </div>
        <table className="nums w-full text-[10pt]">
          <tbody>
            {b.drugs.map((d) => (
              <tr key={d.code} className="border-t border-ink/20 align-top">
                <td className="py-1">
                  {d.name} {d.strength}
                </td>
                <td className="whitespace-nowrap py-1 pl-2 text-right font-bold">
                  1回 {d.per}
                  {d.unit}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="nums text-[11pt] font-bold">{displayText(amountText(b))}</div>
        <p className="text-[8pt] leading-snug">飲み忘れに気づいても、2回分を一度に飲まないでください。わからないことは薬剤部へお問い合わせください。</p>
      </div>
      <div className="nums border-t border-ink/40 px-4 py-1.5 text-[7.5pt] leading-snug">
        調剤日 {date}　{HOSPITAL} 薬剤部
        <br />
        調剤 {by.dispensed ?? "＿＿＿＿"}　鑑査 {by.checked ?? "＿＿＿＿"}
      </div>
    </div>
  );
}

/** 薬剤情報提供文書 (A4): every drug, how to take it, what it is for, what to watch for. */
export function DrugInfoSheet({ p, bags, care, date, pharmacist }: { p: HomeRxPatient; bags: MedBag[]; care: (code: string) => string[]; date: string; pharmacist: string }) {
  return (
    <div className="w-[190mm] bg-white text-[10pt] leading-relaxed text-ink">
      <h1 className="mb-1 text-center text-[16pt] font-bold">お薬の説明書（薬剤情報提供文書）</h1>
      <div className="mb-2 flex flex-wrap justify-between gap-2 border-b border-ink/50 pb-1">
        <span>
          <b className="text-[13pt]">{p.name}</b> 様（{p.kana}）　{p.ageSex}
        </span>
        <span className="nums">
          {date}　{HOSPITAL} 薬剤部
        </span>
      </div>
      {p.allergies.length > 0 && <p className="mb-2 font-bold">アレルギー・副作用歴：{p.allergies.join("、")}</p>}
      <table className="w-full border-collapse text-[9.5pt]">
        <thead>
          <tr className="bg-ink/10">
            <th className="w-[30%] border border-ink/40 px-2 py-1 text-left">お薬の名前</th>
            <th className="w-[20%] border border-ink/40 px-2 py-1 text-left">飲み方</th>
            <th className="border border-ink/40 px-2 py-1 text-left">何の薬・気をつけること</th>
          </tr>
        </thead>
        <tbody>
          {bags.flatMap((b) =>
            b.drugs.map((d) => (
              <tr key={`${b.rp}-${d.code}`} className="align-top">
                <td className="border border-ink/40 px-2 py-1">
                  <b>
                    {d.name} {d.strength}
                  </b>
                </td>
                <td className="nums border border-ink/40 px-2 py-1">
                  {b.how}
                  <br />
                  1回 {d.per}
                  {d.unit}　{displayText(amountText(b))}
                </td>
                <td className="border border-ink/40 px-2 py-1">
                  <div>{d.info.what}</div>
                  <ul className="list-disc pl-4">
                    {care(d.code).map((c, i) => (
                      <li key={i}>{c}</li>
                    ))}
                  </ul>
                </td>
              </tr>
            )),
          )}
        </tbody>
      </table>

      <p className="mt-1 text-[8pt] text-ink-soft">
        説明した薬剤師：{pharmacist}　／　文面は添付文書（{DRUG_INFO_SOURCE.label}）をもとにした要約です。
      </p>
    </div>
  );
}

/** お薬手帳のシール: date, where, who prescribed, and one line per Rp. */
export function NotebookSticker({ p, bags, date, doctor }: { p: HomeRxPatient; bags: MedBag[]; date: string; doctor: string }) {
  return (
    <div className="w-[80mm] break-inside-avoid border border-ink/70 bg-white p-2 text-[7.5pt] leading-snug text-ink">
      <div className="nums flex justify-between border-b border-ink/40 pb-0.5">
        <b>{date}</b>
        <span>
          {HOSPITAL}（退院時）
        </span>
      </div>
      <div className="border-b border-ink/20 py-0.5">
        {p.name} 様　処方医 {displayText(doctor)}
      </div>
      {bags.map((b, i) => (
        <div key={b.rp} className="border-b border-ink/20 py-0.5">
          <span className="font-bold">Rp{i + 1}</span>{" "}
          {b.drugs.map((d) => (
            <div key={d.code} className="pl-2">
              {d.name} {d.strength}　1回{d.per}
              {d.unit}
            </div>
          ))}
          <div className="pl-2">
            {b.how}　{displayText(amountText(b))}
          </div>
        </div>
      ))}
      {p.allergies.length > 0 && <div className="pt-0.5">アレルギー：{p.allergies.join("、")}</div>}
    </div>
  );
}

/* Help migration source (references and dynamic wording):
<p >
        ほかの病院や薬局でもらった薬、市販の薬やサプリメントを使うときは、この説明書とお薬手帳を見せてください。体調の変化があれば、自分の判断で止めずに連絡してください。
      </p>
*/
