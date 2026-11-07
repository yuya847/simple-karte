"use client";
import { Plus, Printer } from "lucide-react";
import { useState, useSyncExternalStore } from "react";
import { createPortal, flushSync } from "react-dom";
import { addDays, formatShort, type CalendarDate } from "@/lib/dates";
import type { DischargeDraft } from "@/lib/discharge";
import type { Diagnosis } from "@/lib/diagnoses";
import { FACILITIES } from "@/lib/liaison";
import {
  LETTER_HOSPITAL, LETTER_TYPES, MEDICAL, PARTNERS, chartDischargeDay, confirmLetter, letterKind, letterRights, letterTitle, letterVerdict, newLetter, saveDraft, verdictLine, versionNo,
  type Letter, type LetterFlags, type LetterSeed, type LetterType, type PatientKind,
} from "@/lib/letters";
import { can } from "@/lib/roles";
import type { HistoryEntry, Patient } from "@/lib/types";
import { LetterDoc } from "../LetterDoc";
import { useDeny, useMe } from "../RoleContext";

interface Props {
  patient: Patient;
  entries: HistoryEntry[];
  diagnoses: Diagnosis[];
  today: CalendarDate;
  nowTime: string;
  /** This patient's letters (letters.ts lettersFor). */
  letters: Letter[];
  discharge?: DischargeDraft;
  /** Open this letter, or start a new one with these values. */
  open?: { id?: string; seed?: LetterSeed & { type?: LetterType } } | null;
  /** 患者の住所・電話（患者基本情報）. */
  contact?: string;
  newId: () => string;
  onSave: (l: Letter, how: "下書き" | "確定") => void;
  onPrint?: (l: Letter) => void;
}

const noSubscribe = () => () => {};
const field = "mt-0.5 w-full rounded border border-rule bg-sheet px-2 py-1 text-[13px] text-ink disabled:bg-paper";

/**
 * 紹介状: choose the kind (tabs), the address, the fields, then 下書きを保存・確定して保存・印刷. The chart's facts are in
 * the fields from the start; the fee of the letter is one line under the address. Below, this patient's letters.
 */
