"use client";

// 電子処方箋（模擬）: the confirmed prescription as an HS036 FHIR Bundle, the SIMULATED 重複投薬等チェック against
// other institutions (FICTIONAL), the 模擬の署名 and the 登録 that gives a 引換番号. The doctor reads each finding
// and decides; nothing is changed or blocked silently. Nothing is sent anywhere.

import { FileSignature, Pill, ShieldAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { auditLog } from "@/lib/audit";
import type { Insurance } from "@/lib/billing/insurance";
import { isoDate, type CalendarDate } from "@/lib/dates";
import { nationalServices } from "@/lib/national/adapter";
import { buildErxBundle, ERX_SPECS, ERX_UNFILLED, mockSign, type ErxPatient, type ErxReceipt, type ErxSignature } from "@/lib/national/erx";
import { ERX_CHECK_SOURCES, type ErxFinding } from "@/lib/national/erx-check";
import { jstDateTime } from "@/lib/national/fictional";
import type { NationalRecord } from "@/lib/national/log";
import type { RxLine } from "@/lib/national/rx-lines";
import { findOralDrug } from "@/lib/master";
import { timingName } from "@/lib/rx";
import { DenyNote, useDeny, useMe } from "../RoleContext";
import { JsonView, MockMark, MockNote, SpecBox } from "./SpecParts";

const lineLabel = (l: RxLine) => `Rp${l.rp} ${findOralDrug(l.drug)?.name ?? l.drug}${findOralDrug(l.drug)?.strength ?? ""} 1回${l.perDose ?? "？"}${l.unit} ${l.timings.length ? `1日${l.timings.length}回 ${timingName(l.timings)}` : `頓用 ${l.prn ?? ""}`} ${l.days ?? "？"}${l.timings.length ? "日分" : "回分"}`;

export function ErxPanel({
  patient,
  patientKey,
  department,
  insurance,
  insuranceAssumed,
  lines,
  today,
  nowTime,
  mode,
  serial,
  done,
  onRegistered,
}: {
  patient: ErxPatient;
  patientKey: string;
  department: string;
  insurance: Insurance;
  insuranceAssumed: boolean;
  lines: RxLine[];
  today: CalendarDate;
  nowTime: string;
  /** 外来処方 (always 院外) or 退院時処方 (the doctor chooses 院内 or 院外). */
  mode: "外来" | "退院時";
  serial: number;
  /** What was already registered for this patient. */
  done: NationalRecord[];
  onRegistered: (r: NationalRecord) => void;
}) {
  const me = useMe();
  const locked = useDeny()("erx");
  const [kind, setKind] = useState<"院外" | "院内" | "">(mode === "外来" ? "院外" : "");
  const [consent, setConsent] = useState(false);
  const [findings, setFindings] = useState<ErxFinding[] | null>(null);
  const [acked, setAcked] = useState<Record<number, boolean>>({});
  const [signed, setSigned] = useState<{ bundle: Record<string, unknown>; signature: ErxSignature } | null>(null);
  const [receipt, setReceipt] = useState<ErxReceipt | null>(null);
  const [busy, setBusy] = useState(false);
  // The 処方箋番号 is fixed when the panel opens (it does not move on after this one is registered).
  const [no] = useState(serial);

  const build = useMemo(
    () => (kind ? buildErxBundle({ patient, department, doctor: me.name, insurance, insuranceAssumed, lines, today, time: nowTime, serial: no, kind }) : null),
    [kind, patient, department, me.name, insurance, insuranceAssumed, lines, today, nowTime, no],
  );
  const reset = () => {
    setFindings(null);
    setAcked({});
    setSigned(null);
    setReceipt(null);
  };
  const allAcked = !!findings && findings.every((_, i) => acked[i]);
  const canSign = !!build && !build.problems.length && kind === "院外" && allAcked && !signed && !locked;
  const canRegister = !!build && !build.problems.length && allAcked && !receipt && !locked && (kind === "院内" || !!signed);

  const check = async () => {
    if (!build || locked) return;
    setBusy(true);
    const f = await nationalServices.checkPrescription({ patientKey, drugs: lines.map((l) => l.drug), consent, today, time: nowTime });
    setBusy(false);
    setFindings(f);
    setAcked({});
    auditLog({ role: me.role, actor: me.name, action: "重複投薬等チェック（模擬）", patient: patient.name, detail: f.length ? f.map((x) => `${x.kind}：${x.drugName}`).join("／") : "該当なし" });
  };
  const sign = async () => {
    if (!build || !canSign) return;
    const s = await mockSign(build, jstDateTime(isoDate(today), `${nowTime}:00.000`));
    setSigned(s);
    auditLog({ role: me.role, actor: me.name, action: "電子処方箋に署名（模擬）", patient: patient.name, detail: build.prescriptionNo });
  };
  const register = async () => {
    if (!build || !canRegister || !kind) return;
    setBusy(true);
    const r = await nationalServices.registerPrescription({ patientKey, bundle: signed?.bundle ?? build.bundle, signature: signed?.signature ?? null, kind, today, time: nowTime });
    setBusy(false);
    setReceipt(r);
    auditLog({ role: me.role, actor: me.name, action: `${kind === "院外" ? "電子処方箋" : "院内処方の情報"}を登録（模擬）`, patient: patient.name, detail: `${build.prescriptionNo}${r.exchangeNo ? `　引換番号 ${r.exchangeNo}` : ""}${findings?.length ? `　確かめた所見：${findings.map((x) => `${x.kind} ${x.drugName}`).join("／")}` : ""}` });
    onRegistered({ kind: "電子処方箋", patientKey, prescriptionNo: build.prescriptionNo, receipt: r, lines: lines.map(lineLabel), by: me.name, at: nowTime });
  };

  return (
    <section aria-label="電子処方箋（模擬）" className="space-y-2 rounded-lg border border-dashed border-shu/40 bg-sheet p-3 text-[12px]">
      <h3 className="flex flex-wrap items-center gap-1 text-sm font-bold">
        <Pill size={15} />
        電子処方箋
        <MockMark />
        <span className="text-[11px] font-normal text-ink-faint">（{mode === "外来" ? "外来処方" : "退院時処方"}）</span>
      </h3>
      <MockNote>
        電子処方箋管理サービスにはつないでいません。処方の中身を、公開されている厚生労働省標準規格 HS036「処方情報 HL7 FHIR 記述仕様」の FHIR で示します（HS036 は電子処方箋のファイルそのものではなく、本物の登録は記録条件仕様の CSV を XML に入れて送ります）。チェックの相手・引換番号はすべて架空です。
      </MockNote>
      {done.filter((r) => r.kind === "電子処方箋").length > 0 && (
        <ul className="space-y-0.5 rounded border border-rule bg-paper p-1.5 text-[11px]">
          {done.map((r) =>
            r.kind === "電子処方箋" ? (
              <li key={r.prescriptionNo} className="nums">
                登録済み（模擬）{r.at} {r.receipt.kind}　{r.prescriptionNo}
                {r.receipt.exchangeNo && <b className="ml-1">引換番号 {r.receipt.exchangeNo}</b>}　{r.by}
              </li>
            ) : null,
          )}
        </ul>
      )}
      {lines.length === 0 ? (
        <p className="text-ink-faint">{mode === "外来" ? "確定した外来処方がありません。上の「処方を書く」で書いて確定すると、ここで電子処方箋にできます。" : "有効な退院時処方がありません。内服を「退院時」の区分で書くと、ここで扱えます。"}</p>
      ) : (
        <>
          <ul className="nums space-y-0.5">
            {lines.map((l, i) => (
              <li key={i}>{lineLabel(l)}</li>
            ))}
          </ul>
          {mode === "退院時" && (
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-ink-soft">出し方</span>
              {(
                [
                  ["院内", "院内処方（薬剤部が調剤し、患者が持ち帰る）：院内処方の情報として登録。署名・引換番号はない"],
                  ["院外", "院外処方箋（電子処方箋）：署名して登録し、引換番号を渡す"],
                ] as const
              ).map(([k, label]) => (
                <label key={k} className="flex items-center gap-1">
                  <input type="radio" name={`erx-kind-${patientKey}`} checked={kind === k} disabled={!!locked || !!receipt} onChange={() => (setKind(k), reset())} />
                  {label}
                </label>
              ))}
            </div>
          )}
          {insuranceAssumed && <p className="text-yamabuki">保険が登録されていません：年齢からの仮の保険で作ります（医事課の「保険の登録」が要ります）。</p>}
          {build && (
            <>
              {build.problems.length > 0 && (
                <ul className="text-shu">
                  {build.problems.map((p) => (
                    <li key={p}>直す：{p}</li>
                  ))}
                </ul>
              )}
              <JsonView value={signed?.bundle ?? build.bundle} name={`${build.prescriptionNo}.json`} label={`処方情報の FHIR（HS036・処方箋番号 ${build.prescriptionNo}）`} />

              <div className="space-y-1 rounded border border-rule bg-paper p-2">
                <div className="flex flex-wrap items-center gap-2 font-bold">
                  <ShieldAlert size={13} />
                  重複投薬等チェック
                  <MockMark />
                </div>
                <label className="flex items-center gap-1">
                  <input type="checkbox" checked={consent} disabled={!!locked || !!receipt} onChange={(e) => (setConsent(e.target.checked), setFindings(null), setAcked({}))} />
                  患者が薬剤情報の閲覧に同意している（マイナ保険証の同意か、口頭の同意）
                </label>
                <button type="button" onClick={check} disabled={!!locked || busy || !!receipt || build.problems.length > 0} className="rounded-md border border-ai px-2.5 py-1 font-bold text-ai hover:bg-ai-soft disabled:opacity-40">
                  重複投薬等チェック（模擬）
                </button>
                {findings && findings.length === 0 && <p className="text-wakatake">重複投薬・併用禁忌はありません（架空のほかの医療機関・薬局の記録と照らした結果）。</p>}
                {findings && findings.length > 0 && (
                  <ul className="space-y-1">
                    {findings.map((f, i) => (
                      <li key={i} className={`rounded border px-2 py-1 ${f.kind === "併用禁忌" ? "border-shu/40 bg-shu-soft" : "border-yamabuki/40 bg-yamabuki-soft"}`}>
                        <div>
                          <b className={f.kind === "併用禁忌" ? "text-shu" : "text-yamabuki"}>{f.kind}</b> {f.drugName}
                          {f.other && (
                            <span className="text-ink-soft">
                              {" "}
                              × {f.other.drugName}（{f.other.institution}・{f.other.pharmacy}、{f.other.issued}、{f.other.via}）
                            </span>
                          )}
                        </div>
                        <div>{f.text}</div>
                        {f.sources.map((s) => (
                          <div key={s.label} className="text-[10px] text-ink-faint">
                            根拠：{s.label}{" "}
                            <a href={s.url} target="_blank" rel="noreferrer" className="break-all text-ai underline">
                              {s.url}
                            </a>
                          </div>
                        ))}
                        <label className="mt-0.5 flex items-center gap-1">
                          <input type="checkbox" checked={!!acked[i]} disabled={!!locked || !!receipt} onChange={(e) => setAcked((a) => ({ ...a, [i]: e.target.checked }))} />
                          確かめた（このまま出すと医師が決めた。直すときは処方を書き直す）
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {kind === "院外" && (
                <div className="space-y-1 rounded border border-rule bg-paper p-2">
                  <div className="flex flex-wrap items-center gap-2 font-bold">
                    <FileSignature size={13} />
                    電子署名
                    <MockMark />
                  </div>
                  <p className="text-[11px] text-ink-soft">本物の電子処方箋は、医師が HPKI カード（ローカル署名）か HPKI セカンド電子証明書（リモート署名）で署名し、サービスがタイムスタンプを付けます。ここでは Bundle のハッシュ値（SHA-256）を入れるだけで、署名にはなりません。</p>
                  <button type="button" onClick={sign} disabled={!canSign} className="rounded-md border border-ai px-2.5 py-1 font-bold text-ai hover:bg-ai-soft disabled:opacity-40">
                    署名する（模擬）
                  </button>
                  {signed && <p className="nums break-all text-[10px] text-ink-faint">Bundle.signature.data（模擬のハッシュ値）：{signed.signature.data}</p>}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={register} disabled={!canRegister || busy} className="rounded-md bg-ai px-3 py-1.5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40">
                  {kind === "院内" ? "院内処方の情報を登録（模擬）" : "電子処方箋を登録（模擬）"}
                </button>
                {!findings && <span className="text-[11px] text-ink-faint">先に重複投薬等チェックをします。</span>}
                {findings && !allAcked && <span className="text-[11px] text-yamabuki">所見をすべて確かめると登録できます。</span>}
              </div>
              {receipt && (
                <div className="nums rounded border border-wakatake/40 bg-wakatake-soft p-2">
                  <p className="font-bold text-wakatake">登録しました（模擬）{receipt.registeredAt}</p>
                  <p>処方箋ID（架空）：{receipt.prescriptionId}</p>
                  {receipt.exchangeNo ? (
                    <p>
                      引換番号（架空・6桁）：<b className="text-base">{receipt.exchangeNo}</b>　患者に控えを渡し、薬局で被保険者の記号・番号などとあわせて示してもらいます。
                    </p>
                  ) : (
                    <p>院内処方の情報は処方箋ではないので、署名と引換番号はありません。ほかの医療機関・薬局の重複投薬等チェックの対象になります。</p>
                  )}
                </div>
              )}
              <SpecBox specs={[...ERX_SPECS, ...ERX_CHECK_SOURCES]} unfilled={[...build.unfilled, ...ERX_UNFILLED]} />
            </>
          )}
          <DenyNote action="erx" />
        </>
      )}
    </section>
  );
}
