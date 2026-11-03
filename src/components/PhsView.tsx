"use client";

import { BellRing, CalendarClock, History, Megaphone, Phone, PhoneCall, Siren, StickyNote, Tags } from "lucide-react";
import { useState } from "react";
import { CALL_KINDS, CALL_REASONS, EMERGENCY_KINDS, PASS_ON_SECONDS, RESCUE, SENSORS, callCounts, callState, callTarget, evacuation, teamOf, type BedInfo, type CallKind, type CallNote, type Contact, type Emergency, type NurseCall, type PhsNotice, type Rescue, type Sensor } from "@/lib/phs";
import type { WorkPatient } from "@/lib/worksheet";
import { useMe } from "./RoleContext";

export interface ScheduleItem {
  when: string;
  sort: number;
  room: string;
  name: string;
  what: string;
}

interface Props {
  people: WorkPatient[];
  nowTime: string;
  contacts: Contact[];
  /** The patient's cautions to show with a call (転倒・隔離・アレルギー・身体的拘束 …). */
  cautionsOf: (patientId: string) => string[];
  calls: NurseCall[];
  emergencies: Emergency[];
  notes: CallNote[];
  notices: PhsNotice[];
  beds: Record<string, BedInfo>;
  schedule: ScheduleItem[];
  onRing: (patientId: string, kind: CallKind) => void;
  onAnswer: (id: string) => void;
  onArrive: (id: string) => void;
  onDone: (id: string, reason: (typeof CALL_REASONS)[number], memo: string) => void;
  onRaise: (kind: Emergency["kind"], place: string, patientId?: string) => void;
  onCome: (id: string) => void;
  onClose: (id: string, note: string) => void;
  onNote: (n: Omit<CallNote, "id" | "at" | "from">) => void;
  onBroadcast: (to: PhsNotice["to"], text: string) => void;
  onReadNotice: (id: string) => void;
  onBed: (patientId: string, info: BedInfo) => void;
}

const card = "rounded-lg border border-rule bg-sheet";
const STATE_STYLE = { 呼出中: "bg-shu text-white", 応答: "bg-yamabuki text-white", 訪室: "bg-ai text-white", 完了: "bg-tab text-ink-soft" } as const;
type Tab = "calls" | "notices" | "beds" | "schedule" | "history";
const TABS: { key: Tab; label: string; icon: typeof Phone }[] = [
  { key: "calls", label: "ナースコール", icon: BellRing },
  { key: "notices", label: "お知らせ・一斉連絡", icon: Megaphone },
  { key: "beds", label: "ベッドの情報", icon: Tags },
  { key: "schedule", label: "予定一覧", icon: CalendarClock },
  { key: "history", label: "呼出履歴", icon: History },
];

