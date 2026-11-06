"use client";

import { displayText } from "@/lib/display-text";
import { FileSignature, Printer } from "lucide-react";
import { DenyNote, useDeny } from "../RoleContext";
import { useState } from "react";
import { usePrintSheet } from "../DeskParts";
import { addDays, formatShort, type CalendarDate } from "@/lib/dates";
import { CONSENT_TEMPLATES, findConsent, signatureOf, type ConsentCode, type ConsentRecord, type ConsentStatus, type SignRole } from "@/lib/consent";
import { DOCTORS } from "@/lib/doctors";
import { ConsentSign } from "../ConsentSign";
import { orderLines } from "@/lib/format";
import { HOSPITAL } from "@/lib/billing/facility";
import type { OrderEntry, Patient } from "@/lib/types";
import { ageSex } from "@/lib/person";

interface Props {
  patient: Patient;
  room: string;
  today: CalendarDate;
  nowTime: string;
  doctor: string;
  records: ConsentRecord[];
  orders: OrderEntry[];
  onCreate: (code: ConsentCode) => void;
  onUpdate: (r: ConsentRecord) => void;
}

const STATUS_STYLE: Record<ConsentStatus, string> = {
  説明前: "bg-yamabuki-soft text-yamabuki",
  同意: "bg-wakatake-soft text-wakatake",
  拒否: "bg-shu-soft text-shu",
  撤回: "bg-shu-soft text-shu",
};


/** The patient's explanation and consent forms: list, fill in, record the answer, print on A4. */
export function ConsentPanel({ patient, room, today, nowTime, doctor, records, orders, onCreate, onUpdate }: Props) {
  const [selected, setSelected] = useState<string | null>(records[0]?.id ?? null);
  const [signing, setSigning] = useState(false);
  const [print, sheet] = usePrintSheet();
  const r = records.find((x) => x.id === selected) ?? records[0];
  const locked = !!useDeny()("consent");
  return (
    <div className="grid grid-cols-[160px_minmax(0,1fr)] gap-3 text-[13px]">
      <DenyNote action="consent" className="col-span-2" />
      <aside className="space-y-3">
        <ul className="space-y-1">
          {records.map((x) => (
            <li key={x.id}>
              <button type="button" onClick={() => setSelected(x.id)} className={`w-full rounded-md px-2 py-1.5 text-left ${r?.id === x.id ? "bg-ai-soft" : "hover:bg-paper"}`}>
                <div className="font-bold">{findConsent(x.code).short}</div>
                <span className={`rounded px-1 text-[11px] font-bold ${STATUS_STYLE[x.status]}`}>{x.status}</span>
                <span className="ml-1 text-[11px] text-ink-soft">{x.signatures?.length ? `署名 ${x.signatures.map((s) => s.role).join("・")}` : "電子署名なし"}</span>
                <span className="ml-1 text-[11px] text-ink-faint">{formatShort(addDays(today, (x.explainedAt ?? x.createdAt).day))}</span>
              </button>
            </li>
          ))}
          {records.length === 0 && <li className="text-ink-faint">同意書はまだありません。</li>}
        </ul>
        <fieldset disabled={locked} className="m-0 min-w-0 border-0 p-0 disabled:opacity-50">
          <h3 className="mb-1 text-xs font-bold text-ink-soft">新しく作る</h3>
          {CONSENT_TEMPLATES.map((t) => (
            <button key={t.code} type="button" onClick={() => onCreate(t.code)} className="mb-1 flex w-full items-center gap-1 rounded border border-rule px-2 py-1 text-left hover:border-ai">
              <FileSignature size={13} className="text-ai" />
              {t.short}
            </button>
          ))}
        </fieldset>

      </aside>
      {r ? (
        <div>
          <fieldset disabled={locked} className="m-0 min-w-0 border-0 p-0">
            <Editor key={r.id} r={r} patient={patient} today={today} nowTime={nowTime} doctor={doctor} orders={orders} onUpdate={onUpdate} onSign={() => setSigning(true)} />
          </fieldset>
          {signing && (
            <ConsentSign
              record={r}
              patientName={patient.name}
              doctor={r.explainedBy || doctor}
              nowTime={nowTime}
              document={<ConsentDocument r={r} patient={patient} room={room} today={today} orders={orders} reading />}
              onClose={() => setSigning(false)}
              onDone={(x) => {
                onUpdate(x);
                setSigning(false);
              }}
            />
          )}
          <div className="mt-3 flex justify-end">
            <button type="button" onClick={() => print(<ConsentDocument r={r} patient={patient} room={room} today={today} orders={orders} print />, { portrait: true })} className="flex items-center gap-1.5 rounded-md border border-ai px-3 py-1.5 font-bold text-ai hover:bg-ai hover:text-white">
              <Printer size={14} />
              印刷（A4縦）
            </button>
          </div>
          <ConsentDocument r={r} patient={patient} room={room} today={today} orders={orders} />
          {sheet}
        </div>
      ) : (
        <p className="text-ink-faint">左から作る同意書を選んでください。</p>
      )}
    </div>
  );
}

