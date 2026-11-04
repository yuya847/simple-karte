"use client";

// 保険 at the 外来の受付: the card's numbers as the window types them, or filled from the answer of オンライン
// 資格確認（模擬）. The same form as 保険の登録 (registration.ts), with the fields a reception needs; 公費・生活
// 保護・労災 are registered in the 患者基本情報 window. Code checks the entries; the person receives.

import { AlertTriangle, Ban, Info } from "lucide-react";
import { VERIFY_METHODS, rateLabel, type IncomeClass, type VerifyMethod } from "@/lib/billing/insurance";
import { ELDER_CLASSES, insuranceSummary, isMedical, kindOptionOf, KOUKI_CLASSES, PROOFS, UNDER70_CLASSES, type FormCheck, type InsuranceForm, type InsuranceRecord } from "@/lib/billing/registration";
import { type CalendarDate, isoDate } from "@/lib/dates";
import { RECEPTION_KIND_OPTIONS } from "@/lib/opd-reception";

const CHECK_STYLE: Record<FormCheck["level"], { label: string; cls: string; icon: typeof Info }> = {
  error: { label: "直す", cls: "border-shu/40 bg-shu-soft text-shu", icon: Ban },
  warn: { label: "確かめる", cls: "border-yamabuki/40 bg-yamabuki-soft text-yamabuki", icon: AlertTriangle },
  info: { label: "決まり", cls: "border-rule bg-paper text-ink-soft", icon: Info },
};

interface Props {
  form: InsuranceForm;
  onChange: (patch: Partial<InsuranceForm>) => void;
  today: CalendarDate;
  /** The checks to show now (check-visibility.ts: the touched fields, or all). */
  checks: FormCheck[];
  /** Fields code filled from the 資格確認's answer, with why. */
  derived?: { field: keyof InsuranceForm; why: string }[];
  /** 再診: the registration found for the 診察券 (shown; carried to today's visit). */
  existing?: InsuranceRecord;
  disabled?: boolean;
}

