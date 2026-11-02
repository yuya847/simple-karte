"use client";

import { bmi, cockcroftGault, latestValue } from "@/lib/clinical";
import { addDays, formatShort, hospitalDay, type CalendarDate } from "@/lib/dates";
import type { Patient } from "@/lib/types";

interface Props {
  patient: Patient;
  today: CalendarDate;
}

function dayLabel(day: number): string {
  if (day === 0) return "今日";
  if (day === -1) return "昨日";
  return `${-day}日前`;
}

/** The patient band. Always visible so the chart is never mistaken for another patient's. */
export function PatientBar({ patient: p, today }: Props) {
  const cre = latestValue(p, "Cre");
  const ccr = cre ? cockcroftGault(p.age, p.weightKg, cre.value, p.sex) : undefined;
  const admitted = addDays(today, p.admittedOn);

  return (
    <header className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-rule bg-sheet px-4 py-2.5">
      <div className="flex items-baseline gap-3">
        <div>
          <div className="text-[11px] leading-none text-ink-faint">{p.kana}</div>
          <div className="text-xl font-bold leading-tight">{p.name}</div>
        </div>
        <div className="nums text-sm text-ink-soft">
          {p.sex}・{p.age}歳
        </div>
        <span className="rounded border border-dashed border-ink-faint px-1.5 py-0.5 text-[10px] text-ink-soft">架空の患者</span>
      </div>

      <dl className="nums grid grid-cols-[auto_auto] gap-x-2 gap-y-0.5 text-xs text-ink-soft">
        <dt className="text-ink-faint">ID</dt>
        <dd>{p.id}</dd>
        <dt className="text-ink-faint">病棟</dt>
        <dd>
          {p.ward} {p.room}号室
        </dd>
      </dl>

      <dl className="nums grid grid-cols-[auto_auto] gap-x-2 gap-y-0.5 text-xs text-ink-soft">
        <dt className="text-ink-faint">入院</dt>
        <dd>
          {formatShort(admitted)}　<b className="text-ink">入院{hospitalDay(p.admittedOn, 0)}日目</b>
        </dd>
        <dt className="text-ink-faint">病名</dt>
        <dd className="text-ink">{p.admissionDiagnosis}</dd>
      </dl>

      <dl className="nums grid grid-cols-[auto_auto] gap-x-2 gap-y-0.5 text-xs text-ink-soft">
        <dt className="text-ink-faint">体格</dt>
        <dd>
          {p.heightCm}cm　<b className="text-ink">{p.weightKg}kg</b>　BMI {bmi(p.heightCm, p.weightKg).toFixed(1)}
        </dd>
        <dt className="text-ink-faint">腎機能</dt>
        <dd>
          {cre ? (
            <>
              Cre <b className="text-ink">{cre.value.toFixed(2)}</b>（{dayLabel(cre.day)}）　推定CCr {ccr!.toFixed(0)} mL/分
              <span className="text-ink-faint">（CG式）</span>
            </>
          ) : (
            "測定なし"
          )}
        </dd>
      </dl>

      <div className="ml-auto flex flex-wrap items-center gap-1.5 text-xs">
        <Badge tone="shu" label="アレルギー" values={p.allergies.length ? p.allergies : ["なし"]} quiet={!p.allergies.length} />
        {p.infections.length > 0 && <Badge tone="fuji" label="感染症" values={p.infections} />}
        {p.cautions.map((c) => (
          <Badge key={c} tone="yamabuki" label="注意" values={[c]} />
        ))}
        <span className="nums text-ink-faint">主治医 {p.attending}</span>
      </div>
    </header>
  );
}

function Badge({ tone, label, values, quiet }: { tone: "shu" | "fuji" | "yamabuki"; label: string; values: string[]; quiet?: boolean }) {
  const styles = {
    shu: "border-shu/40 bg-shu-soft text-shu",
    fuji: "border-fuji/40 bg-fuji-soft text-fuji",
    yamabuki: "border-yamabuki/40 bg-yamabuki-soft text-yamabuki",
  }[tone];
  return (
    <span className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 ${quiet ? "border-rule bg-transparent text-ink-faint" : styles}`}>
      <b>{label}</b>
      {values.join("、")}
    </span>
  );
}