function Editor({ r, patient, today, nowTime, doctor, orders, onUpdate, onSign }: { r: ConsentRecord; patient: Patient; today: CalendarDate; nowTime: string; doctor: string; orders: OrderEntry[]; onUpdate: (r: ConsentRecord) => void; onSign: () => void }) {
  const t = findConsent(r.code);
  const [extra, setExtra] = useState(r.extra ?? "");
  const [witness, setWitness] = useState(r.witness ?? "");
  const [proxyName, setProxyName] = useState(r.proxy?.name ?? "");
  const [proxyRel, setProxyRel] = useState(r.proxy?.relation ?? "");
  const order = r.orderId ? orders.find((o) => o.id === r.orderId) : undefined;
  const save = (patch: Partial<ConsentRecord>) =>
    onUpdate({ ...r, extra: extra.trim() || undefined, witness: witness.trim() || undefined, proxy: proxyName.trim() ? { name: proxyName.trim(), relation: proxyRel.trim() } : undefined, ...patch });
  const unanswered = (t.questions ?? []).filter((q) => !r.answers[q.id]);
  return (
    <section className="mb-3 space-y-2 rounded-md border border-rule bg-paper p-3">
      <div className="flex flex-wrap items-baseline gap-2">
        <b>{t.short}</b>
        <label>説明した医師 <select aria-label="同意書の説明医師" value={r.explainedBy || doctor} onChange={(e) => save({ explainedBy: e.target.value })}>{DOCTORS.map((d) => <option key={d.name}>{d.name}</option>)}</select></label>
        <span className={`rounded px-1 text-[11px] font-bold ${STATUS_STYLE[r.status]}`}>{r.status}</span>
        {order && <span className="text-[11px] text-ink-soft">対象のオーダ：{orderLines(order.order, today).main}</span>}
      </div>
      {t.questions && (
        <div>
          <h4 className="text-xs font-bold text-ink-soft">{t.questionsTitle ?? "問診（患者に聞いて入れる）"}</h4>
          <ul className="mt-1 space-y-0.5">
            {t.questions.map((q) => (
              <li key={q.id} className="flex flex-wrap items-center gap-1.5">
                <span className="min-w-72">{q.label}</span>
                {(["はい", "いいえ", "わからない"] as const).map((a) => (
                  <button
                    key={a}
                    type="button"
                    onClick={() => onUpdate({ ...r, answers: { ...r.answers, [q.id]: a } })}
                    className={`rounded border px-1.5 text-[11px] ${r.answers[q.id] === a ? (a === "はい" ? "border-shu bg-shu text-white" : "border-ai bg-ai text-white") : "border-rule bg-sheet"}`}
                  >
                    {a}
                  </button>
                ))}
              </li>
            ))}
          </ul>
          {Object.values(r.answers).includes("はい") && <p className="mt-1 text-[12px] font-bold text-shu">{t.yesNote ?? "「はい」の項目があります。担当医が確かめてから進めてください。"}</p>}
        </div>
      )}
      <label className="block text-xs text-ink-soft">
        この患者のための追加の説明（医師が書く）
        <textarea value={extra} onChange={(e) => setExtra(e.target.value)} rows={2} className="mt-0.5 w-full rounded border border-rule bg-sheet px-2 py-1 text-[13px] text-ink outline-none" />
      </label>
      <div className="flex flex-wrap gap-2 text-xs text-ink-soft">
        <label>
          同席者
          <input value={witness} onChange={(e) => setWitness(e.target.value)} placeholder="看護師 ○○" className="ml-1 w-32 rounded border border-rule bg-sheet px-1.5 py-0.5 text-ink" />
        </label>
        <label>
          代諾者
          <input value={proxyName} onChange={(e) => setProxyName(e.target.value)} placeholder="氏名（本人が署名できないとき）" className="ml-1 w-44 rounded border border-rule bg-sheet px-1.5 py-0.5 text-ink" />
        </label>
        <label>
          続柄
          <input value={proxyRel} onChange={(e) => setProxyRel(e.target.value)} className="ml-1 w-16 rounded border border-rule bg-sheet px-1.5 py-0.5 text-ink" />
        </label>
      </div>
      <div className="flex flex-wrap gap-2 pt-1">
        <button type="button" onClick={() => save({})} className="rounded border border-rule px-2 py-1 text-xs">
          書いた内容を残す
        </button>
        {r.status === "説明前" && (
          <button
            type="button"
            disabled={unanswered.length > 0}
            title={unanswered.length ? "問診にすべて答えてから" : "患者と説明した医師がマウス・タッチで署名する"}
            onClick={() => {
              save({});
              onSign();
            }}
            className="rounded bg-ai px-3 py-1 text-xs font-bold text-white disabled:opacity-40"
          >
            PC・タブレットで署名する
          </button>
        )}
        {r.status !== "同意" && (
          <button
            type="button"
            disabled={unanswered.length > 0}
            title={unanswered.length ? "問診にすべて答えてから" : undefined}
            onClick={() => save({ status: "同意", explainedAt: { day: 0, time: nowTime }, explainedBy: r.explainedBy || doctor })}
            className="rounded bg-wakatake px-3 py-1 text-xs font-bold text-white disabled:opacity-40"
          >
            説明して同意を得た（署名は紙）
          </button>
        )}
        {r.status === "説明前" && (
          <button type="button" onClick={() => save({ status: "拒否", explainedAt: { day: 0, time: nowTime }, explainedBy: r.explainedBy || doctor, closedAt: { day: 0, time: nowTime } })} className="rounded border border-shu px-2 py-1 text-xs text-shu">
            同意されなかった
          </button>
        )}
        {r.status === "同意" && (
          <button type="button" onClick={() => save({ status: "撤回", closedAt: { day: 0, time: nowTime } })} className="rounded border border-shu px-2 py-1 text-xs text-shu">
            同意を撤回された
          </button>
        )}
      </div>
      <p className="text-[11px] text-ink-faint">
        {patient.name}さん　作成 {formatShort(addDays(today, r.createdAt.day))} {r.createdAt.time}
        {r.explainedAt && `　説明 ${formatShort(addDays(today, r.explainedAt.day))} ${r.explainedAt.time} ${r.explainedBy ?? ""}`}
      </p>
    </section>
  );
}