/** The insurance block of the 受付 form. */
export function ReceptionInsurance({ form, onChange, today, checks, derived = [], existing, disabled }: Props) {
  const input = "w-full rounded border bg-sheet px-1.5 py-1 text-[13px] outline-none focus:border-ai";
  const tone = (k: keyof InsuranceForm) => (checks.some((c) => c.field === k && c.level === "error") ? "border-shu" : checks.some((c) => c.field === k && c.level === "warn") ? "border-yamabuki" : "border-rule");
  const medical = isMedical(form) && form.kind !== "";
  if (existing) {
    const ins = existing.insurance;
    return (
      <section aria-label="保険" className="rounded-md border border-rule bg-paper px-3 py-2 text-[12px]">
        <h3 className="text-[13px] font-bold">保険（登録あり）</h3>
        <p className="nums mt-0.5">
          <b>{insuranceSummary(ins)}</b>
          {ins.verify && <span className="ml-2 text-ink-soft">{ins.verify.method}{ins.verify.on && `（確認日 ${ins.verify.on}）`}</span>}
          <span className="ml-2 text-ink-faint">
            {existing.by}が{existing.action}（第{existing.at.day === 0 ? "今日" : `${existing.at.day}日`} {existing.at.time}）
          </span>
        </p>
        <p className="mt-0.5 text-[11px] text-ink-soft">受け付けると、この登録を今日の受診にも「確認」として引き継ぎます。変わっていれば、受け付けたあと患者基本情報の「保険・制度」で変更します。</p>
      </section>
    );
  }
  return (
    <fieldset disabled={disabled} aria-label="保険" className="rounded-md border border-rule bg-paper px-3 py-2 text-[12px]">
      <legend className="px-1 text-[13px] font-bold">保険</legend>
      <p className="mb-1.5 text-[11px] text-ink-soft">
        上の「資格を確認（模擬）」が有効なら、答えからここが埋まります。保険証（資格確認書）を見て手で入れることもできます。種類を選ばなければ、保険は登録せずに受け付けられます（あとで医事課か患者基本情報で登録）。
        <span className="hint">生活保護・労災・公費は患者基本情報の「保険・制度」で入れます。番号はすべて架空です。</span>
      </p>
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        <label className="text-[11px] text-ink-soft">
          保険の種類
          <select
            value={kindOptionOf(form)?.label ?? ""}
            onChange={(e) => {
              const o = RECEPTION_KIND_OPTIONS.find((x) => x.label === e.target.value);
              onChange(o ? { coverage: o.coverage, kind: o.kind } : { coverage: "", kind: "" });
            }}
            className={`${input} ${tone("kind")}`}
          >
            <option value="">選ぶ</option>
            {RECEPTION_KIND_OPTIONS.map((o) => (
              <option key={o.label} value={o.label}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[11px] text-ink-soft">
          生年月日
          <input type="date" value={form.birthDate} onChange={(e) => onChange({ birthDate: e.target.value })} className={`nums ${input} ${tone("birthDate")}`} />
        </label>
        {medical && (
          <>
            <label className="text-[11px] text-ink-soft">
              保険者番号（国保6桁・ほか8桁）
              <input value={form.insurerNumber} onChange={(e) => onChange({ insurerNumber: e.target.value.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/\s/g, "") })} inputMode="numeric" maxLength={8} className={`nums ${input} ${tone("insurerNumber")}`} />
            </label>
            <div className="grid grid-cols-[1fr_1fr_3.5rem] gap-1.5">
              <label className="text-[11px] text-ink-soft">
                記号
                <input value={form.symbol} onChange={(e) => onChange({ symbol: e.target.value })} className={`${input} ${tone("symbol")}`} />
              </label>
              <label className="text-[11px] text-ink-soft">
                番号
                <input value={form.number} onChange={(e) => onChange({ number: e.target.value })} className={`nums ${input} ${tone("number")}`} />
              </label>
              <label className="text-[11px] text-ink-soft">
                枝番
                <input value={form.branch} onChange={(e) => onChange({ branch: e.target.value.trim() })} inputMode="numeric" maxLength={2} className={`nums ${input} ${tone("branch")}`} />
              </label>
            </div>
            <div className="text-[11px] text-ink-soft">
              本人・家族
              <div role="radiogroup" aria-label="本人・家族" className={`flex gap-1.5 rounded border p-0.5 ${tone("relation")}`}>
                {(["本人", "家族"] as const).map((v) => (
                  <label key={v} className={`flex min-h-8 flex-1 cursor-pointer items-center justify-center gap-1 rounded text-[12px] ${form.relation === v ? "bg-ai-soft font-bold text-ai" : "text-ink"}`}>
                    <input type="radio" name="rc-relation" checked={form.relation === v} onChange={() => onChange({ relation: v })} className="accent-ai" />
                    {v}
                  </label>
                ))}
              </div>
            </div>
            <div className="text-[11px] text-ink-soft">
              負担割合
              <div role="radiogroup" aria-label="負担割合" className={`flex gap-1.5 rounded border p-0.5 ${tone("rate")}`}>
                {(["10", "20", "30"] as const).map((v) => (
                  <label key={v} className={`flex min-h-8 flex-1 cursor-pointer items-center justify-center gap-1 rounded text-[12px] ${form.rate === v ? "bg-ai-soft font-bold text-ai" : "text-ink"}`}>
                    <input type="radio" name="rc-rate" checked={form.rate === v} onChange={() => onChange({ rate: v })} className="accent-ai" />
                    {rateLabel(Number(v))}
                  </label>
                ))}
              </div>
            </div>
            <label className="text-[11px] text-ink-soft">
              所得区分（適用区分）
              <select value={form.incomeClass} onChange={(e) => onChange({ incomeClass: e.target.value as IncomeClass | "" })} className={`${input} ${tone("incomeClass")}`}>
                <option value="">選ぶ</option>
                <optgroup label="70歳未満">
                  {UNDER70_CLASSES.map((c) => (
                    <option key={c} value={c}>
                      区分{c}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="70〜74歳（高齢受給者）">
                  {ELDER_CLASSES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="後期高齢者">
                  {KOUKI_CLASSES.filter((c) => !ELDER_CLASSES.includes(c)).map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </optgroup>
              </select>
            </label>
            <label className="text-[11px] text-ink-soft">
              限度額の区分を確かめたもの
              <select value={form.proof} onChange={(e) => onChange({ proof: e.target.value as InsuranceForm["proof"] })} className={`${input} ${tone("proof")}`}>
                <option value="">選ぶ</option>
                {PROOFS.map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1.5 self-end pb-1 text-[12px]">
              <input type="checkbox" checked={form.elderCard} onChange={(e) => onChange({ elderCard: e.target.checked })} />
              高齢受給者証を確かめた（70〜74歳）
            </label>
          </>
        )}
        {form.coverage !== "自費" && (
          <>
            <label className="text-[11px] text-ink-soft">
              資格確認の方法
              <select value={form.verify} onChange={(e) => onChange({ verify: e.target.value as VerifyMethod | "", ...(e.target.value && !form.verifiedOn ? { verifiedOn: isoDate(today) } : {}) })} className={`${input} ${tone("verify")}`}>
                <option value="">選ぶ</option>
                {VERIFY_METHODS.map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
            <label className="text-[11px] text-ink-soft">
              確認日
              <input type="date" value={form.verifiedOn} onChange={(e) => onChange({ verifiedOn: e.target.value })} className={`nums ${input} ${tone("verifiedOn")}`} />
            </label>
          </>
        )}
      </div>
      {derived.length > 0 && (
        <ul className="mt-1 text-[11px] text-yamabuki">
          {derived.map((d) => (
            <li key={d.field}>コードで入れた：{d.why}</li>
          ))}
        </ul>
      )}
      {checks.length > 0 && (
        <ul className="mt-1.5 space-y-1">
          {[...checks]
            .sort((a, b) => ["error", "warn", "info"].indexOf(a.level) - ["error", "warn", "info"].indexOf(b.level))
            .map((c, i) => {
              const s = CHECK_STYLE[c.level];
              const Icon = s.icon;
              return (
                <li key={i} className={`rounded-md border px-2.5 py-1 text-xs ${s.cls}`}>
                  <div className="flex items-start gap-2">
                    <Icon size={13} className="mt-0.5 shrink-0" />
                    <span className="shrink-0 font-bold">{s.label}</span>
                    <span className="nums text-ink">{c.text}</span>
                  </div>
                  <div className="hint mt-0.5 pl-5 text-[10px] text-ink-faint">根拠：{c.basis}</div>
                </li>
              );
            })}
        </ul>
      )}
    </fieldset>
  );
}
