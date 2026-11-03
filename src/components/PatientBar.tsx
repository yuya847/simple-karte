"use client";

import { bmi, cockcroftGault, latestValue } from "@/lib/clinical";
import { addDays, formatShort, hospitalDay, type CalendarDate } from "@/lib/dates";
import { diagnosisLabel, type Diagnosis } from "@/lib/diagnoses";
import { bandLabel, reviewDue, type AdvanceDirective } from "@/lib/directives";
import type { Patient } from "@/lib/types";
import { PatientAvatar } from "./PatientAvatar";

interface Props {
  patient: Patient;
  today: CalendarDate;
  diagnoses: Diagnosis[];
  directive?: AdvanceDirective;
  onOpenDiagnoses: () => void;
  onOpenDirective: () => void;
  onOpenDiet?: () => void;
}

function dayLabel(day: number): string {
  if (day === 0) return "今日";
  if (day === -1) return "昨日";
  return `${-day}日前`;
}

/** The patient band. Always visible so the chart is never mistaken for another patient's. */
export function PatientBar({ patient: p, today, diagnoses, directive, onOpenDiagnoses, onOpenDirective, onOpenDiet }: Props) {
  const mains = diagnoses.filter((d) => d.main && d.outcome === "継続");
  const cre = latestValue(p, "Cre");
  const ccr = cre ? cockcroftGault(p.age, p.weightKg, cre.value, p.sex) : undefined;
  const admitted = addDays(today, p.admittedOn);

  return (
    <header className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-rule bg-sheet px-4 py-2.5">
      <div className="flex items-center gap-3">
        <PatientAvatar sex={p.sex} age={p.age} size={46} className="rounded-full ring-1 ring-rule" />
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
        <dt className="text-ink-faint">主病名</dt>
        <dd className="text-ink">
          <button type="button" onClick={onOpenDiagnoses} className="text-left hover:underline" title="病名の一覧を開く">
            {mains.length ? mains.map(diagnosisLabel).join("、") : <span className="text-yamabuki">未登録（入院時：{p.admissionDiagnosis}）</span>}
          </button>
        </dd>
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
        <button type="button" onClick={onOpenDirective} title={directive ? `${formatShort(addDays(today, directive.decidedAt.day))} ${directive.by}${directive.discussedWith ? `（${directive.discussedWith}と）` : ""}` : "事前指示を記録する"}>
          <Badge tone="shu" label="事前指示" values={[bandLabel(directive) + (reviewDue(directive) ? "（見直しの日）" : "")]} quiet={!directive || directive.cpr === "未確認"} />
        </button>
        {p.dietNow && (
          <button type="button" onClick={onOpenDiet} title="次の食事（食事オーダーを開く）">
            <Badge tone="yamabuki" label="食事" values={[p.dietNow]} quiet={!p.dietNow.startsWith("絶食")} />
          </button>
        )}
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