/** 院内連絡 (院内PHS の代わり): who to call now, nurse calls, notices, bed info, schedule, emergency calls and call notes. */
export function PhsView(p: Props) {
  const me = useMe();
  const [tab, setTab] = useState<Tab>("calls");
  const [ringBed, setRingBed] = useState("");
  const [ringKind, setRingKind] = useState<CallKind>("通常");
  const [kind, setKind] = useState<Emergency["kind"] | "">("");
  const [place, setPlace] = useState("");
  const [to, setTo] = useState("");
  const [about, setAbout] = useState("");
  const [text, setText] = useState("");
  const [bcTo, setBcTo] = useState<PhsNotice["to"]>("全員");
  const [bcText, setBcText] = useState("");
  const [closing, setClosing] = useState<Record<string, string>>({});
  const [doneAs, setDoneAs] = useState<Record<string, { reason: string; memo: string }>>({});
  const nameOf = (pid?: string) => p.people.find((x) => x.patient.id === pid)?.patient.name ?? "";
  const open = p.calls.filter((c) => !c.done);
  const unread = p.notices.filter((n) => !n.readBy.includes(me.name)).length;
  const ev = evacuation(
    p.people.map((x) => ({ id: x.patient.id, name: x.patient.name, room: x.room })),
    p.beds,
  );
  return (
    <div className="scroll-thin min-h-0 flex-1 overflow-auto bg-paper p-5">
      <div className="mx-auto grid max-w-[1280px] gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.5fr)_minmax(0,0.9fr)]">
        {/* いま連絡する人・通話メモ */}
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

        {/* まんなか：タブ */}
        <section className={`${card} min-w-0 space-y-2 p-3`}>
          <div role="tablist" className="flex flex-wrap gap-1 border-b border-rule pb-2 text-xs">
            {TABS.map(({ key, label, icon: Icon }) => (
              <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)} className={`flex items-center gap-1 rounded px-2 py-1 ${tab === key ? "bg-ink font-bold text-white" : "text-ink-soft hover:text-ink"}`}>
                <Icon size={13} />
                {label}
                {key === "calls" && open.filter((c) => !c.answered).length > 0 && <span className="rounded-full bg-shu px-1.5 text-[10px] text-white">{open.filter((c) => !c.answered).length}</span>}
                {key === "notices" && unread > 0 && <span className="rounded-full bg-yamabuki px-1.5 text-[10px] text-white">{unread}</span>}
              </button>
            ))}
          </div>

          {tab === "calls" && (
            <>
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
                <select value={ringKind} onChange={(e) => setRingKind(e.target.value as CallKind)} aria-label="呼出の種類" className="rounded border border-rule bg-paper px-1 py-0.5">
                  {CALL_KINDS.map((k) => (
                    <option key={k}>{k}</option>
                  ))}
                </select>
                <button type="button" disabled={!ringBed} onClick={() => p.onRing(ringBed, ringKind)} className="rounded border border-shu px-2 py-0.5 font-bold text-shu disabled:opacity-40">
                  鳴らす
                </button>
                <span className="w-full text-ink-faint">担当の看護師へ。{PASS_ON_SECONDS}秒ごとに応答がなければ、同じチーム → 病棟リーダー → 全員の順に回します（呼出スライド。架空の病院の取り決め）。センサーは「ベッドの情報」で付けたベッドだけが鳴ります。</span>
              </div>
              {p.calls.length === 0 && <p className="text-sm text-ink-faint">いま鳴っているナースコールはありません。</p>}
              {[...p.calls].reverse().map((c) => {
                const st = callState(c);
                const cautions = p.cautionsOf(c.patientId);
                const d = doneAs[c.id] ?? { reason: "", memo: "" };
                const info = p.beds[c.patientId];
                return (
                  <article key={c.id} className={`rounded-md border p-2 text-[13px] ${st === "呼出中" ? "border-shu" : "border-rule"}`}>
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className={`rounded px-1.5 text-[11px] font-bold ${STATE_STYLE[st]}`}>{st}</span>
                      <span className="rounded border border-ink/30 px-1 text-[11px]">{c.kind}</span>
                      <b className="text-base">
                        {c.room} {nameOf(c.patientId)}さん
                      </b>
                      <span className="nums text-xs text-ink-soft">
                        {c.at}　→ {callTarget(c)}（{teamOf(c.room)} チーム）
                      </span>
                    </div>
                    {(cautions.length > 0 || info?.rescue) && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {info?.rescue && <span className="rounded bg-fuji-soft px-1.5 text-[11px] font-bold text-fuji">救護区分 {info.rescue}</span>}
                        {cautions.map((x) => (
                          <span key={x} className="rounded bg-shu-soft px-1.5 text-[11px] font-bold text-shu">
                            {x}
                          </span>
                        ))}
                      </div>
                    )}
                    {c.slides.map((s, i) => (
                      <p key={i} className="mt-1 text-[11px] text-yamabuki">
                        {s.at} {s.to}へ回しました：{s.why}
                      </p>
                    ))}
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
                        <input value={d.memo} onChange={(e) => setDoneAs((m) => ({ ...m, [c.id]: { ...d, memo: e.target.value } }))} placeholder="処置・対応（呼出履歴と記録に入る）" aria-label="対応" className="min-w-32 flex-1 rounded border border-rule bg-paper px-1.5 py-0.5" />
                        <button type="button" disabled={!d.reason || !c.arrived} onClick={() => p.onDone(c.id, d.reason as (typeof CALL_REASONS)[number], d.memo.trim())} className="rounded border border-ink px-2 py-0.5 disabled:opacity-40">
                          完了
                        </button>
                      </div>
                    )}
                  </article>
                );
              })}
            </>
          )}

          {tab === "notices" && (
            <div className="space-y-2 text-[13px]">
              <div className="flex flex-wrap items-center gap-2 rounded-md border border-rule-soft p-2">
                <b className="text-xs">一斉連絡</b>
                <select value={bcTo} onChange={(e) => setBcTo(e.target.value as PhsNotice["to"])} aria-label="一斉連絡の相手" className="rounded border border-rule bg-paper px-1 py-0.5 text-xs">
                  <option value="全員">病棟の看護師全員</option>
                  <option value="A">A チーム（501〜508）</option>
                  <option value="B">B チーム（510〜516）</option>
                </select>
                <input value={bcText} onChange={(e) => setBcText(e.target.value)} placeholder="例：22時の巡視は2人で回ります" aria-label="一斉連絡の内容" className="min-w-40 flex-1 rounded border border-rule bg-paper px-1.5 py-0.5" />
                <button
                  type="button"
                  disabled={!bcText.trim()}
                  onClick={() => {
                    p.onBroadcast(bcTo, bcText.trim());
                    setBcText("");
                  }}
                  className="rounded bg-ai px-2 py-0.5 text-xs font-bold text-white disabled:opacity-40"
                >
                  送る
                </button>
              </div>
              {p.notices.length === 0 && <p className="text-ink-faint">お知らせはありません。医師がオーダを変えると、ここと看護師の画面に出ます。</p>}
              {[...p.notices].reverse().map((n) => (
                <article key={n.id} className={`rounded-md border p-2 ${n.readBy.includes(me.name) ? "border-rule-soft" : "border-yamabuki"}`}>
                  <div className="nums flex flex-wrap items-baseline gap-2 text-xs text-ink-soft">
                    <span className="rounded bg-tab px-1 font-bold text-ink">{n.kind}</span>
                    {n.at}　{n.from} → {n.to === "全員" ? "看護師全員" : `${n.to} チーム`}
                    {!n.readBy.includes(me.name) && (
                      <button type="button" onClick={() => p.onReadNotice(n.id)} className="ml-auto rounded border border-rule px-1.5 hover:border-ai hover:text-ai">
                        見た
                      </button>
                    )}
                  </div>
                  <div>{n.text}</div>
                  {n.readBy.length > 0 && <div className="text-[11px] text-ink-faint">見た人：{n.readBy.join("、")}</div>}
                </article>
              ))}
            </div>
          )}

          {tab === "beds" && (
            <div className="space-y-2 text-[13px]">
              <p className="text-xs text-ink-soft">患者情報管理：看護師がベッドごとに救護区分（火災のときの避難の仕方）とつないだセンサーを登録します。呼出や火災のときの一覧に使います。</p>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-rule text-left text-ink-soft">
                    <th className="py-1">ベッド</th>
                    <th>チーム・担当</th>
                    <th>救護区分</th>
                    <th>センサー</th>
                  </tr>
                </thead>
                <tbody>
                  {p.people.map((x) => {
                    const info = p.beds[x.patient.id] ?? { sensors: [] };
                    return (
                      <tr key={x.patient.id} className="border-b border-rule-soft align-top">
                        <td className="py-1">
                          <b>{x.room}</b> {x.patient.name}
                        </td>
                        <td>{teamOf(x.room)} チーム</td>
                        <td>
                          <select value={info.rescue ?? ""} disabled={me.role !== "看護師"} onChange={(e) => p.onBed(x.patient.id, { ...info, rescue: (e.target.value || undefined) as Rescue | undefined })} aria-label={`${x.patient.name} の救護区分`} className="rounded border border-rule bg-paper px-1 py-0.5">
                            <option value="">未登録</option>
                            {RESCUE.map((r) => (
                              <option key={r}>{r}</option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <div className="flex flex-wrap gap-x-2">
                            {SENSORS.map((s) => (
                              <label key={s} className="flex items-center gap-0.5">
                                <input
                                  type="checkbox"
                                  disabled={me.role !== "看護師"}
                                  checked={info.sensors.includes(s)}
                                  onChange={() => p.onBed(x.patient.id, { ...info, sensors: info.sensors.includes(s) ? info.sensors.filter((y) => y !== s) : [...info.sensors, s as Sensor] })}
                                  className="accent-ai"
                                />
                                {s}
                              </label>
                            ))}
                          </div>
                          {info.sensors.length > 0 && (
                            <div className="mt-0.5 flex flex-wrap gap-1">
                              {info.sensors.map((s) => (
                                <button key={s} type="button" onClick={() => p.onRing(x.patient.id, s)} className="rounded border border-shu px-1 text-[11px] text-shu">
                                  デモ：{s}が鳴る
                                </button>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {tab === "schedule" && (
            <div className="text-[13px]">
              <p className="mb-1 text-xs text-ink-soft">今日と明日の入院・退院・移動・外泊・検査・手術を、オーダと病棟の予定からコードで並べます。</p>
              {p.schedule.length === 0 ? (
                <p className="text-ink-faint">予定はありません。</p>
              ) : (
                <table className="w-full text-xs">
                  <tbody>
                    {p.schedule.map((s, i) => (
                      <tr key={i} className="border-b border-rule-soft">
                        <td className="nums w-28 py-1 font-bold">{s.when}</td>
                        <td className="w-36">
                          {s.room} {s.name}
                        </td>
                        <td>{s.what}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {tab === "history" && (
            <div className="space-y-2 text-[13px]">
              <table className="text-xs">
                <thead>
                  <tr className="text-left text-ink-soft">
                    <th className="pr-4">呼出の種類</th>
                    <th className="pr-4">回数</th>
                    <th>応答までの平均</th>
                  </tr>
                </thead>
                <tbody>
                  {callCounts(p.calls).map((c) => (
                    <tr key={c.kind}>
                      <td className="pr-4">{c.kind}</td>
                      <td className="nums pr-4">
                        <span className="inline-block h-2 bg-ai align-middle" style={{ width: `${c.n * 12}px` }} /> {c.n}
                      </td>
                      <td className="nums">{c.avgAnswerMin === null ? "—" : `${c.avgAnswerMin}分`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <ul className="space-y-0.5 text-xs">
                {[...p.calls].reverse().map((c) => (
                  <li key={c.id} className="nums">
                    {c.at} {c.kind}　{c.room} {nameOf(c.patientId)}　{callState(c)}
                    {c.done ? `　${c.done.reason}${c.done.memo ? `：${c.done.memo}` : ""}（${c.done.by}）` : ""}
                  </li>
                ))}
              </ul>
              {p.calls.length === 0 && <p className="text-ink-faint">まだ呼出はありません。</p>}
            </div>
          )}
          <p className="text-[11px] text-ink-faint">ナースコールと院内連絡は補助の手段です。モニタなど医療機器の警報は機器そのものを主に使い、通知だけで判断せず、患者を直接確かめます。患者の注意（転倒・隔離・アレルギー・身体的拘束・DNAR など）はカルテからコードで集めています。機器とはつながっていません（試作）。</p>
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
              {["5階東 ナースステーション", "5階東 廊下・デイルーム", "5階東 トイレ・浴室", "5階東 廊下の AED"].map((x) => (
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
            <div className="flex flex-wrap gap-1.5 text-xs">
              <button type="button" onClick={() => p.onRaise("AED の使用（扉が開いた）", "5階東 廊下の AED")} className="rounded border border-dashed border-shu px-2 py-0.5 text-shu">
                デモ：AED の扉が開いた
              </button>
              <button type="button" onClick={() => p.onRaise("火災（避難）", "5階 東側（火災報知器）")} className="rounded border border-dashed border-shu px-2 py-0.5 text-shu">
                デモ：火災報知器が鳴った
              </button>
            </div>
          </div>
          {[...p.emergencies].reverse().map((e) => (
            <article key={e.id} className={`${card} p-3 text-[13px] ${e.closed ? "" : "border-shu"}`}>
              <div className="font-bold text-shu">{e.kind}</div>
              <div>{e.place}</div>
              <div className="nums text-xs text-ink-soft">
                {e.at} 発信 {e.by}
              </div>
              {e.kind === "火災（避難）" && (
                <div className="mt-1 rounded-md bg-shu-soft p-2 text-xs">
                  <b>避難の介助が要る患者（救護区分から）</b>
                  <div>担送：{ev.carry.map((x) => `${x.room} ${x.name}`).join("、") || "なし"}</div>
                  <div>護送：{ev.escort.map((x) => `${x.room} ${x.name}`).join("、") || "なし"}</div>
                  {ev.unknown.length > 0 && <div className="font-bold text-shu">救護区分が未登録：{ev.unknown.map((x) => `${x.room} ${x.name}`).join("、")}（確かめる）</div>}
                </div>
              )}
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
                  <input value={closing[e.id] ?? ""} onChange={(ev2) => setClosing((m) => ({ ...m, [e.id]: ev2.target.value }))} placeholder="解除のときの経過（例：ROSC、ICU へ）" aria-label="解除の経過" className="min-w-32 flex-1 rounded border border-rule bg-paper px-1.5 py-0.5" />
                  <button type="button" disabled={!(closing[e.id] ?? "").trim()} onClick={() => p.onClose(e.id, closing[e.id].trim())} className="rounded border border-ink px-2 py-0.5 disabled:opacity-40">
                    解除
                  </button>
                </div>
              )}
            </article>
          ))}
          {p.emergencies.length === 0 && <p className="text-sm text-ink-faint">いま出ている緊急通報はありません。</p>}
        </section>
      </div>
    </div>
  );
}
