"use client";

import { Plus, Send, X } from "lucide-react";
import { useState } from "react";
import { anyDrugName } from "@/lib/master";
import { egfr, latestCre } from "@/lib/exams";
import { VCM_NOTES, VCM_TARGET, predict, regimenFromOrder, sawchukZaske, type Levels, type Regimen, type TdmReport } from "@/lib/tdm";
import type { InjectionOrder } from "@/lib/types";
import type { WorkPatient } from "@/lib/worksheet";
import { ageSex } from "@/lib/person";

interface Props {
  people: WorkPatient[];
  nowTime: string;
  reports: TdmReport[];
  onReport: (r: Omit<TdmReport, "id" | "at" | "by" | "status">) => void;
}

const n = (s: string) => (s.trim() === "" ? NaN : Number(s));
const f1 = (x: number, d = 1) => (Number.isFinite(x) ? x.toFixed(d) : "—");

/** The pharmacist's TDM screen (vancomycin): levels → k, Vd, CL, AUC24 by code; candidate regimens; report. */
export function TdmView({ people, nowTime, reports, onReport }: Props) {
  const withVcm = people.filter((x) => x.entries.some((e) => e.status === "有効" && e.order.type === "injection" && (e.order as InjectionOrder).items.some((i) => i.drugCode.startsWith("INJ-VCM"))));
  const [pid, setPid] = useState(withVcm[0]?.patient.id ?? people[0]?.patient.id ?? "");
  const person = people.find((x) => x.patient.id === pid);
  const order = person?.entries.find((e) => e.status === "有効" && e.order.type === "injection" && (e.order as InjectionOrder).items.some((i) => i.drugCode.startsWith("INJ-VCM")));
  const fromOrder = order ? regimenFromOrder(order.order as InjectionOrder) : {};
  const [reg, setReg] = useState({ dose: String(fromOrder.dose ?? ""), tau: String(fromOrder.tau ?? ""), tinf: String(fromOrder.tinf ?? "") });
  const [lv, setLv] = useState({ pt: "", pc: "", tb: "0", tc: "" });
  const [cands, setCands] = useState<{ dose: string; tau: string; tinf: string }[]>([]);
  const [proposal, setProposal] = useState("");
  const regimen: Regimen = { dose: n(reg.dose), tau: n(reg.tau), tinf: n(reg.tinf) };
  const levels: Levels = { peak: { t: n(lv.pt), c: n(lv.pc) }, trough: { before: n(lv.tb), c: n(lv.tc) } };
  const filled = Object.values(lv).every((x) => x.trim() !== "") && Object.values(reg).every((x) => x.trim() !== "");
  const res = filled ? sawchukZaske(regimen, levels) : null;
  const ok = res && !("error" in res) ? res : null;
  const w = person?.patient.weightKg;
  const input = "w-16 rounded border border-rule bg-sheet px-1 py-0.5 text-right";
  const choose = (id: string) => {
    setPid(id);
    const p = people.find((x) => x.patient.id === id);
    const o = p?.entries.find((e) => e.status === "有効" && e.order.type === "injection" && (e.order as InjectionOrder).items.some((i) => i.drugCode.startsWith("INJ-VCM")));
    const r = o ? regimenFromOrder(o.order as InjectionOrder) : {};
    setReg({ dose: String(r.dose ?? ""), tau: String(r.tau ?? ""), tinf: String(r.tinf ?? "") });
    setLv({ pt: "", pc: "", tb: "0", tc: "" });
    setCands([]);
  };
  return (
    <div className="space-y-4 text-[13px]">
      <div className="flex flex-wrap items-center gap-2">
        <label>
          患者{" "}
          <select value={pid} onChange={(e) => choose(e.target.value)} className="rounded border border-rule bg-sheet px-1 py-0.5">
            {people.map((x) => (
              <option key={x.patient.id} value={x.patient.id}>
                {x.room} {x.patient.name}
                {withVcm.includes(x) ? "（バンコマイシン投与中）" : ""}
              </option>
            ))}
          </select>
        </label>
        <span className="text-ink-soft">薬：バンコマイシン（ほかの薬は今後）</span>
        {person && (
          <span className="text-ink-soft">
            体重 {person.patient.weightKg}kg・{ageSex(person.patient)}
            {(() => {
              const c = latestCre(person.patient);
              if (!c) return null;
              const g = egfr(c.value, person.patient.age, person.patient.sex);
              return <span className={g < 30 ? "font-bold text-shu" : ""}>・Cre {c.value}（eGFR {g}）</span>;
            })()}
          </span>
        )}
      </div>
      {order ? (
        <p className="text-xs text-ink-soft">
          有効なオーダ：{(order.order as InjectionOrder).items.map((i) => `${anyDrugName(i.drugCode)} ${i.amount}${i.unit}`).join(" ＋ ")}（投与量・間隔・点滴時間をオーダから入れました。違えば直してください）
        </p>
      ) : (
        <p className="text-xs text-ink-faint">この患者にバンコマイシンの有効なオーダはありません。投与の内容を入れて計算できます。</p>
      )}

      <section className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1.5 rounded-md border border-rule bg-paper p-3">
          <h3 className="font-bold">投与（定常状態のもの）</h3>
          <label className="block">
            1回 <input value={reg.dose} onChange={(e) => setReg({ ...reg, dose: e.target.value })} className={input} /> mg
            {w && Number.isFinite(regimen.dose) && <span className="ml-1 text-ink-faint">（{f1(regimen.dose / w)} mg/kg）</span>}
          </label>
          <label className="block">
            間隔 <input value={reg.tau} onChange={(e) => setReg({ ...reg, tau: e.target.value })} className={input} /> 時間ごと
          </label>
          <label className="block">
            点滴 <input value={reg.tinf} onChange={(e) => setReg({ ...reg, tinf: e.target.value })} className={input} /> 時間
          </label>
        </div>
        <div className="space-y-1.5 rounded-md border border-rule bg-paper p-3">
          <h3 className="font-bold">血中濃度（同じ投与間隔の2点）</h3>
          <label className="block">
            ピーク：点滴開始から <input value={lv.pt} onChange={(e) => setLv({ ...lv, pt: e.target.value })} className={input} /> 時間後に{" "}
            <input value={lv.pc} onChange={(e) => setLv({ ...lv, pc: e.target.value })} className={input} /> μg/mL
          </label>
          <label className="block">
            トラフ：次の投与の <input value={lv.tb} onChange={(e) => setLv({ ...lv, tb: e.target.value })} className={input} /> 時間前に{" "}
            <input value={lv.tc} onChange={(e) => setLv({ ...lv, tc: e.target.value })} className={input} /> μg/mL
          </label>
          <button
            type="button"
            onClick={() => {
              setReg({ dose: "1000", tau: "12", tinf: "1" });
              setLv({ pt: "2", pc: "28.6", tb: "0", tc: "10.4" });
            }}
            className="text-xs text-ai underline"
          >
            例を入れる（架空の値）
          </button>
          <p className="text-[11px] text-ink-faint">トラフ1点だけでは AUC は計算しません（集団の値を使うベイズ推定のソフトが要ります）。</p>
          <details className="text-[11px] text-ink-soft">
            <summary className="cursor-pointer">ガイドラインの採血と腎機能の目安</summary>
            <ul className="mt-0.5 list-disc pl-4">
              {VCM_NOTES.map((n) => (
                <li key={n.text}>
                  {n.text}（{n.source}）
                </li>
              ))}
            </ul>
          </details>
        </div>
      </section>

      {res && "error" in res && <p className="font-bold text-shu">{res.error}</p>}
      {ok && (
        <section className="space-y-2 rounded-md border border-ai/40 bg-ai-soft/30 p-3">
          <div className="nums flex flex-wrap items-baseline gap-x-5 gap-y-1">
            <span>
              AUC24 <b className="text-lg">{f1(ok.auc24, 0)}</b> μg·h/mL
            </span>
            <span>Cmax {f1(ok.cmax)}</span>
            <span>Cmin {f1(ok.cmin)}</span>
            <span>半減期 {f1(ok.halfLife)} 時間</span>
            <span>Vd {f1(ok.vd)} L{w ? `（${f1(ok.vd / w, 2)} L/kg）` : ""}</span>
            <span>CL {f1(ok.cl, 2)} L/時</span>
          </div>
          {VCM_TARGET.auc24 && (
            <p className="text-xs text-ink-soft">
              ガイドラインの目標：AUC24 {VCM_TARGET.auc24[0]}〜{VCM_TARGET.auc24[1]} μg·h/mL<span className="hint">（{VCM_TARGET.source}）</span>
            </p>
          )}
          <details className="text-xs text-ink-soft">
            <summary className="cursor-pointer">計算の式（1-コンパートメント、間欠点滴、定常状態。Sawchuk-Zaske 法）</summary>
            <ol className="mt-1 list-decimal space-y-0.5 pl-5">
              {ok.steps.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
            <p className="hint mt-1">参考：台形と指数の和で求めた AUC24 は {f1(ok.aucTrapezoid24, 0)}。</p>
          </details>

          <div>
            <h4 className="text-xs font-bold">ほかの投与にしたときの予測（この患者の k と CL で計算）</h4>
            <table className="nums mt-1 text-xs">
              <thead>
                <tr className="text-ink-faint">
                  <th className="pr-2 text-left font-normal">1回 mg</th>
                  <th className="pr-2 text-left font-normal">間隔 時間</th>
                  <th className="pr-2 text-left font-normal">点滴 時間</th>
                  <th className="pr-2 text-right font-normal">AUC24</th>
                  <th className="pr-2 text-right font-normal">Cmin</th>
                  <th className="pr-2 text-right font-normal">Cmax</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {cands.map((c, i) => {
                  const p = predict(ok, { dose: n(c.dose), tau: n(c.tau), tinf: n(c.tinf) });
                  const upd = (patch: Partial<typeof c>) => setCands((all) => all.map((x, j) => (j === i ? { ...x, ...patch } : x)));
                  return (
                    <tr key={i}>
                      <td className="pr-2">
                        <input value={c.dose} onChange={(e) => upd({ dose: e.target.value })} className={input} />
                      </td>
                      <td className="pr-2">
                        <input value={c.tau} onChange={(e) => upd({ tau: e.target.value })} className={input} />
                      </td>
                      <td className="pr-2">
                        <input value={c.tinf} onChange={(e) => upd({ tinf: e.target.value })} className={input} />
                      </td>
                      <td className="pr-2 text-right font-bold">{f1(p.auc24, 0)}</td>
                      <td className="pr-2 text-right">{f1(p.cmin)}</td>
                      <td className="pr-2 text-right">{f1(p.cmax)}</td>
                      <td>
                        <button type="button" onClick={() => setCands((all) => all.filter((_, j) => j !== i))} aria-label="この行を消す">
                          <X size={12} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <button type="button" onClick={() => setCands((all) => [...all, { ...reg }])} className="mt-1 flex items-center gap-1 text-xs text-ai">
              <Plus size={12} />
              行を足す（薬剤師が投与を入れる）
            </button>
          </div>

          <label className="block text-xs text-ink-soft">
            医師への報告・提案（薬剤師が書く）
            <textarea value={proposal} onChange={(e) => setProposal(e.target.value)} rows={2} className="mt-0.5 w-full rounded border border-rule bg-sheet px-2 py-1 text-[13px] text-ink" />
          </label>
          <button
            type="button"
            disabled={!proposal.trim() || !person}
            onClick={() => {
              onReport({ patientId: pid, drug: "バンコマイシン", regimen, levels, auc24: ok.auc24, cmin: ok.cmin, proposal: proposal.trim() });
              setProposal("");
            }}
            className="flex items-center gap-1 rounded bg-ai px-3 py-1 text-xs font-bold text-white disabled:opacity-40"
          >
            <Send size={12} />
            医師に報告（{nowTime}）
          </button>
        </section>
      )}

      {reports.length > 0 && (
        <section>
          <h3 className="text-xs font-bold text-ink-soft">報告した TDM</h3>
          <ul className="mt-1 space-y-0.5 text-xs">
            {reports.map((r) => (
              <li key={r.id}>
                {r.at} {people.find((x) => x.patient.id === r.patientId)?.patient.name}：{r.drug} AUC24 {f1(r.auc24, 0)}「{r.proposal}」<span className={r.status === "確認済" ? "text-wakatake" : "text-yamabuki"}>{r.status}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <p className="hint text-[10px] text-ink-faint">計算はコードで行い、式を出しています。投与量を決めるのは医師、提案するのは薬剤師です。AI は使っていません。</p>
    </div>
  );
}