export function LetterPanel({ patient, entries, diagnoses, today, nowTime, letters, discharge, open, contact, newId, onSave, onPrint }: Props) {
  const me = useMe();
  const denyReason = useDeny()("discharge");
  const rightsOf = (t: LetterType) => letterRights((a) => can(me.role, a), t);
  const chart = { patient, entries, diagnoses, today, discharge };
  const now = { day: 0, time: nowTime };
  const fresh = (type: LetterType, seed: LetterSeed = {}) => newLetter(newId(), chart, type, me.name, now, seed);
  const firstType = LETTER_TYPES.find((k) => rightsOf(k.type).draft)?.type ?? "紹介";
  const [cur, setCur] = useState<Letter>(() => letters.find((l) => l.id === open?.id) ?? fresh(open?.seed?.type ?? firstType, open?.seed));
  const [editing, setEditing] = useState(false);
  const [reason, setReason] = useState("");
  const [printing, setPrinting] = useState(false);
  const mounted = useSyncExternalStore(noSubscribe, () => true, () => false);
  const saved = letters.find((l) => l.id === cur.id);
  const rights = rightsOf(cur.type);
  const confirmed = cur.status === "確定";
  const locked = (confirmed && !editing) || !rights.draft;
  const kind = letterKind(cur.type);
  const dischargeDay = chartDischargeDay(chart);
  const inpatient = patient.ward !== "外来" && patient.ward !== "救急外来";
  const verdict = letterVerdict(confirmed ? cur : { ...cur, dischargeDay }, letters, today, now, { dischargedOn: patient.dischargedAt?.day, inpatient });
  const set = (patch: Partial<Letter>) => setCur((x) => ({ ...x, ...patch }));
  const flag = (patch: LetterFlags) => setCur((x) => ({ ...x, flags: { ...x.flags, ...patch } }));
  const openLetter = (l: Letter) => { setCur(l); setEditing(false); setReason(""); };
  const facilities = MEDICAL.includes(cur.type) ? FACILITIES.filter((f) => f.kind !== "介護施設") : cur.type === "介護施設" ? FACILITIES.filter((f) => f.kind === "介護施設") : [];

  const save = (how: "下書き" | "確定") => {
    const x = { ...cur, dischargeDay };
    const next = how === "確定" ? confirmLetter(x, saved, me.name, now, reason) : saveDraft(x);
    onSave(next, how);
    openLetter(next);
  };
  const print = () => {
    flushSync(() => setPrinting(true));
    const done = () => { setPrinting(false); window.removeEventListener("afterprint", done); };
    window.addEventListener("afterprint", done);
    onPrint?.(cur);
    window.print();
  };

  const check = (label: string, k: keyof LetterFlags) => (
    <label className="flex items-center gap-1">
      <input type="checkbox" disabled={locked} checked={!!cur.flags[k]} onChange={(e) => flag({ [k]: e.target.checked })} className="accent-ai" />
      {label}
    </label>
  );
  const conditions = (() => {
    const t = cur.type, f = cur.flags;
    if (t === "紹介" || t === "介護施設") return <>{check("患者の同意", "consent")}{check("治療計画・検査結果・画像を添付", "attach")}</>;
    if (t === "保健福祉") return <>{check("患者の同意", "consent")}{check("自宅に帰る", "home")}{(dischargeDay === undefined || dischargeDay > 0) && check("介護支援等連携指導料を算定した", "kaigoShien")}</>;
    if (t === "歯科") return <>{check("歯科からの求め", "request")}{check("患者の同意", "consent")}</>;
    if (t === "セカンドオピニオン") return <>{check("患者・家族の希望", "wish")}{check("治療計画・検査結果・画像を添付", "attach")}</>;
    if (t !== "返書") return null;
    const special = f.partner === "難病" || f.partner === "産科";
    return (
      <>
        <label className="flex items-center gap-1">
          相手
          <select disabled={locked} value={f.partner ?? ""} onChange={(e) => { const partner = (e.target.value || undefined) as LetterFlags["partner"]; flag({ partner, ...(partner === "産科" && patient.pregnancy && !f.patientKind ? { patientKind: "妊娠中" as PatientKind } : {}) }); }} className="rounded border border-rule bg-sheet px-1">
            <option value="">未選択</option>
            {PARTNERS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>
        </label>
        {special && (
          <label className="flex items-center gap-1">
            患者
            <select disabled={locked} value={f.patientKind ?? ""} onChange={(e) => flag({ patientKind: (e.target.value || undefined) as PatientKind | undefined })} className="rounded border border-rule bg-sheet px-1">
              <option value="">未選択</option>
              {(["難病・てんかん", "妊娠中", "どちらでもない"] as const).map((k) => <option key={k}>{k}</option>)}
            </select>
          </label>
        )}
        {special && !LETTER_HOSPITAL.b011Standard && check("相手が B011 の施設基準を満たす", "partnerStandard")}
        {check("相手の求め・合意", "request")}
        {check("患者の同意", "consent")}
      </>
    );
  })();

  const doc = (print?: boolean) => <LetterDoc letter={cur} patient={patient} today={today} doctor={me.role === "医師" ? me.name : patient.attending} contact={contact} print={print} />;
  const when = (l: Letter) => { const at = l.confirmedAt ?? l.createdAt; return `${formatShort(addDays(today, at.day))} ${at.time}`; };

  return (
    <div className="space-y-3 text-[13px]">
      <div role="tablist" aria-label="紹介状の種類" className="flex flex-wrap gap-1">
        {LETTER_TYPES.map((k) => (
          <button key={k.type} type="button" role="tab" aria-selected={cur.type === k.type} disabled={confirmed && cur.type !== k.type} onClick={() => set({ type: k.type })} className={`rounded-md border px-3 py-1 text-xs ${cur.type === k.type ? "border-ink bg-ink font-bold text-white" : "border-rule text-ink-soft hover:text-ink disabled:opacity-40"}`}>
            {k.tab}
          </button>
        ))}
      </div>
      {!rights.draft && denyReason && <p className="text-xs text-ink-soft">{denyReason}</p>}

      {locked && confirmed ? (
        <div className="rounded-lg border border-rule bg-sheet p-5 shadow-sm">{doc()}</div>
      ) : (
        <section className="space-y-2 rounded-md border border-rule bg-paper p-3 text-xs text-ink-soft">
          <div className="grid grid-cols-[2fr_1fr_1fr] gap-2">
            <label>
              {kind.to}
              <input disabled={locked} value={cur.to} onChange={(e) => set({ to: e.target.value })} list="letter-facilities" className={field} />
              <datalist id="letter-facilities">{facilities.map((f) => <option key={f.id} value={f.name} />)}</datalist>
            </label>
            <label>
              {MEDICAL.includes(cur.type) ? "診療科" : "部署"}
              <input disabled={locked} value={cur.dept} onChange={(e) => set({ dept: e.target.value })} className={field} />
            </label>
            <label>
              {MEDICAL.includes(cur.type) ? "先生のお名前" : "ご担当者"}
              <input disabled={locked} value={cur.doctor} onChange={(e) => set({ doctor: e.target.value })} className={field} />
            </label>
          </div>
          <label className="block">
            {kind.purpose}
            <input disabled={locked} value={cur.purpose} onChange={(e) => set({ purpose: e.target.value })} className={field} />
          </label>
          {conditions && <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-ink">{conditions}</div>}
          <p data-letter-fee title={verdict.cite} className={`font-bold ${verdict.codes.length ? "text-wakatake" : "text-ink-soft"}`}>{verdictLine(verdict, false)}</p>
          {kind.fields.map(([k, label]) => (
            <label key={k} className="block">
              {label}
              <textarea disabled={locked} value={cur.body[k] ?? ""} onChange={(e) => set({ body: { ...cur.body, [k]: e.target.value } })} rows={Math.min(10, Math.max(k === "diagnosis" || k === "remarks" ? 2 : 3, (cur.body[k] ?? "").split("\n").length + 1))} className={field} />
            </label>
          ))}
        </section>
      )}

      {confirmed && (
        <p className="text-xs text-ink-soft">
          <span className="mr-2 rounded bg-wakatake-soft px-1.5 font-bold text-wakatake">確定 第{versionNo(cur)}版</span>
          {when(cur)} {cur.confirmedBy}
          {cur.revised && `　修正 ${formatShort(addDays(today, cur.revised.at.day))} ${cur.revised.at.time} ${cur.revised.by}（${cur.revised.reason}）`}
          {locked && <span title={verdict.cite} className="ml-2 font-bold">{verdictLine(verdict, true)}</span>}
        </p>
      )}
      {confirmed && !!cur.versions?.length && (
        <details className="text-xs">
          <summary className="cursor-pointer text-ink-soft">前の版（{cur.versions.length}）</summary>
          <ol className="mt-1 space-y-1 pl-4">
            {cur.versions.map((v, i) => (
              <li key={i}>
                第{i + 1}版 {formatShort(addDays(today, v.at.day))} {v.at.time} {v.by}{v.reason ? `（${v.reason}）` : ""}：{letterTitle(v)}　{v.purpose}
              </li>
            ))}
          </ol>
        </details>
      )}
      {editing && (
        <label className="block text-xs text-ink-soft">
          修正の理由
          <input value={reason} onChange={(e) => setReason(e.target.value)} className={field} />
        </label>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {locked && confirmed ? (
          rights.confirm && <button type="button" onClick={() => setEditing(true)} className="rounded border border-rule px-3 py-1 text-xs">修正する</button>
        ) : (
          <>
            <button type="button" disabled={!rights.draft || confirmed} onClick={() => save("下書き")} className="rounded border border-rule px-3 py-1 text-xs disabled:opacity-40">
              下書きを保存
            </button>
            <button type="button" disabled={!rights.confirm || !cur.to.trim() || (editing && !reason.trim())} onClick={() => save("確定")} className="rounded bg-wakatake px-3 py-1 text-xs font-bold text-white disabled:opacity-40">
              確定して保存
            </button>
            {editing && <button type="button" onClick={() => openLetter(saved ?? cur)} className="text-xs text-ink-soft underline">直すのをやめる</button>}
          </>
        )}
        <button type="button" onClick={print} className="ml-auto flex items-center gap-1 rounded border border-ai px-3 py-1 text-xs font-bold text-ai">
          <Printer size={13} />
          印刷
        </button>
      </div>

      <section aria-label="この患者の紹介状" className="border-t border-rule-soft pt-2">
        <div className="mb-1 flex items-center gap-2 text-xs">
          <b>この患者の紹介状</b>
          <span className="text-ink-faint">{letters.length}通</span>
          <button type="button" onClick={() => openLetter(fresh(firstType))} className="ml-auto flex items-center gap-0.5 rounded border border-rule px-2 py-0.5 hover:border-ai hover:text-ai">
            <Plus size={12} />
            新しく作る
          </button>
        </div>
        {letters.length > 0 && (
          <table className="nums w-full text-xs">
            <tbody>
              {letters.map((l) => (
                <tr key={l.id} className={`border-t border-rule-soft ${l.id === cur.id ? "bg-ai-soft/50" : ""}`}>
                  <td className="w-14 py-1">
                    <span className={`rounded px-1.5 font-bold ${l.status === "確定" ? "bg-wakatake-soft text-wakatake" : "bg-yamabuki-soft text-yamabuki"}`}>{l.status}</span>
                  </td>
                  <td className="py-1">
                    <button type="button" onClick={() => openLetter(l)} className="text-left hover:text-ai hover:underline">{letterTitle(l)}</button>
                  </td>
                  <td className="whitespace-nowrap py-1 text-right text-ink-soft">{when(l)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      {mounted && printing && createPortal(<div className="print-consent hidden print:block">{doc(true)}</div>, document.body)}
    </div>
  );
}
