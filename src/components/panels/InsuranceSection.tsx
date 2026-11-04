"use client";

// 保険・制度 of the 患者基本情報 window: the one registration the window and 医事課 share (iji.insurance),
// shown and changed here. Code checks every entry (負担割合と年齢の整合、保険者番号・負担者番号の検証番号、
// 有効期限…) and works out what follows; a person registers. Each save keeps the earlier version with who,
// when and why (監査ログも). 医事課・医師・看護師 may change it (roles.ts "insurance"; 架空の病院の取り決め).

import { BigChoice } from "@/components/BigChoice";
import { ConfirmCheck } from "@/components/ConfirmCheck";
import { AlertTriangle, Ban, CheckCircle2, Info, Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { auditLog } from "@/lib/audit";
import { touchedBy, visibleChecks } from "@/lib/billing/check-visibility";
import { FUTAN_SOURCES, KOHI_KINDS } from "@/lib/billing/futan";
import { rateLabel, VERIFY_METHODS, type IncomeClass, type VerifyMethod } from "@/lib/billing/insurance";
import {
  checkInsurance,
  derived,
  ELDER_CLASSES,
  EMPTY_FORM,
  emptyKohi,
  hasErrors,
  insuranceSummary,
  isMedical,
  KIND_OPTIONS,
  kindOptionOf,
  KOUKI_CLASSES,
  normalizeForm,
  PROOFS,
  toInsurance,
  UNDER70_CLASSES,
  type FormCheck,
  type InsuranceForm,
  type InsuranceRecord,
  type KohiForm,
} from "@/lib/billing/registration";
import { type CalendarDate, isoDate } from "@/lib/dates";
import type { Patient } from "@/lib/types";
import { OnshiCheck } from "../national/OnshiCheck";
import { DenyNote, useDeny, useMe } from "../RoleContext";
import { infoInput as input, infoLinkBtn as linkBtn, Row } from "./InfoRow";

const CHECK_STYLE: Record<FormCheck["level"], { label: string; cls: string; icon: typeof Info }> = {
  error: { label: "直す", cls: "border-shu/40 bg-shu-soft text-shu", icon: Ban },
  warn: { label: "確かめる", cls: "border-yamabuki/40 bg-yamabuki-soft text-yamabuki", icon: AlertTriangle },
  info: { label: "決まり", cls: "border-rule bg-paper text-ink-soft", icon: Info },
};

const yen = (n: number) => `${n.toLocaleString("ja-JP")}円`;

interface Props {
  patient: Patient;
  today: CalendarDate;
  nowTime: string;
  fmtDay: (d: number) => string;
  /** Every version; the last is in force. */
  records?: InsuranceRecord[];
  onRegister?: (r: InsuranceRecord) => void;
  /** Opens 医事課's 算定 screen (the claim and the inpatient bill). */
  onOpenBilling?: () => void;
  /** Start with the form open (the window opened from 「保険を登録する」; tests). */
  defaultEdit?: boolean;
}

/** The 保険・制度 section: what is registered, and the form to register or change it. */
export function InsuranceSection({ patient: p, today, nowTime, fmtDay, records = [], onRegister, onOpenBilling, defaultEdit = false }: Props) {
  const me = useMe();
  const denied = useDeny()("insurance");
  const current = records[records.length - 1];
  const [edit, setEdit] = useState(defaultEdit && !denied && !!onRegister);
  const [form, setForm] = useState<InsuranceForm>(() => normalizeForm(current?.form));
  const [reason, setReason] = useState("");
  const [ack, setAck] = useState(false);
  // A fresh registration shows a check only for the fields touched, until 登録 is pressed (check-visibility.ts).
  const [touched, setTouched] = useState<ReadonlySet<string>>(() => new Set());
  const [revealAll, setRevealAll] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);
  const when = (at: { day: number; time: string }) => `${at.day === 0 ? "今日" : fmtDay(at.day)} ${at.time}`;
  const allChecks = useMemo(() => (edit ? checkInsurance(form, { age: p.age, on: today }) : []), [edit, form, p.age, today]);
  const reveal = !!current || revealAll;
  const checks = visibleChecks(allChecks, { fresh: !current, revealAll, touched });
  const errors = hasErrors(allChecks);
  const warns = allChecks.filter((c) => c.level === "warn");
  const changed = !current || JSON.stringify(normalizeForm(current.form)) !== JSON.stringify(form);
  const action: InsuranceRecord["action"] = !current ? "登録" : changed ? "変更" : "確認";
  const needReason = action === "変更" && !reason.trim();
  const preview = edit && !errors ? toInsurance(form) : null;
  const medical = isMedical(form);
  const tone = (k: keyof InsuranceForm) => (checks.some((c) => c.field === k && c.level === "error") ? "border-shu" : checks.some((c) => c.field === k && c.level === "warn") ? "border-yamabuki" : "border-rule");
  const set = (patch: Partial<InsuranceForm>) => {
    setForm((f) => ({ ...f, ...patch }));
    setTouched((t) => touchedBy(t, patch));
    setAck(false);
  };
  const setKohi = (i: number, patch: Partial<KohiForm>) => set({ kohi: form.kohi.map((k, j) => (j === i ? { ...k, ...patch } : k)) });

  // The form opens below the registered values: bring it into view (the window does not scroll by itself).
  useEffect(() => {
    if (edit) sectionRef.current?.scrollIntoView?.({ block: "start", behavior: "smooth" });
  }, [edit]);

  const startEdit = () => {
    setForm(normalizeForm(current?.form));
    setReason("");
    setAck(false);
    setTouched(new Set());
    setRevealAll(false);
    setEdit(true);
  };
  const save = () => {
    // First press on a fresh form: show every check; save only when none stops it.
    if (!reveal) setRevealAll(true);
    if (denied || !onRegister || errors || needReason || (warns.length > 0 && !ack)) return;
    const insurance = toInsurance(form);
    const r: InsuranceRecord = { form, insurance, action, by: me.name, at: { day: 0, time: nowTime }, ...(reason.trim() ? { reason: reason.trim() } : {}) };
    auditLog({ role: me.role, actor: me.name, action: `保険を${action === "確認" ? "確かめた（変わりなし）" : `${action}した`}（患者基本情報）`, patient: p.name, detail: `${insuranceSummary(insurance)}${reason.trim() ? `　理由：${reason.trim()}` : ""}${warns.length ? `　確かめた注意：${warns.map((w) => w.text).join("／").slice(0, 160)}` : ""}` });
    onRegister(r);
    setEdit(false);
  };

  const ins = current?.insurance;
  const regBy = current ? `${when(current.at)} ${current.by}（${current.action}・第${records.length}版）` : undefined;
  const kindLabel = ins ? (kindOptionOf({ coverage: ins.coverage ?? "医保", kind: ins.kind })?.label ?? ins.kind) : "";

  return (
    <section ref={sectionRef} id="pi-insurance" aria-labelledby="pi-insurance-h" className="rounded-lg border border-rule bg-paper/50 p-3">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <h3 id="pi-insurance-h" className="text-sm font-bold">
          保険・制度
        </h3>
        {regBy && <span className="nums text-[11px] text-ink-faint">登録：{regBy}</span>}
        <span className="ml-auto flex flex-wrap gap-1">
          {!denied && !edit && onRegister && (
            <button type="button" onClick={startEdit} className={linkBtn}>
              <Pencil size={12} />
              {current ? "保険を編集" : "保険を登録する"}
            </button>
          )}
          {onOpenBilling && (
            <button type="button" onClick={onOpenBilling} className={linkBtn}>
              算定（医事課の画面）を開く
            </button>
          )}
        </span>
      </div>
      <DenyNote action="insurance" className="mb-1" />
      <p className="hint mb-1 text-[11px] text-ink-faint">
        保険証（資格確認書）・高齢受給者証・限度額適用認定証・公費の受給者証を見て入れます。年齢と負担割合の整合、番号の検証番号、有効期限はコードで確かめます。医事課の「算定」の保険の登録と同じ記録で、二重には持ちません。番号はすべて架空です。
      </p>

      {!edit && (
        <dl>
          {ins ? (
            <>
              <Row label="保険の種類" by={regBy}>
                <b>{kindLabel}</b>
                {isMedical({ coverage: ins.coverage ?? "" }) && <span className="ml-2 text-ink-soft">{ins.relation}</span>}
              </Row>
              {isMedical({ coverage: ins.coverage ?? "" }) && (
                <>
                  <Row label="保険者番号・記号番号" by="保険の登録">
                    <span className="nums">
                      {ins.insurerNumber}　{[ins.symbol, ins.number, ins.branch && `枝番 ${ins.branch}`].filter(Boolean).join("・")}
                    </span>
                  </Row>
                  <Row label="負担割合" by="保険の登録">
                    <b className="nums">{rateLabel(ins.rate)}</b>
                    <span className="ml-2 text-ink-soft">所得区分 {ins.incomeClass}</span>
                  </Row>
                  <Row label="限度額の認定" by={current?.form.proof ? `確かめたもの：${current.form.proof}` : "保険の登録"}>
                    {ins.limitKnown ? "適用区分がわかっている（窓口で高額療養費の限度額まで）" : <span className="text-yamabuki">わからない（限度額適用認定証の提示かマイナ保険証での情報提供が要ります）</span>}
                  </Row>
                </>
              )}
              {!isMedical({ coverage: ins.coverage ?? "" }) && (
                <Row label="窓口の患者負担" by="保険の登録">
                  <b>{rateLabel(ins.rate)}</b>
                  <span className="ml-2 text-ink-soft">{ins.coverage === "自費" ? "保険を使わない" : ins.coverage === "労災" ? "労災保険に請求（この試作では算定しない）" : "公費の負担割合と上限で計算"}</span>
                </Row>
              )}
              <Row label="公費" by="保険の登録">
                {ins.kohi?.length ? (
                  <ul className="space-y-0.5">
                    {ins.kohi.map((k) => (
                      <li key={`${k.lawNo}-${k.recipientNumber}`} className="nums">
                        <b>{k.lawNo}</b> {k.name}　負担者番号 {k.payerNumber}・受給者番号 {k.recipientNumber}
                        <span className="ml-2 text-ink-soft">
                          患者負担 {k.rate}%{k.capYen !== null ? `・上限 ${yen(k.capYen)}/月` : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  "なし"
                )}
              </Row>
              <Row label="有効期限" by="保険の登録">
                {ins.validUntil ? <span className="nums">{ins.validUntil}</span> : <span className="text-ink-faint">記載なし</span>}
              </Row>
              <Row label="資格確認" by="保険の登録">
                {ins.verify ? (
                  <span>
                    {ins.verify.method}
                    {ins.verify.on && <span className="nums ml-2 text-ink-soft">確認日 {ins.verify.on}</span>}
                  </span>
                ) : (
                  <span className="text-yamabuki">未確認</span>
                )}
              </Row>
            </>
          ) : (
            <Row label="保険" by="未登録">
              <span className="text-yamabuki">未登録です。{denied ? "医事課・医師・看護師が" : "「保険を登録する」で"}入れます（それまで算定は年齢からの仮の保険で計算しています）。</span>
            </Row>
          )}
        </dl>
      )}

      {edit && (
        <fieldset disabled={!!denied} className="space-y-3 rounded border border-ai/30 bg-sheet p-2.5 text-[12px]">
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
            <label className="col-span-2 text-[11px] text-ink-soft">
              保険の種類
              <select
                value={kindOptionOf(form)?.label ?? ""}
                onChange={(e) => {
                  const o = KIND_OPTIONS.find((x) => x.label === e.target.value);
                  set(o ? { coverage: o.coverage, kind: o.kind, ...(o.coverage === "生活保護" && !form.kohi.some((k) => k.lawNo === "12") ? { kohi: [{ ...emptyKohi(), lawNo: "12", name: "生活保護（医療扶助）" }, ...form.kohi] } : {}) } : { coverage: "", kind: "" });
                }}
                className={`${input} ${tone("kind")}`}
              >
                <option value="">選ぶ</option>
                {KIND_OPTIONS.map((o) => (
                  <option key={o.label} value={o.label}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-[11px] text-ink-soft">
              生年月日（カルテは{p.age}歳）
              <input type="date" value={form.birthDate} onChange={(e) => set({ birthDate: e.target.value })} className={`nums ${input} ${tone("birthDate")}`} />
            </label>
            <label className="text-[11px] text-ink-soft">
              有効期限（証に書いてあれば）
              <input type="date" value={form.validUntil} onChange={(e) => set({ validUntil: e.target.value })} className={`nums ${input} ${tone("validUntil")}`} />
            </label>
          </div>

          {medical && (
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
              <label className="text-[11px] text-ink-soft">
                保険者番号（国保6桁・ほか8桁）
                <input value={form.insurerNumber} onChange={(e) => set({ insurerNumber: e.target.value.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/\s/g, "") })} inputMode="numeric" maxLength={8} className={`nums ${input} ${tone("insurerNumber")}`} />
              </label>
              <label className="text-[11px] text-ink-soft">
                記号
                <input value={form.symbol} onChange={(e) => set({ symbol: e.target.value })} className={`${input} ${tone("symbol")}`} />
              </label>
              <label className="text-[11px] text-ink-soft">
                番号
                <input value={form.number} onChange={(e) => set({ number: e.target.value })} className={`nums ${input} ${tone("number")}`} />
              </label>
              <label className="text-[11px] text-ink-soft">
                枝番（2桁）
                <input value={form.branch} onChange={(e) => set({ branch: e.target.value.trim() })} inputMode="numeric" maxLength={2} className={`nums ${input} ${tone("branch")}`} />
              </label>
              <div className="text-[11px] text-ink-soft">
                本人・家族
                <BigChoice label="本人・家族" name="pi-relation" className={`rounded border p-0.5 ${tone("relation")}`} options={[{ value: "本人", label: "本人" }, { value: "家族", label: "家族" }]} value={form.relation} onChange={(v) => set({ relation: v })} />
              </div>
              <div className="text-[11px] text-ink-soft">
                負担割合
                <BigChoice label="負担割合" name="pi-rate" className={`rounded border p-0.5 ${tone("rate")}`} options={(["10", "20", "30"] as const).map((value) => ({ value, label: `${Number(value) / 10}割` }))} value={form.rate} onChange={(v) => set({ rate: v })} />
              </div>
              <label className="text-[11px] text-ink-soft">
                所得区分（適用区分）
                <select value={form.incomeClass} onChange={(e) => set({ incomeClass: e.target.value as IncomeClass | "" })} className={`${input} ${tone("incomeClass")}`}>
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
                <select value={form.proof} onChange={(e) => set({ proof: e.target.value as InsuranceForm["proof"] })} className={`${input} ${tone("proof")}`}>
                  <option value="">選ぶ</option>
                  {PROOFS.map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </label>
              <div className={`col-span-2 flex items-center gap-1.5 text-[12px] ${tone("elderCard") === "border-yamabuki" ? "text-yamabuki" : ""}`}>
                <ConfirmCheck checked={form.elderCard} onChange={(v) => set({ elderCard: v })}>高齢受給者証を確かめた（70〜74歳）</ConfirmCheck>
              </div>
              <label className="col-span-2 text-[11px] text-ink-soft">
                過去12か月の入院日数（区分オ・低所得Ⅱで減額認定のある人）
                <input value={form.stayDays} onChange={(e) => set({ stayDays: e.target.value.trim() })} inputMode="numeric" className={`nums ${input} ${tone("stayDays")}`} />
              </label>
            </div>
          )}

          <div>
            <h4 className="mb-1 text-xs font-bold text-ink-soft">公費（受給者証）</h4>
            <div className="space-y-1">
              {form.kohi.map((k, i) => (
                <div key={i} className="grid grid-cols-2 items-end gap-1.5 sm:grid-cols-[1fr_8rem_8rem_7rem_auto]">
                  <label className="text-[11px] text-ink-soft">
                    制度（法別番号）
                    <select
                      value={k.lawNo}
                      onChange={(e) => {
                        const kind = KOHI_KINDS.find((x) => x.lawNo === e.target.value);
                        setKohi(i, { lawNo: e.target.value, name: kind?.name ?? k.name });
                      }}
                      className={`${input} ${tone("kohi")}`}
                    >
                      <option value="">選ぶ</option>
                      {KOHI_KINDS.map((x) => (
                        <option key={x.lawNo} value={x.lawNo}>
                          {x.lawNo} {x.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-[11px] text-ink-soft">
                    負担者番号（8桁）
                    <input value={k.payerNumber} onChange={(e) => setKohi(i, { payerNumber: e.target.value.trim() })} inputMode="numeric" maxLength={8} aria-label={`公費${i + 1}の負担者番号`} className={`nums ${input} ${tone("kohi")}`} />
                  </label>
                  <label className="text-[11px] text-ink-soft">
                    受給者番号（7桁）
                    <input value={k.recipientNumber} onChange={(e) => setKohi(i, { recipientNumber: e.target.value.trim() })} inputMode="numeric" maxLength={7} aria-label={`公費${i + 1}の受給者番号`} className={`nums ${input} ${tone("kohi")}`} />
                  </label>
                  <label className="text-[11px] text-ink-soft">
                    上限月額（円）
                    <input value={k.capYen} onChange={(e) => setKohi(i, { capYen: e.target.value.trim() })} inputMode="numeric" aria-label={`公費${i + 1}の上限月額`} className={`nums ${input} ${tone("kohi")}`} />
                  </label>
                  <button type="button" onClick={() => set({ kohi: form.kohi.filter((_, j) => j !== i) })} aria-label={`公費${i + 1}を消す`} className="rounded p-1 text-ink-faint hover:text-shu">
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
            <button type="button" onClick={() => set({ kohi: [...form.kohi, emptyKohi()] })} className={`${linkBtn} mt-1`}>
              <Plus size={12} />
              公費を足す
            </button>
          </div>

          {form.coverage !== "自費" && form.coverage !== "労災" && (
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
              <label className="col-span-2 text-[11px] text-ink-soft">
                資格確認の方法
                <select value={form.verify} onChange={(e) => set({ verify: e.target.value as VerifyMethod | "", ...(e.target.value && !form.verifiedOn ? { verifiedOn: isoDate(today) } : {}) })} className={`${input} ${tone("verify")}`}>
                  <option value="">選ぶ</option>
                  {VERIFY_METHODS.map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </label>
              <label className="text-[11px] text-ink-soft">
                確認日
                <input type="date" value={form.verifiedOn} onChange={(e) => set({ verifiedOn: e.target.value })} className={`nums ${input} ${tone("verifiedOn")}`} />
              </label>
            </div>
          )}

          {medical && (
            <OnshiCheck
              compact
              person={{ id: p.id, name: p.name, kana: p.kana, sex: p.sex === "男" ? "男" : "女", age: p.age }}
              today={today}
              nowTime={nowTime}
              card={{ insurerNumber: form.insurerNumber, symbol: form.symbol, number: form.number, branch: form.branch, birthDate: form.birthDate }}
              body={{ heightCm: p.heightCm, weightKg: p.weightKg }}
              locked={denied}
              current={form}
              onCopy={(c) => {
                setForm(normalizeForm(c.form));
                setAck(false);
                // The answer filled the form: show what the code finds in it.
                setRevealAll(true);
              }}
            />
          )}

          {checks.length > 0 && (
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
                        <span className="nums text-ink">{c.text}</span>
                      </div>
                      <div className="hint mt-0.5 pl-5 text-[10px] text-ink-faint">根拠：{c.basis}</div>
                    </li>
                  );
                })}
            </ul>
          )}

          {preview && (
            <dl className="nums grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5 rounded border border-rule bg-paper px-2 py-1.5 text-[11px]">
              <dt className="col-span-2 font-bold text-ink-soft">登録すると決まること（コードで出す）</dt>
              {derived(preview, today).map((d) => (
                <div key={d.label} className="contents">
                  <dt className="text-ink-faint">{d.label}</dt>
                  <dd>{d.value}</dd>
                </div>
              ))}
            </dl>
          )}

          {current && (
            <label className="block text-[11px] text-ink-soft">
              変更の理由（変えるときは必ず）
              <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="例：保険が協会けんぽから国保に変わった（資格確認書を確認）" className={input} />
            </label>
          )}
          {reveal && warns.length > 0 && !errors && (
            <div className="flex items-center gap-1.5 text-xs text-yamabuki">
                <ConfirmCheck checked={ack} onChange={(v) => setAck(v)}>「確かめる」の{warns.length}件を証で確かめた</ConfirmCheck>
              </div>
          )}
          <div className="flex items-center gap-2">
            {/* On a fresh form the button stays live so that pressing it shows what is still to fill. */}
            <button type="button" disabled={reveal && (errors || needReason || (warns.length > 0 && !ack))} onClick={save} className="rounded bg-ink px-3 py-1 text-sm font-bold text-white disabled:opacity-40">
              {action === "登録" ? "登録" : action === "変更" ? "変更を保存" : "変わりがないことを確かめた"}
            </button>
            <button type="button" onClick={() => setEdit(false)} className="text-xs text-ink-faint hover:text-ink">
              やめる
            </button>
            {reveal && errors && <span className="text-[11px] text-shu">「直す」があるうちは登録できません。</span>}
            {!errors && needReason && <span className="text-[11px] text-yamabuki">変更の理由を入れてください。</span>}
            <span className="nums ml-auto text-[11px] text-ink-faint">
              {me.name}　今日 {nowTime}
            </span>
          </div>
          <p className="hint text-[11px] text-ink-faint">保存すると前の版が残り、誰が・いつ・なぜ変えたかが下の履歴と監査ログに出ます。実在の人の番号は入れないでください（架空の病院の試作です）。</p>
        </fieldset>
      )}

      {records.length > 0 && (
        <details className="mt-2 text-[11px]">
          <summary className="cursor-pointer text-ink-soft">保険の登録の履歴（{records.length}版）</summary>
          <ol className="mt-1 space-y-0.5">
            {[...records].reverse().map((r, i) => (
              <li key={records.length - i} className={`flex flex-wrap items-baseline gap-x-2 ${i > 0 ? "text-ink-faint" : ""}`}>
                {i === 0 && <CheckCircle2 size={11} className="self-center text-wakatake" />}
                <span className="font-bold">
                  第{records.length - i}版 {r.action}
                </span>
                <span className="nums">{when(r.at)}</span>
                <span>{r.by}</span>
                <span className="nums">{insuranceSummary(r.insurance)}</span>
                {r.reason && <span className="text-ink-soft">理由：{r.reason}</span>}
              </li>
            ))}
          </ol>
        </details>
      )}
      <ul className="hint mt-2 space-y-0.5 text-[10px] text-ink-faint">
        {FUTAN_SOURCES.slice(0, 4).map((s) => (
          <li key={s.url}>
            出典：{s.label}{" "}
            <a href={s.url} target="_blank" rel="noreferrer" className="break-all underline">
              {s.url}
            </a>
          </li>
        ))}
        <li>誰が登録・変更できるか（医事課・医師・看護師）は架空の病院の取り決めです。</li>
      </ul>
    </section>
  );
}

/** For the window's unchanged state: the form the section edits (exported for tests). */
export const insuranceFormOf = (r?: InsuranceRecord) => normalizeForm(r?.form ?? EMPTY_FORM);