/** A signature image when signed on a tablet, otherwise a line to sign on paper. */
function Sig({ r, role, width = "w-40" }: { r: ConsentRecord; role: SignRole; width?: string }) {
  const s = signatureOf(r, role);
  // eslint-disable-next-line @next/next/no-img-element
  return s ? <img src={s.dataUrl} alt={`${role}の署名`} className={`inline-block h-10 ${width} border-b border-ink/40 object-contain align-bottom`} /> : <span>＿＿＿＿＿＿＿＿</span>;
}

/** The printed form (A4 portrait). `reading` hides the signature block (shown on the tablet before signing). */
export function ConsentDocument({ r, patient, room, today, orders, print, reading }: { r: ConsentRecord; patient: Patient; room: string; today: CalendarDate; orders: OrderEntry[]; print?: boolean; reading?: boolean }) {
  const t = findConsent(r.code);
  const order = r.orderId ? orders.find((o) => o.id === r.orderId) : undefined;
  const when = r.explainedAt ?? r.createdAt;
  return (
    <article className={`${print ? "" : "rounded-lg border border-rule bg-sheet p-3 shadow-sm"} text-[12.5px] leading-relaxed text-ink print:text-[11px]`}>
      <header className="mb-3 border-b-2 border-ink pb-2">
        <div className="flex items-baseline justify-between text-[11px] text-ink-soft">
          <span>{HOSPITAL.name}</span>
          <span>{displayText(t.version)}</span>
        </div>
        <h2 className="mt-1 text-center text-lg font-bold">{t.title}</h2>
        <div className="mt-2 grid grid-cols-2 gap-x-4 text-[12px]">
          <span>
            患者氏名：<b>{patient.name}</b> 様（{ageSex(patient)}）
          </span>
          <span>患者ID：{patient.id}</span>
          <span>病棟・病室：{patient.ward} {room}</span>
          <span>診療科：{patient.department}　担当医：{patient.attending}</span>
          {order && <span className="col-span-2">対象：{orderLines(order.order, today).main}</span>}
        </div>
      </header>
      {t.sections.map((s) => (
        <section key={s.heading} className="mb-2 break-inside-avoid">
          <h3 className="font-bold">■ {s.heading}</h3>
          {s.lines.map((l) => (
            <p key={l} className="pl-3">
              {s.lines.length > 2 && !l.endsWith("。") ? "・" : ""}
              {l}
            </p>
          ))}
          {s.facts?.map((f) => (
            <p key={f.text} className="pl-3 text-[11px] text-ink-soft">
              {displayText(f.text)}
            </p>
          ))}
        </section>
      ))}
      {t.questions && (
        <section className="mb-2 break-inside-avoid">
          <h3 className="font-bold">■ {t.questionsTitle?.replace(/（.*$/, "") ?? "問診"}</h3>
          <table className="ml-3 text-[12px]">
            <tbody>
              {t.questions.map((q) => (
                <tr key={q.id}>
                  <td className="pr-4">{q.label}</td>
                  <td>{r.answers[q.id] ?? "□はい　□いいえ　□わからない"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      {r.extra && (
        <section className="mb-2">
          <h3 className="font-bold">■ 担当医からの追加の説明</h3>
          <p className="pl-3">{r.extra}</p>
        </section>
      )}
      {!reading && <section className="mt-4 break-inside-avoid border-t border-ink pt-3">
        <p>
          私は、上記について説明を受け、内容を理解しました。（{r.choice ? (r.choice === "同意する" ? "■ 同意します　□ 同意しません" : "□ 同意します　■ 同意しません") : "□ 同意します　□ 同意しません"}）
        </p>
        <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-3 text-[12px]">
          <span>
            説明日時：{formatShort(addDays(today, when.day))} {r.explainedAt ? when.time : "　　：　　"}
          </span>
          <span>
            説明した医師：{r.explainedBy ?? ""}　署名 <Sig r={r} role="説明した医師" />
          </span>
          <span>
            同席者：{displayText(r.witness ?? "")}　署名 <Sig r={r} role="同席者" />
          </span>
          <span>
            本人署名：<Sig r={r} role="本人" width="w-48" />
          </span>
          <span>
            代諾者：{r.proxy?.name ?? "＿＿＿＿＿＿"}（続柄：{r.proxy?.relation ?? "＿＿"}）署名 <Sig r={r} role="代諾者" />
          </span>
          <span>状態：{r.status}</span>
          {r.signatures?.length ? <span className="text-[11px] text-ink-soft">タブレットで署名（{r.signatures.map((s) => `${s.role} ${s.at.time}`).join("、")}）</span> : null}
        </div>
        <p className="mt-3 text-[11px] text-ink-soft">同意の撤回：　　年　月　日　本人／代諾者署名＿＿＿＿＿＿＿＿</p>
      </section>}


    </article>
  );
}

/* Help migration source (references and dynamic wording):
<p >雛形の文を AI が作ったり書き換えたりすることはありません。患者の情報だけが入ります。署名は PC のマウスやタブレットの指・ペンでもらうか、印刷した紙にもらいます。</p>
<span >（出典：{displayText(f.source)}）</span>
<p >出典：{t.sources.map((s) => s.label).join("／")}</p>
<p >一般的な説明文です。実際の説明・同意には使えません。</p>
*/
