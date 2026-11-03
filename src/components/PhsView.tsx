"use client";

import { BellRing, Phone, PhoneCall, Siren, StickyNote } from "lucide-react";
import { useState } from "react";
import { CALL_REASONS, EMERGENCY_KINDS, PASS_ON_SECONDS, callState, type CallNote, type Contact, type Emergency, type NurseCall } from "@/lib/phs";
import type { WorkPatient } from "@/lib/worksheet";
import { useMe } from "./RoleContext";

interface Props {
  people: WorkPatient[];
  nowTime: string;
  contacts: Contact[];
  /** The patient's cautions to show with a call (転倒・隔離・アレルギー・身体的拘束 …). */
  cautionsOf: (patientId: string) => string[];
  calls: NurseCall[];
  emergencies: Emergency[];
  notes: CallNote[];
  onRing: (patientId: string) => void;
  onAnswer: (id: string) => void;
  onArrive: (id: string) => void;
  onDone: (id: string, reason: (typeof CALL_REASONS)[number], memo: string) => void;
  onRaise: (kind: Emergency["kind"], place: string, patientId?: string) => void;
  onCome: (id: string) => void;
  onClose: (id: string, note: string) => void;
  onNote: (n: Omit<CallNote, "id" | "at" | "from">) => void;
}

const card = "rounded-lg border border-rule bg-sheet";
const STATE_STYLE = { 呼出中: "bg-shu text-white", 応答: "bg-yamabuki text-white", 訪室: "bg-ai text-white", 完了: "bg-tab text-ink-soft" } as const;

