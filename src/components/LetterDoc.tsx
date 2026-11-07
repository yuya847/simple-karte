"use client";
import { HOSPITAL } from "@/lib/billing/facility";
import { addDays, formatShort, type CalendarDate } from "@/lib/dates";
import { displayText } from "@/lib/display-text";
import { GREETING, WELFARE, letterKind, type Letter } from "@/lib/letters";
import { birthDateOf, formatBirth } from "@/lib/patient-contacts";
import { ageText } from "@/lib/person";
import type { Patient } from "@/lib/types";

/**
 * One letter as it goes on paper (A4 portrait; 別紙様式11 の欄): the address, the hospital and doctor who send it,
 * the patient, then the kind's fields. A draft carries 「下書き」 in the top right corner.
 */
export function LetterDoc({ letter: l, patient: p, today, doctor, contact, print }: { letter: Letter; patient: Patient; today: CalendarDate; doctor: string; contact?: string; print?: boolean }) {
  const kind = letterKind(l.type);
  const day = l.confirmedAt?.day ?? 0;
  const birth = birthDateOf({ id: p.id, age: p.age }, today);
  const welfare = WELFARE.includes(l.type);
  const sections: [string, string][] = [[kind.purpose, l.purpose], ...kind.fields.map(([k, label]) => [label, l.body[k] ?? ""] as [string, string])];
  return (
    <article className={`relative text-[12.5px] leading-relaxed text-ink ${print ? "print:text-[10.5px]" : ""}`}>
      {l.status === "下書き" && <span className="absolute right-0 top-0 rounded border-2 border-shu px-2 text-sm font-bold text-shu">下書き</span>}
      <h2 className="mb-3 text-center text-lg font-bold">{kind.title}</h2>
      <div className="mb-3 flex justify-between gap-4 text-[12px]">
        <div>
          <p>
            {displayText(l.to) || "（宛先）"}　{displayText(l.dept)}
          </p>
          <p>{welfare ? `${displayText(l.doctor) || "ご担当者"} 様` : `${displayText(l.doctor) || "　　　　"} 先生　御侍史`}</p>
        </div>
        <div className="text-right">
          <p>{formatShort(addDays(today, day))}</p>
          <p>{HOSPITAL.name}</p>
          <p>電話 {HOSPITAL.tel}</p>
          <p>
            {p.department}　医師 {displayText(l.confirmedBy || doctor)}
          </p>
        </div>
      </div>
      <p className="mb-2">
        患者：<b>{p.name}</b> 様（{p.sex}）　{formatBirth(birth)}生（{ageText(p.age, p.ageMonths)}）{contact ? `　連絡先 ${contact}` : ""}
      </p>
      <p className="mb-2">{GREETING[l.type]}</p>
      {sections.map(([title, text]) => (
        <section key={title} className="mb-2 break-inside-avoid">
          <h3 className="font-bold">■ {title}</h3>
          <p className="whitespace-pre-wrap pl-4">{text.trim() || <span className="text-ink-faint">（未記入）</span>}</p>
        </section>
      ))}
      {l.flags.attach && (
        <section className="mb-2 break-inside-avoid">
          <h3 className="font-bold">■ 添付</h3>
          <p className="pl-4">治療計画・検査結果・画像の情報</p>
        </section>
      )}
    </article>
  );
}
