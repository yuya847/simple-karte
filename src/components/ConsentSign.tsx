"use client";

import { X } from "lucide-react";
import { useState } from "react";
import { findConsent, signaturesMissing, type ConsentRecord, type ConsentSignature, type SignRole } from "@/lib/consent";
import { SignaturePad } from "./SignaturePad";

interface Props {
  record: ConsentRecord;
  patientName: string;
  doctor: string;
  nowTime: string;
  /** The printed form, shown for the patient to read before signing. */
  document: React.ReactNode;
  onDone: (r: ConsentRecord) => void;
  onClose: () => void;
}

/**
 * Signing on a tablet (iPad): the patient reads the form, chooses 同意する／同意しない, and signs with a
 * finger or Apple Pencil; then the doctor (and a witness, if present) signs. Big touch targets.
 */
export function ConsentSign({ record, patientName, doctor, nowTime, document, onDone, onClose }: Props) {
  const t = findConsent(record.code);
  const [choice, setChoice] = useState<ConsentRecord["choice"]>(undefined);
  const [byProxy, setByProxy] = useState(!!record.proxy);
  const [proxyName, setProxyName] = useState(record.proxy?.name ?? "");
  const [proxyRel, setProxyRel] = useState(record.proxy?.relation ?? "");
  const [witness, setWitness] = useState(record.witness ?? "");
  const [sigs, setSigs] = useState<Partial<Record<SignRole, string>>>({});
  const unanswered = (t.questions ?? []).filter((q) => !record.answers[q.id]);
  const list: ConsentSignature[] = (Object.entries(sigs) as [SignRole, string][]).map(([role, dataUrl]) => ({
    role,
    dataUrl,
    name: role === "本人" ? patientName : role === "代諾者" ? `${proxyName}（${proxyRel}）` : role === "説明した医師" ? doctor : witness,
    at: { day: 0, time: nowTime },
  }));
  const missing = signaturesMissing(list, byProxy);
  const ready = choice && missing.length === 0 && (!byProxy || (proxyName.trim() && proxyRel.trim())) && unanswered.length === 0 && (!sigs["同席者"] || witness.trim());
  const set = (role: SignRole) => (url: string | null) => setSigs((s) => ({ ...s, [role]: url ?? undefined }));
  const big = "rounded-xl border-2 px-6 py-4 text-lg font-bold";
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-paper print:hidden" role="dialog" aria-label="同意書の署名">
      <header className="flex items-center gap-3 border-b border-rule bg-sheet px-5 py-3">
        <b className="text-lg">{t.title}</b>
        <span className="text-ink-soft">{patientName} 様</span>
        <button type="button" onClick={onClose} className="ml-auto flex items-center gap-1 rounded-lg border border-rule px-4 py-2" aria-label="閉じる">
          <X size={18} />
          閉じる
        </button>
      </header>
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-8">
        <div className="mx-auto max-w-3xl space-y-6">
          <div className="text-[15px] leading-relaxed">{document}</div>

          {unanswered.length > 0 && <p className="rounded-lg bg-yamabuki-soft p-3 font-bold text-yamabuki">先に問診（{unanswered.length}項目）に答えてください。閉じて、同意書の画面で入れられます。</p>}

          <section className="space-y-3 rounded-xl border border-rule bg-sheet p-4">
            <h3 className="text-lg font-bold">説明を受けて、内容を理解しました。</h3>
            <div className="grid grid-cols-2 gap-3">
              {(["同意する", "同意しない"] as const).map((c) => (
                <button key={c} type="button" onClick={() => setChoice(c)} aria-pressed={choice === c} className={`${big} ${choice === c ? (c === "同意する" ? "border-wakatake bg-wakatake text-white" : "border-shu bg-shu text-white") : "border-rule bg-paper"}`}>
                  {c === "同意する" ? "同意します" : "同意しません"}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-2 text-[15px]">
              <input type="checkbox" checked={byProxy} onChange={(e) => setByProxy(e.target.checked)} className="size-5 accent-ai" />
              本人が署名できないため、代諾者が署名する
            </label>
            {byProxy && (
              <div className="flex flex-wrap gap-3 text-[15px]">
                <label>
                  代諾者の氏名
                  <input value={proxyName} onChange={(e) => setProxyName(e.target.value)} className="ml-2 w-48 rounded-lg border border-rule bg-paper px-3 py-2" />
                </label>
                <label>
                  続柄
                  <input value={proxyRel} onChange={(e) => setProxyRel(e.target.value)} className="ml-2 w-24 rounded-lg border border-rule bg-paper px-3 py-2" />
                </label>
              </div>
            )}
            {byProxy ? <SignaturePad key="proxy" label="代諾者の署名" onChange={set("代諾者")} /> : <SignaturePad key="self" label={`ご本人の署名（${patientName}）`} onChange={set("本人")} />}
          </section>

          <section className="space-y-3 rounded-xl border border-rule bg-sheet p-4">
            <h3 className="text-lg font-bold">病院の署名</h3>
            <SignaturePad label={`説明した医師（${doctor}）`} onChange={set("説明した医師")} height={120} />
            <label className="block text-[15px]">
              同席者（いれば）
              <input value={witness} onChange={(e) => setWitness(e.target.value)} placeholder="看護師 ○○" className="ml-2 w-48 rounded-lg border border-rule bg-paper px-3 py-2" />
            </label>
            {witness.trim() && <SignaturePad label={`同席者（${witness.trim()}）`} onChange={set("同席者")} height={120} />}
          </section>
        </div>
      </div>
      <footer className="flex items-center gap-3 border-t border-rule bg-sheet px-5 py-3">
        <span className="text-sm text-ink-soft">
          {!choice ? "「同意します／同意しません」を選んでください" : missing.length ? `署名がまだ：${missing.join("・")}` : byProxy && !(proxyName.trim() && proxyRel.trim()) ? "代諾者の氏名と続柄を入れてください" : "記録できます"}
        </span>
        <button
          type="button"
          disabled={!ready}
          onClick={() =>
            onDone({
              ...record,
              choice,
              status: choice === "同意する" ? "同意" : "拒否",
              signatures: list,
              explainedAt: { day: 0, time: nowTime },
              explainedBy: doctor,
              witness: witness.trim() || undefined,
              proxy: byProxy ? { name: proxyName.trim(), relation: proxyRel.trim() } : record.proxy,
              closedAt: choice === "同意しない" ? { day: 0, time: nowTime } : record.closedAt,
            })
          }
          className="ml-auto rounded-xl bg-ai px-8 py-3 text-lg font-bold text-white disabled:opacity-40"
        >
          署名を記録する
        </button>
      </footer>
    </div>
  );
}