/** 院内連絡 (院内PHS の代わり): who to call now, nurse calls, emergency calls and call notes. */
export function PhsView(p: Props) {
  const me = useMe();
  const [ringBed, setRingBed] = useState("");
  const [kind, setKind] = useState<Emergency["kind"] | "">("");
  const [place, setPlace] = useState("");
  const [to, setTo] = useState("");
  const [about, setAbout] = useState("");
  const [text, setText] = useState("");
  const [closing, setClosing] = useState<Record<string, string>>({});
  const [doneAs, setDoneAs] = useState<Record<string, { reason: string; memo: string }>>({});
  const nameOf = (pid?: string) => p.people.find((x) => x.patient.id === pid)?.patient.name ?? "";
  const open = p.calls.filter((c) => !c.done);
  const active = p.emergencies.filter((e) => !e.closed);
  return (
    <div className="scroll-thin min-h-0 flex-1 overflow-auto bg-paper p-5">
      <div className="mx-auto grid max-w-[1200px] gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_minmax(0,1fr)]">
        {/* いま連絡する人 */}
        <section className="space-y-3">
          <div className={`${card} p-3`}>
            <h2 className="mb-2 flex items-center gap-1.5 font-bold">
              <Phone size={16} />
              いま連絡する人（{p.nowTime}）
            </h2>
            <ul className="divide-y divide-rule-soft text-[13px]">
              {p.contacts.map((c) => (
                <li key={c.role} className="flex items-baseline gap-2 py-1.5">
                  <span className="w-24 shrink-0 text-xs text-ink-soft">{c.role}</span>
                  <span className="min-w-0 flex-1">
                    <b>{c.name}</b>
                    {c.note && <span className="block text-[11px] text-ink-faint">{c.note}</span>}
                  </span>
                  <button type="button" onClick={() => setTo(`${c.role} ${c.name}`)} className="nums flex items-center gap-1 rounded border border-rule px-2 py-0.5 text-xs hover:border-ai hover:text-ai" title="通話メモの相手に入れる">
                    <PhoneCall size={12} />
                    {c.ext}
                  </button>
                </li>
              ))}
            </ul>
            <p className="mt-1 text-[11px] text-ink-faint">時刻（日勤 8:30〜17:00、それ以外は当直）と曜日から、架空の病院の当番表を引いています。内線番号も架空です。</p>
          </div>
          <div className={`${card} space-y-2 p-3 text-[13px]`}>
            <h2 className="flex items-center gap-1.5 font-bold">
              <StickyNote size={16} />
              通話メモ
            </h2>
            <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="相手（上の番号を押すと入ります）" aria-label="通話の相手" className="w-full rounded border border-rule bg-paper px-2 py-1" />
            <select value={about} onChange={(e) => setAbout(e.target.value)} aria-label="どの患者の件か" className="w-full rounded border border-rule bg-paper px-2 py-1">
              <option value="">患者（なければ空のまま）</option>
              {p.people.map((x) => (
                <option key={x.patient.id} value={x.patient.id}>
                  {x.room} {x.patient.name}
                </option>
              ))}
            </select>
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} placeholder="話した内容（例：BT 38.9。指示簿の頓用で様子を見て、22時に再検。悪化なら再度連絡）" aria-label="話した内容" className="w-full rounded border border-rule bg-paper px-2 py-1" />
            <button
              type="button"
              disabled={!to.trim() || !text.trim()}
              onClick={() => {
                p.onNote({ to: to.trim(), patientId: about || undefined, text: text.trim() });
                setText("");
              }}
              className="rounded-md bg-ai px-3 py-1 font-bold text-white disabled:opacity-40"
            >
              残す
            </button>
            <ul className="space-y-1 text-xs">
              {[...p.notes].reverse().map((n) => (
                <li key={n.id} className="border-l-2 border-ai/40 pl-2">
                  <span className="nums text-ink-faint">
                    {n.at}　{n.from} → {n.to}
                    {n.patientId ? `　${nameOf(n.patientId)}さん` : ""}
                  </span>
                  <div>{n.text}</div>
                </li>
              ))}
            </ul>
            <p className="text-[11px] text-ink-faint">電話はかけません（試作）。誰が・誰に・いつ・何を話したかを残し、患者の件はその記録にも残ります。</p>
          </div>
        </section>

        {/* ナースコール */}
        <section className={`${card} space-y-2 p-3`}>
          <h2 className="flex items-center gap-1.5 font-bold">
            <BellRing size={16} />
            ナースコール（呼出中 {open.filter((c) => !c.answered).length}件）
          </h2>
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-dashed border-rule p-2 text-xs">
            デモ：
            <select value={ringBed} onChange={(e) => setRingBed(e.target.value)} aria-label="ナースコールを鳴らすベッド" className="rounded border border-rule bg-paper px-1 py-0.5">
              <option value="">ベッドを選ぶ</option>
              {p.people.map((x) => (
                <option key={x.patient.id} value={x.patient.id}>
                  {x.room} {x.patient.name}
                </option>
              ))}
            </select>
            <button type="button" disabled={!ringBed} onClick={() => p.onRing(ringBed)} className="rounded border border-shu px-2 py-0.5 font-bold text-shu disabled:opacity-40">
              鳴らす
            </button>
            <span className="text-ink-faint">担当の看護師へ。{PASS_ON_SECONDS}秒応答がなければ病棟リーダーへ回します（架空の病院の取り決め）。</span>
          </div>
          {p.calls.length === 0 && <p className="text-sm text-ink-faint">いま鳴っているナースコールはありません。</p>}
          {[...p.calls].reverse().map((c) => {
            const st = callState(c);
            const cautions = p.cautionsOf(c.patientId);
            const d = doneAs[c.id] ?? { reason: "", memo: "" };
            return (
              <article key={c.id} className={`rounded-md border p-2 text-[13px] ${st === "呼出中" ? "border-shu" : "border-rule"}`}>
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className={`rounded px-1.5 text-[11px] font-bold ${STATE_STYLE[st]}`}>{st}</span>
                  <b className="text-base">
                    {c.room}
                    {c.bed} {nameOf(c.patientId)}さん
                  </b>
                  <span className="nums text-xs text-ink-soft">
                    {c.at}　→ {c.passedOn ? c.passedOn.to : c.to}
                  </span>
                </div>
                {cautions.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {cautions.map((x) => (
                      <span key={x} className="rounded bg-shu-soft px-1.5 text-[11px] font-bold text-shu">
                        {x}
                      </span>
                    ))}
                  </div>
                )}
                {c.passedOn && <p className="mt-1 text-[11px] text-yamabuki">{c.passedOn.at} {c.passedOn.to}へ回しました：{c.passedOn.why}</p>}
                <div className="nums mt-1 text-[11px] text-ink-soft">
                  {c.answered && `応答 ${c.answered.at} ${c.answered.by}　`}
                  {c.arrived && `訪室 ${c.arrived.at} ${c.arrived.by}　`}
                  {c.done && `完了 ${c.done.at} ${c.done.by}（${c.done.reason}${c.done.memo ? `：${c.done.memo}` : ""}）`}
                </div>
                {st !== "完了" && me.role === "看護師" && (
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                    {!c.answered && (
                      <button type="button" onClick={() => p.onAnswer(c.id)} className="rounded bg-yamabuki px-2 py-0.5 font-bold text-white">
                        応答する
                      </button>
                    )}
                    {!c.arrived && (
                      <button type="button" onClick={() => p.onArrive(c.id)} className="rounded bg-ai px-2 py-0.5 font-bold text-white">
                        訪室した
                      </button>
                    )}
                    <select value={d.reason} onChange={(e) => setDoneAs((m) => ({ ...m, [c.id]: { ...d, reason: e.target.value } }))} aria-label="用件" className="rounded border border-rule bg-paper px-1 py-0.5">
                      <option value="">用件</option>
                      {CALL_REASONS.map((r) => (
                        <option key={r}>{r}</option>
                      ))}
                    </select>
                    <input value={d.memo} onChange={(e) => setDoneAs((m) => ({ ...m, [c.id]: { ...d, memo: e.target.value } }))} placeholder="対応（短く）" aria-label="対応" className="min-w-32 flex-1 rounded border border-rule bg-paper px-1.5 py-0.5" />
                    <button type="button" disabled={!d.reason || !c.arrived} onClick={() => p.onDone(c.id, d.reason as (typeof CALL_REASONS)[number], d.memo.trim())} className="rounded border border-ink px-2 py-0.5 disabled:opacity-40">
                      完了
                    </button>
                  </div>
                )}
              </article>
            );
          })}
          <p className="text-[11px] text-ink-faint">患者の注意（転倒・隔離・アレルギー・身体的拘束・DNAR など）はカルテからコードで集めています。ナースコールの機械とはつながっていません（試作）。</p>
        </section>

        {/* 緊急通報 */}
        <section className="space-y-3">
          <div className={`${card} space-y-2 p-3 text-[13px]`}>
            <h2 className="flex items-center gap-1.5 font-bold text-shu">
              <Siren size={16} />
              緊急通報（全員の画面に出ます）
            </h2>
            <select value={kind} onChange={(e) => setKind(e.target.value as Emergency["kind"])} aria-label="緊急通報の種類" className="w-full rounded border border-rule bg-paper px-2 py-1">
              <option value="">種類を選ぶ</option>
              {EMERGENCY_KINDS.map((k) => (
                <option key={k}>{k}</option>
              ))}
            </select>
            <select value={place} onChange={(e) => setPlace(e.target.value)} aria-label="場所" className="w-full rounded border border-rule bg-paper px-2 py-1">
              <option value="">場所を選ぶ</option>
              {p.people.map((x) => (
                <option key={x.patient.id} value={`p:${x.patient.id}`}>
                  5階東 {x.room} {x.patient.name}さん
                </option>
              ))}
              {["5階東 ナースステーション", "5階東 廊下・デイルーム", "5階東 トイレ・浴室"].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
            <button
              type="button"
              disabled={!kind || !place}
              onClick={() => {
                const pid = place.startsWith("p:") ? place.slice(2) : undefined;
                const x = p.people.find((y) => y.patient.id === pid);
                p.onRaise(kind as Emergency["kind"], x ? `5階東 ${x.room} ${x.patient.name}さん` : place, pid);
                setKind("");
                setPlace("");
              }}
              className="w-full rounded-md bg-shu px-3 py-1.5 font-bold text-white disabled:opacity-40"
            >
              緊急通報を出す
            </button>
          </div>
          {[...p.emergencies].reverse().map((e) => (
            <article key={e.id} className={`${card} p-3 text-[13px] ${e.closed ? "" : "border-shu"}`}>
              <div className="font-bold text-shu">{e.kind}</div>
              <div>{e.place}</div>
              <div className="nums text-xs text-ink-soft">
                {e.at} 発信 {e.by}
              </div>
              <ul className="nums mt-1 text-xs">
                {e.came.map((c, i) => (
                  <li key={i}>
                    {c.at} 到着 {c.name}
                  </li>
                ))}
              </ul>
              {e.closed ? (
                <p className="nums mt-1 text-xs text-ink-soft">
                  解除 {e.closed.at} {e.closed.by}：{e.closed.note}
                </p>
              ) : (
                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                  {!e.came.some((c) => c.name === me.name) && (
                    <button type="button" onClick={() => p.onCome(e.id)} className="rounded bg-shu px-2 py-0.5 font-bold text-white">
                      駆けつけた
                    </button>
                  )}
                  <input value={closing[e.id] ?? ""} onChange={(ev) => setClosing((m) => ({ ...m, [e.id]: ev.target.value }))} placeholder="解除のときの経過（例：ROSC、ICU へ）" aria-label="解除の経過" className="min-w-32 flex-1 rounded border border-rule bg-paper px-1.5 py-0.5" />
                  <button type="button" disabled={!(closing[e.id] ?? "").trim()} onClick={() => p.onClose(e.id, closing[e.id].trim())} className="rounded border border-ink px-2 py-0.5 disabled:opacity-40">
                    解除
                  </button>
                </div>
              )}
            </article>
          ))}
          {active.length === 0 && p.emergencies.length === 0 && <p className="text-sm text-ink-faint">いま出ている緊急通報はありません。</p>}
        </section>
      </div>
    </div>
  );
}
