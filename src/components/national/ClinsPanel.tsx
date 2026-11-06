"use client";

// 電子カルテ情報共有サービス（模擬）: what would be sent — the 退院時サマリー and 診療情報提供書 as JP-CLINS documents,
// and the 臨床情報 (傷病名・アレルギー・検査) — shown as FHIR; the send and the receipt are SIMULATED. The doctor
// chooses which allergies to send and how each is classed (nothing is chosen in advance), and confirms the
// patient's consent. The other tab shows other hospitals' 6情報 (FICTIONAL) once the patient has agreed.

import { displayText } from "@/lib/display-text";
import { Building2, Send } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { auditLog } from "@/lib/audit";
import type { Insurance } from "@/lib/billing/insurance";
import type { CalendarDate } from "@/lib/dates";
import type { Diagnosis } from "@/lib/diagnoses";
import type { DischargeDraft } from "@/lib/discharge";
import { nationalServices } from "@/lib/national/adapter";
import { allergyResource, buildDocuments, CLINS_SPECS, CLINS_UNFILLED, clinsBundle, conditionResource, labResources, type AllergyChoice, type ClinsContext, type ClinsReceipt, type DiseaseKeys, type OtherHospitalInfo } from "@/lib/national/clins";
import { jstDateTime } from "@/lib/national/fictional";
import type { NationalRecord } from "@/lib/national/log";
import { linesFromHomeRx } from "@/lib/national/rx-lines";
import { isoDate } from "@/lib/dates";
import type { OrderEntry, Patient } from "@/lib/types";
import { SubTabs } from "../DeskParts";
import { DenyNote, useDeny, useMe } from "../RoleContext";
import { JsonView, MockMark, MockNote, SpecBox } from "./SpecParts";

type Kind = ClinsReceipt["kind"];

