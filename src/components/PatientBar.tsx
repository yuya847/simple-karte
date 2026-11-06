"use client";
import { wardLabel } from "@/lib/place-label";

import { displayText } from "@/lib/display-text";
import { coverageOf, rateLabel, type Insurance } from "@/lib/billing/insurance";
import { useState } from "react";

import { bodyText, estimatedCcr, latestValue } from "@/lib/clinical";
import { addDays, formatShort, hospitalDay, type CalendarDate } from "@/lib/dates";
import { diagnosisLabel, type Diagnosis } from "@/lib/diagnoses";
import { bandLabel, reviewDue, type AdvanceDirective } from "@/lib/directives";
import { doctorLabel, type PatientDoctors } from "@/lib/patient-doctors";
import type { Patient } from "@/lib/types";
import { PatientAvatar } from "./PatientAvatar";
import { StarButton } from "./StarButton";
import { ageSex } from "@/lib/person";
import { useFavorites } from "@/lib/use-favorites";
import { useLongPress } from "@/lib/use-long-press";

import { flagsFor } from "@/lib/patient-flags";

interface Props {
  rest?: string | null;
  admissionMissing?: string[];
  onOpenStanding?: () => void;
  patient: Patient;
  roomLabel?: string;
  today: CalendarDate;
  diagnoses: Diagnosis[];
  directive?: AdvanceDirective;
  onOpenDiagnoses: () => void;
  onOpenDirective: () => void;
  onOpenDiet?: () => void;
  /** 患者プロファイル (allergies, infections, contraindications, blood type, height and weight). */
  onOpenProfile?: () => void;
  /** 妊娠中の印 (set by a doctor or nurse). */
  onPregnancy?: (v: { weeks: number | null } | null) => void;
  /** 主治医・担当医・コンサルト医 (without it the bar shows the attending alone). */
  doctors?: PatientDoctors;
  /** Opens the doctors' list (to add or remove a 担当医・コンサルト医). */
  onOpenDoctors?: () => void;
  /** 患者基本情報 (住所・連絡先・家族・保険・入院前の情報収集 …): opened by double-clicking the name (iPad: a long press). */
  onOpenInfo?: () => void;
  /** The insurance 医事課 (or a doctor/nurse) registered: shown as a tag; null = not registered yet. */
  insurance?: Insurance | null;
  /** 保存して閉じる・オーダー・未確認の結果: the chart's actions, on the right of the bar. */
  actions?: React.ReactNode;
}

function dayLabel(day: number): string {
  if (day === 0) return "今日";
  if (day === -1) return "昨日";
  return `${-day}日前`;
}

