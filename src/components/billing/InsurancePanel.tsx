"use client";

import { displayText } from "@/lib/display-text";
import { BigChoice } from "@/components/BigChoice";
import { ConfirmCheck } from "@/components/ConfirmCheck";
import { AlertTriangle, Ban, CheckCircle2, Info, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { auditLog } from "@/lib/audit";
import { touchedBy, visibleChecks } from "@/lib/billing/check-visibility";
import type { IncomeClass } from "@/lib/billing/insurance";
import {
  checkInsurance,
  derived,
  ELDER_CLASSES,
  EMPTY_FORM,
  hasErrors,
  INSURER_KINDS,
  insuranceSummary,
  KOUKI_CLASSES,
  normalizeForm,
  PROOFS,
  toInsurance,
  UNDER70_CLASSES,
  type FormCheck,
  type InsuranceForm,
  type InsuranceRecord,
} from "@/lib/billing/registration";
import { addDays, formatShort, type CalendarDate } from "@/lib/dates";
import type { Patient } from "@/lib/types";
import { DenyNote, useDeny, useMe } from "../RoleContext";
import { OnshiCheck } from "../national/OnshiCheck";

const CHECK_STYLE: Record<FormCheck["level"], { label: string; cls: string; icon: typeof Info }> = {
  error: { label: "直す", cls: "border-shu/40 bg-shu-soft text-shu", icon: Ban },
  warn: { label: "確かめる", cls: "border-yamabuki/40 bg-yamabuki-soft text-yamabuki", icon: AlertTriangle },
  info: { label: "決まり", cls: "border-rule bg-paper text-ink-soft", icon: Info },
};

const input = "w-full rounded border bg-sheet px-2 py-1 text-sm";

/**
 * 保険の登録 (医事課): the cards as the window read them. Code checks each entry and works out what
 * follows (窓口の限度額・食事の区分・レセプト種別); the person registers. Every version is kept.
 */
export function InsurancePanel({ patient, records, today, nowTime, onRegister }: { patient: Patient; records: InsuranceRecord[]; today: CalendarDate; nowTime: string; onRegister: (r: InsuranceRecord) => void }) {
  const me = useMe();
  const locked = useDeny()("insurance");
  const current = records[records.length - 1];
  const [form, setForm] = useState<InsuranceForm>(() => normalizeForm(current?.form ?? EMPTY_FORM));
  const [ack, setAck] = useState(false);
  // A fresh registration shows a check only for the fields touched, until 登録する is pressed (check-visibility.ts).
  const [touched, setTouched] = useState<ReadonlySet<string>>(() => new Set());
  const [revealAll, setRevealAll] = useState(false);
  const reveal = !!current || revealAll;
  const allChecks = useMemo(() => checkInsurance(form, { age: patient.age, on: today }), [form, patient.age, today]);
  const checks = visibleChecks(allChecks, { fresh: !current, revealAll, touched });
  const errors = hasErrors(allChecks);
  const warns = allChecks.filter((c) => c.level === "warn");
  const changed = !current || JSON.stringify(normalizeForm(current.form)) !== JSON.stringify(form);
  const action: InsuranceRecord["action"] = !current ? "登録" : changed ? "変更" : "確認";
  const preview = errors ? null : toInsurance(form);
  const fieldTone = (k: keyof InsuranceForm) => (checks.some((c) => c.field === k && c.level === "error") ? "border-shu" : checks.some((c) => c.field === k && c.level === "warn") ? "border-yamabuki" : "border-rule");
  const set = (patch: Partial<InsuranceForm>) => {
    setForm((f) => ({ ...f, ...patch }));
    setTouched((t) => touchedBy(t, patch));
    setAck(false);
  };
  const day = (d: number) => formatShort(addDays(today, d));

  const register = () => {
    // First press on a fresh form: show every check; register only when none stops it.
    if (!reveal) setRevealAll(true);
    if (locked || errors || (warns.length > 0 && !ack)) return;
    const insurance = toInsurance(form);
    const r: InsuranceRecord = { form, insurance, action, by: me.name, at: { day: 0, time: nowTime } };
    auditLog({ role: me.role, actor: me.name, action: `保険を${action === "確認" ? "確かめた（変わりなし）" : `${action}した`}`, patient: patient.name, detail: `${insuranceSummary(insurance)}　保険者番号 ${insurance.insurerNumber}${warns.length ? `　確かめた注意：${warns.map((w) => w.text).join("／").slice(0, 160)}` : ""}` });
    onRegister(r);
    setAck(false);
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <section aria-label="保険の登録" className="rounded-md border border-rule bg-paper p-4">
        <h3 className="mb-1 flex flex-wrap items-center gap-2 text-sm font-bold">
          <ShieldCheck size={15} />
          保険の登録
          {current ? (
            <span className="rounded bg-wakatake-soft px-1.5 py-0.5 text-[11px] font-normal text-wakatake">
              登録済み（{day(current.at.day)} {current.at.time} {displayText(current.by)}）
            </span>
          ) : (
            <span className="rounded bg-shu-soft px-1.5 py-0.5 text-[11px] font-normal text-shu">未登録：算定は年齢からの仮の保険です</span>
          )}
        </h3>

        <fieldset disabled={!!locked} className="grid grid-cols-2 gap-x-3 gap-y-2.5 text-xs">
          <label className="col-span-2 sm:col-span-1">
            <span className="mb-0.5 block text-ink-soft">保険の種類</span>
            <select value={form.kind} onChange={(e) => set({ kind: e.target.value as InsuranceForm["kind"] })} className={`${input} ${fieldTone("kind")}`}>
              <option value="">選ぶ</option>
              {INSURER_KINDS.map((k) => (
                <option key={k}>{k}</option>
              ))}
            </select>
          </label>
          <label className="col-span-2 sm:col-span-1">
            <span className="mb-0.5 block text-ink-soft">保険者番号（国保は6桁、ほかは8桁）</span>
            <input
              value={form.insurerNumber}
              onChange={(e) => set({ insurerNumber: e.target.value.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/\s/g, "") })}
              inputMode="numeric"
              maxLength={8}
              className={`nums ${input} ${fieldTone("insurerNumber")}`}
            />
          </label>
          <label>
            <span className="mb-0.5 block text-ink-soft">記号</span>
            <input value={form.symbol} onChange={(e) => set({ symbol: e.target.value })} className={`${input} ${fieldTone("symbol")}`} />
          </label>
          <div className="grid grid-cols-[minmax(0,1fr)_4.5rem] gap-2">
            <label>
              <span className="mb-0.5 block text-ink-soft">番号</span>
              <input value={form.number} onChange={(e) => set({ number: e.target.value })} className={`nums ${input} ${fieldTone("number")}`} />
            </label>
            <label>
              <span className="mb-0.5 block text-ink-soft">枝番</span>
              <input value={form.branch} onChange={(e) => set({ branch: e.target.value.trim() })} inputMode="numeric" maxLength={2} className={`nums ${input} ${fieldTone("branch")}`} />
            </label>
          </div>
          <div className="col-span-2">
            <span className="mb-0.5 block text-ink-soft">本人・家族</span>
            <BigChoice label="本人・家族" name="relation" options={[{ value: "本人", label: "本人（国保は世帯主）" }, { value: "家族", label: "家族（国保はその他）" }]} value={form.relation} onChange={(v) => set({ relation: v })} />
          </div>
          <label>
            <span className="mb-0.5 block text-ink-soft">生年月日（カルテは{patient.age}歳）</span>
            <input type="date" value={form.birthDate} onChange={(e) => set({ birthDate: e.target.value })} className={`nums ${input} ${fieldTone("birthDate")}`} />
          </label>
          <div>
            <span className="mb-0.5 block text-ink-soft">負担割合</span>
            <BigChoice label="負担割合" name="pi-rate" className={`rounded border p-0.5 ${fieldTone("rate")}`} options={(["10", "20", "30"] as const).map((value) => ({ value, label: `${Number(value) / 10}割` }))} value={form.rate} onChange={(v) => set({ rate: v })} />
          </div>
          <label>
            <span className="mb-0.5 block text-ink-soft">所得区分（適用区分）</span>
            <select value={form.incomeClass} onChange={(e) => set({ incomeClass: e.target.value as IncomeClass | "" })} className={`${input} ${fieldTone("incomeClass")}`}>
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
          <label>
            <span className="mb-0.5 block text-ink-soft">区分を確かめたもの</span>
            <select value={form.proof} onChange={(e) => set({ proof: e.target.value as InsuranceForm["proof"] })} className={`${input} ${fieldTone("proof")}`}>
              <option value="">選ぶ</option>
              {PROOFS.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </label>
          <div className={`col-span-2 flex items-center gap-1.5 ${fieldTone("elderCard") === "border-yamabuki" ? "text-yamabuki" : ""}`}>
                <ConfirmCheck checked={form.elderCard} onChange={(v) => set({ elderCard: v })}>高齢受給者証を確かめた（70〜74歳。負担割合が書いてある）</ConfirmCheck>
              </div>
          <label className="col-span-2 sm:col-span-1">
            <span className="mb-0.5 block text-ink-soft">過去12か月の入院日数（区分オ・低所得Ⅱで減額認定のある人）</span>
            <input value={form.stayDays} onChange={(e) => set({ stayDays: e.target.value.trim() })} inputMode="numeric" className={`nums ${input} ${fieldTone("stayDays")}`} />
          </label>
        </fieldset>

        <div className="mt-4 space-y-2">
          {reveal && warns.length > 0 && !errors && !locked && (
            <div className="flex items-center gap-1.5 text-xs text-yamabuki">
                <ConfirmCheck checked={ack} onChange={(v) => setAck(v)}>「確かめる」の{warns.length}件を保険証で確かめた</ConfirmCheck>
              </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {/* On a fresh form the button stays live so that pressing it shows what is still to fill. */}
            <button
              type="button"
              onClick={register}
              disabled={!!locked || (reveal && (errors || (warns.length > 0 && !ack)))}
              className="rounded-md bg-ai px-3 py-1.5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              {action === "登録" ? "登録する" : action === "変更" ? "変更を登録する" : "変わりがないことを確かめた"}
            </button>
            {current && changed && !locked && (
              <button type="button" onClick={() => set(normalizeForm(current.form))} className="text-xs text-ink-soft underline-offset-2 hover:underline">
                登録済みの内容に戻す
              </button>
            )}
            {reveal && errors && <span className="text-[11px] text-shu">「直す」があるうちは登録できません。</span>}
          </div>
          <DenyNote action="insurance" />
        </div>
      </section>

      <div className="space-y-3">
        <OnshiCheck
          person={{ id: patient.id, name: patient.name, kana: patient.kana, sex: patient.sex === "男" ? "男" : "女", age: patient.age }}
          today={today}
          nowTime={nowTime}
          card={{ insurerNumber: form.insurerNumber, symbol: form.symbol, number: form.number, branch: form.branch, birthDate: form.birthDate }}
          body={{ heightCm: patient.heightCm, weightKg: patient.weightKg }}
          locked={locked}
          current={form}
          onCopy={(c) => {
            setForm(c.form);
            setAck(false);
            // The answer filled the form: show what the code finds in it.
            setRevealAll(true);
          }}
        />
        <section aria-label="確かめ" className="rounded-md border border-rule bg-sheet p-3">
          <h3 className="mb-2 text-xs font-bold text-ink-soft">コードの確かめ<span className="hint">（根拠つき）</span></h3>
          {checks.length === 0 ? (
            <p className="text-xs text-ink-faint">—</p>
          ) : (
            <ul className="space-y-1">
              {[...checks]
                .sort((a, b) => ["error", "warn", "info"].indexOf(a.level) - ["error", "warn", "info"].indexOf(b.level))
                .map((c, i) => {
                  const s = CHECK_STYLE[c.level];
                  const Icon = s.icon;
                  return (
                    <li key={i} className={`rounded-md border px-2.5 py-1.5 text-xs ${s.cls}`}>
                      <div className="flex items-start gap-2">
                        <Icon size={13} className="mt-0.5 shrink-0" />
                        <span className="shrink-0 font-bold">{s.label}</span>
                        <span className="nums text-ink">{displayText(c.text)}</span>
                      </div>
                      <div className="hint mt-0.5 pl-5 text-[10px] text-ink-faint">根拠：{c.basis}</div>
                    </li>
                  );
                })}
            </ul>
          )}
        </section>

        <section aria-label="登録で決まること" className="rounded-md border border-rule bg-sheet p-3">
          <h3 className="mb-2 text-xs font-bold text-ink-soft">登録すると決まること（コードで出す）</h3>
          {preview ? (
            <dl className="nums grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
              {derived(preview, today).map((d) => (
                <div key={d.label} className="contents">
                  <dt className="text-ink-faint">{d.label}</dt>
                  <dd>{d.value}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="text-xs text-ink-faint">「直す」がなくなると出ます。</p>
          )}
        </section>

        <section aria-label="登録の履歴" className="rounded-md border border-rule bg-sheet p-3">
          <h3 className="mb-2 text-xs font-bold text-ink-soft">登録の履歴（前の版も残ります）</h3>
          {records.length === 0 ? (
            <p className="text-xs text-ink-faint">まだありません。</p>
          ) : (
            <ol className="space-y-1 text-xs">
              {[...records].reverse().map((r, i) => (
                <li key={records.length - i} className={`flex flex-wrap items-baseline gap-x-2 ${i > 0 ? "text-ink-faint" : ""}`}>
                  {i === 0 && <CheckCircle2 size={12} className="self-center text-wakatake" />}
                  <span className="font-bold">第{records.length - i}版 {r.action}</span>
                  <span className="nums">
                    {day(r.at.day)} {r.at.time}
                  </span>
                  <span>{displayText(r.by)}</span>
                  <span className="nums">{insuranceSummary(r.insurance)}</span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
}