export function ClinsPanel({
  patient,
  birthDate,
  insurance,
  insuranceAssumed,
  diagnoses,
  draft,
  entries,
  today,
  nowTime,
  done,
  onSent,
}: {
  patient: Patient;
  birthDate: string;
  insurance: Insurance;
  insuranceAssumed: boolean;
  diagnoses: Diagnosis[];
  draft?: DischargeDraft;
  entries: OrderEntry[];
  today: CalendarDate;
  nowTime: string;
  done: NationalRecord[];
  onSent: (r: NationalRecord) => void;
}) {
  const me = useMe();
  const locked = useDeny()("clins");
  const [tab, setTab] = useState<"send" | "view">("send");
  const [keys, setKeys] = useState<DiseaseKeys>({});
  const [keysNote, setKeysNote] = useState("");
  const [consent, setConsent] = useState(false);
  const [viewConsent, setViewConsent] = useState(false);
  const [other, setOther] = useState<OtherHospitalInfo | null>(null);
  const [allergies, setAllergies] = useState<AllergyChoice[]>(() => [
    ...patient.allergies.map((text) => ({ text, from: "アレルギー" as const, send: false, category: "" as const })),
    ...(patient.contraindications ?? []).map((text) => ({ text, from: "禁忌" as const, send: false, category: "" as const })),
  ]);
  const [receipts, setReceipts] = useState<Partial<Record<string, ClinsReceipt>>>({});

  // 病名管理番号: asked of the server, where the official 傷病名マスター is.
  const codes = diagnoses.map((d) => d.code).join(",");
  useEffect(() => {
    if (!codes) return;
    let live = true;
    fetch(`/api/byomei?keys=${codes}`)
      .then((r) => r.json())
      .then((j: { keys: DiseaseKeys }) => live && setKeys(j.keys))
      .catch(() => live && setKeysNote("傷病名マスターに問い合わせられなかったので、病名管理番号は「99999999」（コード化できない）のままです。"));
    return () => {
      live = false;
    };
  }, [codes]);

  const ctx: ClinsContext = { patient, birthDate, insurance, insuranceAssumed, diagnoses, diseaseKeys: keys, doctor: me.name, today, time: nowTime };
  const at = jstDateTime(isoDate(today), nowTime);
  const lines = useMemo(() => linesFromHomeRx(entries), [entries]);
  const docs = draft ? buildDocuments(ctx, { draft, admittedOn: patient.admittedOn, lines, allergies }) : null;
  const chosen = allergies.filter((a) => a.send && a.category);
  const undecided = allergies.filter((a) => a.send && !a.category);
  const items: { key: string; kind: Kind; what: string; bundle: Record<string, unknown> | null; why?: string }[] = [
    { key: "summary", kind: "退院時サマリー", what: "退院時サマリー（HS039）", bundle: draft?.status === "確定" ? (docs?.summary ?? null) : null, why: draft ? (draft.status === "確定" ? undefined : "退院時サマリーがまだ確定していません。") : "退院時サマリーがまだありません（右のツール「退院サマリ」）。" },
    { key: "referral", kind: "診療情報提供書", what: "診療情報提供書（HS038。退院時サマリーを同じ文書IDで添付）", bundle: docs?.referral ?? null, why: docs?.referral ? undefined : "診療情報提供書（紹介状）がまだ発行されていません。" },
    { key: "cond", kind: "6情報", what: `臨床情報：傷病名（${diagnoses.length}件）`, bundle: diagnoses.length ? clinsBundle(ctx, "Condition", diagnoses.map((d) => conditionResource(ctx, d, at))) : null, why: diagnoses.length ? undefined : "病名がありません。" },
    { key: "alg", kind: "6情報", what: `臨床情報：アレルギー（${chosen.length}件）`, bundle: chosen.length ? clinsBundle(ctx, "AllergyIntolerance", chosen.map((a, i) => allergyResource(ctx, a, i, at))) : null, why: chosen.length ? undefined : allergies.length ? "送るアレルギーを下で選んでください（区分も）。" : "アレルギー・禁忌の登録がありません。" },
    { key: "lab", kind: "6情報", what: `臨床情報：検査（${patient.labs.length}回分）`, bundle: patient.labs.length ? clinsBundle(ctx, "Observation", labResources(ctx, at)) : null, why: patient.labs.length ? undefined : "検体検査の結果がありません。" },
  ];
  const ready = consent && !locked;

  const send = async (it: (typeof items)[number]) => {
    if (!it.bundle || !ready) return;
    const r = await nationalServices.sendClinical({ patientKey: patient.id, kind: it.kind, bundle: it.bundle, today, time: nowTime });
    setReceipts((x) => ({ ...x, [it.key]: r }));
    auditLog({ role: me.role, actor: me.name, action: "電子カルテ情報共有サービスへ送信（模擬）", patient: patient.name, detail: `${it.what}　受付番号 ${r.receiptNo}` });
    onSent({ kind: "電子カルテ情報共有", patientKey: patient.id, receipt: r, what: it.what, by: me.name, at: nowTime });
  };
  const view = async () => {
    if (locked) return;
    const r = await nationalServices.otherHospitalInfo({ patientKey: patient.id, consent: viewConsent, today, time: nowTime });
    setOther(r);
    auditLog({ role: me.role, actor: me.name, action: "他院の6情報を閲覧（模擬）", patient: patient.name, detail: `${r.items.length}件` });
  };

  return (
    <section aria-label="電子カルテ情報共有サービス（模擬）" className="space-y-2 text-[12px]">
      <h3 className="flex flex-wrap items-center gap-1 text-sm font-bold">
        <Building2 size={15} />
        電子カルテ情報共有サービス
        <MockMark />
      </h3>
      <MockNote>電子カルテ情報共有サービスにはつないでいません。送るものを JP-CLINS 実装ガイド v1.13.0 の FHIR で示します。送信と受付は模擬です。</MockNote>
      <SubTabs
        label="電子カルテ情報共有サービス"
        tabs={[
          { key: "send", label: "3文書6情報を送る", icon: Send },
          { key: "view", label: "他院の6情報を見る", icon: Building2 },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === "send" ? (
        <div className="space-y-2">
          {insuranceAssumed && <p className="text-yamabuki">保険が登録されていません：被保険者個人識別子は年齢からの仮の保険で作ります（医事課の「保険の登録」が要ります）。</p>}
          {keysNote && <p className="text-yamabuki">{keysNote}</p>}
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={consent} disabled={!!locked} onChange={(e) => setConsent(e.target.checked)} />
            文書と臨床情報を送ることを患者に説明し、口頭で同意を得た
          </label>
          {allergies.length > 0 && (
            <div className="rounded border border-rule bg-paper p-2">
              <p className="mb-1 text-ink-soft">アレルギー・禁忌のうち送るもの（サービスに送るのは重篤なもの。区分は医師が選ぶ）</p>
              <table className="w-full text-[11px]">
                <tbody>
                  {allergies.map((a, i) => (
                    <tr key={a.from + a.text} className="border-t border-rule-soft">
                      <td className="py-0.5 pr-2">
                        <label className="flex items-center gap-1">
                          <input type="checkbox" checked={a.send} disabled={!!locked} onChange={(e) => setAllergies((l) => l.map((x, j) => (j === i ? { ...x, send: e.target.checked } : x)))} />
                          {displayText(a.text)}
                          <span className="text-ink-faint">（{displayText(a.from)}）</span>
                        </label>
                      </td>
                      <td>
                        <select value={a.category} disabled={!!locked || !a.send} onChange={(e) => setAllergies((l) => l.map((x, j) => (j === i ? { ...x, category: e.target.value as AllergyChoice["category"] } : x)))} className="rounded border border-rule bg-sheet px-1">
                          <option value="">区分を選ぶ</option>
                          <option value="medication">薬剤アレルギー等</option>
                          <option value="food">その他アレルギー等（食物）</option>
                          <option value="environment">その他アレルギー等（医薬品・食物以外）</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {undecided.length > 0 && <p className="text-yamabuki">区分を選ぶと送れます：{displayText(undecided.map((a) => a.text).join("、"))}</p>}
            </div>
          )}
          <ul className="space-y-1.5">
            {items.map((it) => {
              const r = receipts[it.key];
              return (
                <li key={it.key} className="space-y-1 rounded border border-rule bg-paper p-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <b>{it.what}</b>
                    {it.bundle ? (
                      <button type="button" onClick={() => send(it)} disabled={!ready || !!r} className="ml-auto rounded-md bg-ai px-2.5 py-0.5 font-bold text-white disabled:cursor-not-allowed disabled:opacity-40">
                        {r ? "送信済み（模擬）" : "送る（模擬）"}
                      </button>
                    ) : (
                      <span className="ml-auto text-ink-faint">{it.why}</span>
                    )}
                  </div>
                  {it.bundle && <JsonView value={it.bundle} name={`${patient.id}-${it.key}.json`} label="送る FHIR（JSON）" />}
                  {r && (
                    <p className="nums text-wakatake">
                      受付番号{r.receiptNo}　{r.receivedAt}　{r.result}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
          {done.filter((d) => d.kind === "電子カルテ情報共有").length > 0 && (
            <p className="nums text-[11px] text-ink-faint">
              これまでに送ったもの（模擬）：
              {done.map((d) => (d.kind === "電子カルテ情報共有" ? `${d.at} ${d.what}（${d.receipt.receiptNo}）` : "")).filter(Boolean).join("、")}
            </p>
          )}
          <p className="text-[11px] text-ink-soft">健康診断結果報告書（3文書の1つ）は、この試作に健診の記録がないので作りません。処方は技術解説書 v2.1.0 で臨床情報から外れたため、文書の中（退院時投薬指示・投薬指示）にだけ入れます。</p>
        </div>
      ) : (
        <div className="space-y-2">
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={viewConsent} disabled={!!locked} onChange={(e) => (setViewConsent(e.target.checked), setOther(null))} />
            患者が顔認証付きカードリーダーなどで、ほかの医療機関の情報の閲覧に同意した（同意から24時間）
          </label>
          <button type="button" onClick={view} disabled={!!locked} className="rounded-md border border-ai px-2.5 py-1 font-bold text-ai hover:bg-ai-soft disabled:opacity-40">
            他院の6情報を見る（模擬）
          </button>
          {other && !other.consented && <p className="text-yamabuki">同意がないので見られません。</p>}
          {other?.consented &&
            (other.items.length === 0 ? (
              <p className="text-ink-faint">ほかの医療機関が登録した情報はありません。</p>
            ) : (
              <table className="nums w-full text-[11px]">
                <thead className="text-left text-ink-faint">
                  <tr>
                    <th>種類</th>
                    <th>内容</th>
                    <th>登録した医療機関</th>
                    <th>日付</th>
                  </tr>
                </thead>
                <tbody>
                  {other.items.map((x, i) => (
                    <tr key={i} className="border-t border-rule-soft">
                      <td className="pr-2">{x.kind}</td>
                      <td className="pr-2">{displayText(x.text)}</td>
                      <td className="pr-2">{displayText(x.from)}</td>
                      <td>{x.date}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ))}
          <p className="text-[11px] text-ink-faint">本物では、患者の同意のあと資格確認の結果とともに取得できるようになり、傷病名・アレルギー・感染症は5年、検査は1年または直近3回分が保存されます（技術解説書 v2.1.0）。</p>
        </div>
      )}
      <DenyNote action="clins" />
      <SpecBox specs={CLINS_SPECS} unfilled={CLINS_UNFILLED} />
    </section>
  );
}