/** The patient band. Always visible so the chart is never mistaken for another patient's. */
export function PatientBar({ roomLabel, rest, patient: p, today, diagnoses, directive, onOpenDiagnoses, onOpenDirective, onOpenDiet, onOpenProfile, onPregnancy, doctors, onOpenDoctors, onOpenInfo, insurance, actions, admissionMissing = [], onOpenStanding }: Props) {
  const [pregEdit, setPregEdit] = useState(false);
  const longPress = useLongPress<HTMLDivElement>(onOpenInfo);
  const [weeks, setWeeks] = useState("");
  const [favorites, toggleFavorite] = useFavorites();
  const mains = diagnoses.filter((d) => d.main && d.outcome === "継続");
  const cre = latestValue(p, "Cre");
  // 推定CCr needs the weight: an outpatient without one gets 「測定なし」, not a number from 0 kg.
  const ccr = estimatedCcr(p, cre?.value);
  const body = bodyText(p);
  const admitted = addDays(today, p.admittedOn);
  // A 救急外来・外来 visit opened in the chart screen (its id is "er:…" / "opd:…"): no bed, no 入院日数.
  const visit = /^(er|opd):/.test(p.id);

  return (
    <header className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-rule bg-sheet px-4 py-2.5">
      <div className="flex items-center gap-3">
        <PatientAvatar sex={p.sex} age={p.age} size={46} className="rounded-full ring-1 ring-rule" />
        <div
          className={onOpenInfo ? "-mx-1 cursor-pointer select-none rounded px-1 hover:bg-paper" : undefined}
          title={onOpenInfo ? "ダブルクリック（iPad は長押し）で患者基本情報を開く" : undefined}
          onDoubleClick={onOpenInfo ? (e) => !(e.target as Element).closest("button") && onOpenInfo() : undefined}
          style={onOpenInfo ? { touchAction: "manipulation" } : undefined}
          {...longPress}
        >
          <div className="text-[11px] leading-none text-ink-faint">{p.kana}</div>
          <div className="flex items-center gap-1 text-xl font-bold leading-tight">
            {onOpenInfo ? (
              <span role="button" tabIndex={0} aria-label={`${p.name}の患者基本情報を開く（ダブルクリックか長押し。キーボードは Enter）`} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onOpenInfo())} className="rounded focus-visible:outline-2">
                {p.name}
              </span>
            ) : (
              p.name
            )}
            <StarButton on={favorites.includes(p.id)} name={p.name} onToggle={() => toggleFavorite(p.id)} size={17} />
          </div>
        </div>
        <div className="nums text-sm text-ink-soft">
          {ageSex(p)}
        </div>

      </div>
      {actions && <div className="order-last ml-auto flex shrink-0 flex-wrap items-center justify-end gap-1.5">{actions}</div>}

      <dl className="nums grid grid-cols-[auto_auto] gap-x-2 gap-y-0.5 text-xs text-ink-soft">
        <dt className="text-ink-faint">ID</dt>
        <dd>{visit ? p.id.replace(/^(er|opd):/, "") : p.id}</dd>
        <dt className="text-ink-faint">{visit ? "場所" : "病棟"}</dt>
        <dd>{visit ? p.ward : `${wardLabel(roomLabel ?? p.room)} ${roomLabel ?? p.room}`}</dd>
      </dl>

      <dl className="nums grid grid-cols-[auto_auto] gap-x-2 gap-y-0.5 text-xs text-ink-soft">
        <dt className="text-ink-faint">{visit ? "受診" : "入院"}</dt>
        <dd>
          {formatShort(admitted)}　{visit ? <b className="text-ink">今日の受診</b> : <b className="text-ink">入院{hospitalDay(p.admittedOn, 0)}日目</b>}
        </dd>
        <dt className="text-ink-faint">主病名</dt>
        <dd className="text-ink">
          <button type="button" onClick={onOpenDiagnoses} className="text-left hover:underline" title="病名の一覧を開く">
            {mains.length ? mains.map(diagnosisLabel).join("、") : <span className="text-yamabuki">未登録（{visit ? "受診の目的" : "入院時"}：{p.admissionDiagnosis}）</span>}
          </button>
        </dd>
      </dl>

      <dl className="nums grid grid-cols-[auto_auto] gap-x-2 gap-y-0.5 text-xs text-ink-soft">
        <dt className="text-ink-faint">体格</dt>
        <dd>
          {body.height}　<b className="text-ink">{body.weight}</b>　BMI {body.bmi}
          {body.unmeasured && <span className="ml-1 text-ink-faint">（未測定）</span>}
        </dd>
        <dt className="text-ink-faint">腎機能</dt>
        <dd>
          {cre ? (
            <>
              Cre <b className="text-ink">{cre.value.toFixed(2)}</b>（{dayLabel(cre.day)}）　推定CCr {ccr !== null ? `${ccr.toFixed(0)} mL/分` : "測定なし（体重の記録がない）"}
              {ccr !== null && <span className="text-ink-faint">（CG式）</span>}
            </>
          ) : (
            "測定なし"
          )}
        </dd>
      </dl>

      <div className="ml-auto flex flex-wrap items-center gap-1.5 text-xs">
        <button type="button" onClick={onOpenDirective} title={displayText(directive ? `${formatShort(addDays(today, directive.decidedAt.day))} ${directive.by}${directive.discussedWith ? `（${directive.discussedWith}と）` : ""}` : "事前指示を記録する")}>
          <Badge tone="shu" label="事前指示" values={[bandLabel(directive) + (reviewDue(directive) ? "（見直しの日）" : "")]} quiet={!directive || directive.cpr === "未確認"} />
        </button>
        {p.dietNow && (
          <button type="button" onClick={onOpenDiet} title="次の食事（食事オーダーを開く）">
            <Badge tone="yamabuki" label="食事" values={[p.dietNow]} quiet={!p.dietNow.startsWith("絶食")} />
          </button>
        )}
        <button type="button" onClick={onOpenProfile} title="患者プロファイルを開く（アレルギー・感染症・禁忌）">
          <Badge tone="shu" label="アレルギー" values={p.allergies.length ? p.allergies : ["なし"]} quiet={!p.allergies.length} />
        </button>
        <button type="button" onClick={onOpenInfo} title={insurance ? "患者基本情報の「保険・制度」を開く" : "保険が未登録です（名前をダブルクリックして登録）"}>
          <Badge tone="ai" label="保険" values={[insurance ? insuranceTag(insurance) : "未登録"]} quiet={!insurance} />
        </button>
        {p.infections.length > 0 && (
          <button type="button" onClick={onOpenProfile} title="患者プロファイルを開く">
            <Badge tone="fuji" label="感染症" values={p.infections} />
          </button>
        )}
        {(p.contraindications ?? []).length > 0 && (
          <button type="button" onClick={onOpenProfile} title="患者プロファイルを開く">
            <Badge tone="shu" label="禁忌" values={p.contraindications!} />
          </button>
        )}
        {p.dischargedAt && <Badge tone="fuji" label="退院済み" values={[`${p.dischargedAt.day === 0 ? "" : `${p.dischargedAt.day}日 `}${p.dischargedAt.time}`]} />}
        {p.pregnancy ? (
          <button type="button" onClick={() => onPregnancy?.(null)} title="押すと妊娠中の印を外します">
            <Badge tone="shu" label="妊娠中" values={[p.pregnancy.weeks ? `${p.pregnancy.weeks}週` : "週数不明"]} />
          </button>
        ) : (
          onPregnancy &&
          // The quick button is shown to women aged 10〜60 only (a display choice of this prototype), so an
          // 86-year-old's bar does not offer 「＋妊娠中」.
          p.sex === "女" &&
          p.age >= 10 &&
          p.age <= 60 &&
          (pregEdit ? (
            <span className="flex items-center gap-1">
              <input value={weeks} onChange={(e) => setWeeks(e.target.value)} inputMode="numeric" placeholder="週" aria-label="妊娠週数" className="w-12 rounded border border-rule px-1 py-0.5 text-right" />
              <button
                type="button"
                onClick={() => {
                  onPregnancy({ weeks: Number(weeks) > 0 ? Number(weeks) : null });
                  setPregEdit(false);
                  setWeeks("");
                }}
                className="rounded bg-shu px-1.5 py-0.5 font-bold text-white"
              >
                妊娠中の印を付ける
              </button>
              <button type="button" onClick={() => setPregEdit(false)} className="text-ink-faint">
                やめる
              </button>
            </span>
          ) : (
            <button type="button" onClick={() => setPregEdit(true)} className="rounded border border-dashed border-rule px-1.5 py-0.5 text-ink-faint hover:text-shu" title="妊娠中の印を付ける（医師・看護師）">
              ＋妊娠中
            </button>
          ))
        )}
        {flagsFor(p, [], 0, 0, undefined, 0, undefined, admissionMissing).filter((f) => f.action === "standing").map((f) => <button key={f.label} type="button" disabled={!onOpenStanding} onClick={onOpenStanding} title={f.title} className={onOpenStanding ? "rounded border border-yamabuki/40 bg-yamabuki-soft px-1.5 py-0.5 text-yamabuki" : "rounded border border-rule px-1.5 py-0.5 text-ink-faint"}>{f.label}</button>)}

        {rest && <span className="rounded border border-rule px-1.5 py-0.5 text-ink-soft">安静度：{rest}</span>}
        {p.cautions.map((c) => (
          <Badge key={c} tone="yamabuki" label="注意" values={[c]} />
        ))}
        <button type="button" onClick={onOpenDoctors} disabled={!onOpenDoctors} className="nums flex flex-wrap items-center gap-x-1 text-left text-ink-faint enabled:hover:text-ink enabled:hover:underline" title={onOpenDoctors ? "主治医・担当医・コンサルト医の一覧を開く（医師は担当医・コンサルト医を足せます）" : undefined} aria-label="患者の医師">
          <span>主治医 {p.attending}</span>
          {(doctors?.others ?? []).map((d) => (
            <span key={`${d.role}:${d.name}`} className={d.pending ? "text-yamabuki" : d.role === "担当医" ? "text-ink-soft" : "text-fuji"}>
              ／{doctorLabel(d)}
            </span>
          ))}
        </button>
      </div>
    </header>
  );
}

/** 「後期高齢者 2割」「協会けんぽ 本人 3割」「生活保護」「自費」のように短く。 */
function insuranceTag(i: Insurance): string {
  const cov = coverageOf(i);
  if (cov !== "医保") return cov === "公費のみ" && i.kohi?.length ? `公費 ${i.kohi[0].name ?? ""}`.trim() : cov;
  return `${i.kind}${i.relation === "家族" ? " 家族" : ""} ${rateLabel(i.rate)}${i.kohi?.length ? "＋公費" : ""}`;
}

function Badge({ tone, label, values, quiet }: { tone: "shu" | "fuji" | "yamabuki" | "ai"; label: string; values: string[]; quiet?: boolean }) {
  const styles = {
    ai: "border-ai/40 bg-ai-soft text-ai",
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

/* Help migration source (references and dynamic wording):
<span >入院後、食事とバイタル測定の指示がそろうまで表示します。</span>
*/
