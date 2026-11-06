"use client";

import { displayText } from "@/lib/display-text";
import { Ambulance, PhoneCall, Plus, X } from "lucide-react";
import { useState } from "react";
import type { AdmissionRequest } from "@/lib/admission";
import type { CalendarDate } from "@/lib/dates";
import { CLAUDE, auditLog } from "@/lib/audit";
import { JTAS_LABEL, REASSESS_MIN, erFeeHint, reassessIn, type Arrival, type ErPatient, type ErStatus, type Jtas } from "@/lib/er";
import type { Sex } from "@/lib/types";
import { emptyBeds, type WardState } from "@/lib/ward";
import { ageSex } from "@/lib/person";

interface Props {
  patients: ErPatient[];
  nowAbs: number;
  ward: WardState;
  today: CalendarDate;
  onRegister: (p: ErPatient) => void;
  /** Replace a patient's row (arrival of a pre-announced ambulance, re-triage). */
  onUpdate: (p: ErPatient) => void;
  onStatus: (id: string, s: ErStatus) => void;
  onOpenChart: (patientId: string) => void;
  /** Open the patient's own tab (受診の画面: 記録と入院申込). */
  onOpenVisit: (id: string) => void;
  /** 入院申込 made for each ED patient. */
  requests: Record<string, AdmissionRequest | undefined>;
}

const hhmm = (min: number) => {
  const day = Math.floor(min / 1440);
  const m = min - day * 1440;
  return `${day < 0 ? "昨日 " : ""}${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};
const DONE: ErStatus[] = ["帰宅", "入院済"];

/** Emergency department board: who is here and how urgent (as triaged by a nurse). Each name opens the patient's tab. */
export function EmergencyBoard({ patients, nowAbs, ward, today, onRegister, onUpdate, onStatus, onOpenChart, onOpenVisit, requests }: Props) {
  const [registering, setRegistering] = useState(false);
  const [arriving, setArriving] = useState<ErPatient | null>(null);
  const [calling, setCalling] = useState(false);
  const [retriage, setRetriage] = useState<string | null>(null);

  const sorted = [...patients].sort((a, b) => {
    const da = DONE.includes(a.status) ? 1 : 0;
    const db = DONE.includes(b.status) ? 1 : 0;
    return da - db || (a.jtas ?? 0) - (b.jtas ?? 0) || a.arrivedAbs - b.arrivedAbs;
  });
  const active = patients.filter((p) => !DONE.includes(p.status)).length;

  return (
    <section aria-label="救急外来" className="relative flex min-h-0 flex-1 flex-col bg-paper">
      <header className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-rule bg-sheet px-5 py-3">
        <h1 className="flex items-center gap-2 text-lg font-bold">
          <Ambulance size={20} className="text-shu" />
          救急外来

        </h1>
        <p className="nums text-sm text-ink-soft">
          対応中 <b className="text-ink">{active}</b>名・空床 <b className="text-ink">{emptyBeds(ward.beds).length}</b>床（5階東）
        </p>
        <button
          type="button"
          onClick={() => setCalling(true)}
          className="ml-auto flex items-center gap-1.5 rounded-md border border-shu/60 bg-sheet px-3 py-1.5 text-sm font-bold text-shu hover:bg-shu-soft"
        >
          <PhoneCall size={15} />
          救急隊から（受入要請）
        </button>
        <button
          type="button"
          onClick={() => setRegistering(true)}
          className="flex items-center gap-1.5 rounded-md bg-ink px-3 py-1.5 text-sm font-bold text-white hover:bg-ink/90"
        >
          <Plus size={15} />
          受付
        </button>
      </header>

      <div className="scroll-thin min-h-0 flex-1 overflow-auto">
        <table className="nums w-full min-w-[1100px] border-collapse text-[13px]">
          <thead className="sticky top-0 z-10 bg-paper text-left text-[11px] text-ink-faint shadow-[0_1px_0_var(--color-rule)]">
            <tr>
              <th className="px-3 py-2 font-normal">来院</th>
              <th className="px-3 py-2 font-normal">トリアージ（看護師）</th>
              <th className="px-3 py-2 font-normal">氏名</th>
              <th className="px-3 py-2 font-normal">主訴</th>
              <th className="px-3 py-2 font-normal">来院時バイタル</th>
              <th className="px-3 py-2 font-normal">状態</th>
              <th className="px-3 py-2 font-normal">入院申込</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((p) => {
              const done = DONE.includes(p.status);
              return (
                <tr key={p.id} className={`border-b border-rule-soft align-top ${done ? "text-ink-faint" : "bg-sheet"}`}>
                  <td className="px-3 py-2">
                    <b className={done ? "" : "text-ink"}>{hhmm(p.arrivedAbs)}</b>
                    <div className="whitespace-nowrap text-[11px]">
                      {p.status === "搬送中" ? (
                        <span className="font-bold text-shu">到着予定・あと{Math.max(0, p.arrivedAbs - nowAbs)}分</span>
                      ) : (
                        <>
                          {p.arrival}・{Math.max(0, nowAbs - p.arrivedAbs)}分前
                        </>
                      )}
                    </div>
                    {p.status !== "搬送中" && (() => {
                      const h = erFeeHint(p, today);
                      return h ? (
                        <div className="mt-0.5 max-w-52 text-[10px] leading-tight text-ink-faint" title="救急外来医学管理料（B001-2-6、令和8年度）。この試作は外来の算定をしません。">
                          {h.item}：{displayText(h.note)}
                        </div>
                      ) : null;
                    })()}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">
                    {p.jtas ? (
                      <span
                        className={`rounded border px-1.5 py-0.5 text-[12px] font-bold ${
                          done ? "border-rule" : p.jtas <= 2 ? "border-shu/50 bg-shu-soft text-shu" : p.jtas === 3 ? "border-yamabuki/50 bg-yamabuki-soft text-yamabuki" : "border-rule text-ink-soft"
                        }`}
                      >
                        JTAS {p.jtas}　{JTAS_LABEL[p.jtas]}
                      </span>
                    ) : (
                      <span className="text-[12px] text-ink-faint">未判定（到着前）</span>
                    )}
                    <Reassess p={p} nowAbs={nowAbs} />
                    {!done && p.jtas && p.status !== "搬送中" && (
                      retriage === p.id ? (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {([1, 2, 3, 4, 5] as Jtas[]).map((n) => (
                            <button
                              key={n}
                              type="button"
                              onClick={() => {
                                onUpdate({ ...p, jtas: n, triagedAbs: nowAbs, triageLog: [...(p.triageLog ?? [{ abs: p.triagedAbs ?? p.arrivedAbs, jtas: p.jtas! }]), { abs: nowAbs, jtas: n }] });
                                setRetriage(null);
                              }}
                              className="rounded border border-rule bg-sheet px-1.5 text-[11px] hover:border-ai hover:text-ai"
                            >
                              {n}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <button type="button" onClick={() => setRetriage(p.id)} className="mt-1 block text-[11px] text-ai hover:underline">
                          再判定を入れる（看護師）
                        </button>
                      )
                    )}
                    {p.triageLog && p.triageLog.length > 1 && (
                      <div className="mt-0.5 text-[10px] text-ink-faint">{p.triageLog.map((t) => `${hhmm(t.abs)} ${t.jtas}`).join(" → ")}</div>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="text-[10px] text-ink-faint">{p.kana}</div>
                    <button type="button" onClick={() => onOpenVisit(p.id)} title="この患者のタブを開く（記録・入院申込）" className={`font-bold hover:underline ${done ? "" : "text-ai"}`}>
                      {p.name}
                    </button>
                    <span className="ml-2 text-[12px]">
                      {ageSex(p)}
                    </span>
                    {p.hotline && (
                      <div className="text-[11px] text-ink-soft">
                        救急隊：{[p.hotline.jcs && `意識 ${p.hotline.jcs}`, p.hotline.history].filter(Boolean).join("　")}
                      </div>
                    )}
                    {p.allergies.length > 0 && <div className="text-[11px] font-bold text-shu">アレルギー：{p.allergies.join("、")}</div>}
                  </td>
                  <td className="px-3 py-2">
                    {p.complaint}
                    {p.note && <div className="text-[11px] text-ink-soft">{displayText(p.note)}</div>}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-[12px]">
                    {p.vitals && (
                      <>
                        <div>
                          BT {p.vitals.bt?.toFixed(1)}　HR {p.vitals.hr}　BP {p.vitals.sbp}/{p.vitals.dbp}
                        </div>
                        <div className="text-ink-soft">
                          RR {p.vitals.rr}　SpO2 {p.vitals.spo2}%（{p.vitals.o2 ?? "室内気"}）
                        </div>
                      </>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {p.status === "入院済" ? (
                      <span>入院済</span>
                    ) : p.status === "搬送中" ? (
                      <button type="button" onClick={() => setArriving(p)} className="rounded-md bg-shu px-2 py-1 text-[12px] font-bold text-white">
                        到着・受付
                      </button>
                    ) : (
                      <select
                        value={p.status}
                        onChange={(e) => onStatus(p.id, e.target.value as ErStatus)}
                        aria-label={`${p.name} の状態`}
                        className="rounded border border-rule bg-sheet px-1 py-0.5 text-[12px]"
                      >
                        {(["診察待ち", "診察中", "入院依頼", "帰宅"] as ErStatus[]).map((s) => (
                          <option key={s}>{s}</option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td className="px-3 py-2 text-[12px]">
                    {p.admittedAs ? (
                      <button type="button" onClick={() => onOpenChart(p.admittedAs!)} className="font-bold text-ai hover:underline">
                        入院済・カルテを開く
                      </button>
                    ) : requests[p.id]?.status === "申込" ? (
                      <button type="button" onClick={() => onOpenVisit(p.id)} className="text-left font-bold text-yamabuki hover:underline">
                        入院申込済
                        <span className="block font-normal">{requests[p.id]!.ward}・ベッド待ち</span>
                      </button>
                    ) : p.status !== "帰宅" && p.status !== "搬送中" ? (
                      <button type="button" onClick={() => onOpenVisit(p.id)} className="text-ink-soft hover:text-ai hover:underline">
                        開く
                      </button>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="px-5 py-3 text-[11px] text-ink-faint">
          受付で入れた内容はこのブラウザの中だけにあり、サーバーには送りません。保険証の確認などの事務の手続きは、この試作では扱いません。トリアージの段階（JTAS）は看護師が判定して入れるもので、アプリは判定しません。アプリは前の判定からの時間を数え、再評価の目安（緊急15分・準緊急30分・低緊急60分・非緊急120分）を過ぎたら赤で出します。救急外来医学管理料の欄は、来院の仕方と時刻からコードで出した目安です（外来の算定はこの試作では行いません）。
        </p>
      </div>

      {registering && (
        <RegisterDialog
          nowAbs={nowAbs}
          onCancel={() => setRegistering(false)}
          onSave={(p) => {
            onRegister(p);
            setRegistering(false);
          }}
        />
      )}
      {arriving && (
        <RegisterDialog
          nowAbs={nowAbs}
          initial={arriving}
          onCancel={() => setArriving(null)}
          onSave={(p) => {
            onUpdate({ ...p, id: arriving.id, hotline: arriving.hotline });
            setArriving(null);
          }}
        />
      )}
      {calling && (
        <HotlineDialog
          nowAbs={nowAbs}
          onCancel={() => setCalling(false)}
          onSave={(p) => {
            onRegister(p);
            setCalling(false);
          }}
        />
      )}
    </section>
  );
}

function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 z-30 flex items-start justify-center bg-ink/30 pt-[6vh]" onClick={onClose}>
      <div role="dialog" aria-label={title} className="w-[min(640px,94%)] rounded-xl border border-rule bg-sheet shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-rule px-4 py-2.5">
          <h2 className="font-bold">{title}</h2>
          <button type="button" onClick={onClose} aria-label="閉じる" className="rounded p-1 text-ink-faint hover:bg-paper hover:text-ink">
            <X size={16} />
          </button>
        </div>
        <div className="max-h-[75vh] overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <label className={`flex flex-col gap-1 text-[12px] text-ink-soft ${wide ? "col-span-2" : ""}`}>
      {label}
      {children}
    </label>
  );
}

const input = "rounded-md border border-rule bg-sheet px-2 py-1.5 text-[13px] text-ink outline-none focus:border-ai";
const num = (s: string) => (s.trim() === "" ? undefined : Number(s));

function RegisterDialog({ nowAbs, initial, onCancel, onSave }: { nowAbs: number; initial?: ErPatient; onCancel: () => void; onSave: (p: ErPatient) => void }) {
  const v = initial?.vitals;
  const str = (x?: number) => (x === undefined ? "" : String(x));
  const [f, setF] = useState({
    name: "",
    kana: "",
    sex: (initial?.sex ?? "女") as Sex,
    age: str(initial?.age ?? undefined),
    ageMonths: str(initial?.ageMonths),
    arrival: (initial?.arrival ?? "救急車") as Arrival,
    complaint: initial?.complaint ?? "",
    // A new arrival has no level until the nurse picks one.
    jtas: "",
    bt: str(v?.bt),
    hr: str(v?.hr),
    sbp: str(v?.sbp),
    dbp: str(v?.dbp),
    rr: str(v?.rr),
    spo2: str(v?.spo2),
    height: "",
    weight: "",
    allergies: "",
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const young = f.age.trim() !== "" && Number(f.age) <= 3;
  const missing = [!f.name.trim() && "氏名", (f.age.trim() === "" || !(Number(f.age) >= 0)) && "年齢", !f.complaint.trim() && "主訴", !f.jtas && "トリアージ"].filter(Boolean);

  return (
    <Dialog title={initial ? "到着・受付（救急隊の情報を下書きにしています）" : "救急外来の受付"} onClose={onCancel}>
      <p className="mb-3 rounded-md bg-yamabuki-soft px-3 py-2 text-[12px] text-yamabuki">実在の人の情報は入れないでください。</p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="氏名">
          <input value={f.name} onChange={set("name")} className={input} />
        </Field>
        <Field label="カナ">
          <input value={f.kana} onChange={set("kana")} className={input} />
        </Field>
        <Field label="性別">
          <select value={f.sex} onChange={set("sex")} className={input}>
            <option>女</option>
            <option>男</option>
          </select>
        </Field>
        <Field label="年齢">
          <span className="flex items-center gap-1">
            <input value={f.age} onChange={set("age")} inputMode="numeric" className={input} />歳
            {young && (
              <>
                <input value={f.ageMonths} onChange={set("ageMonths")} inputMode="numeric" aria-label="月齢（カ月）" className={`${input} w-12`} />
                カ月
              </>
            )}
          </span>
        </Field>
        <Field label="来院方法">
          <select value={f.arrival} onChange={set("arrival")} className={input}>
            <option>救急車</option>
            <option>独歩</option>
            <option>紹介</option>
          </select>
        </Field>
        <Field label="トリアージ（看護師が判定した JTAS）">
          <select value={f.jtas} onChange={set("jtas")} className={input}>
            <option value="">（看護師が選ぶ）</option>
            {([1, 2, 3, 4, 5] as Jtas[]).map((n) => (
              <option key={n} value={n}>
                JTAS {n}　{JTAS_LABEL[n]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="主訴" wide>
          <input value={f.complaint} onChange={set("complaint")} className={input} />
        </Field>
        <div className="col-span-2 grid grid-cols-6 gap-2">
          {(
            [
              ["bt", "BT ℃"],
              ["hr", "HR"],
              ["sbp", "BP 上"],
              ["dbp", "BP 下"],
              ["rr", "RR"],
              ["spo2", "SpO2 %"],
            ] as const
          ).map(([k, l]) => (
            <Field key={k} label={l}>
              <input value={f[k]} onChange={set(k)} inputMode="decimal" className={input} />
            </Field>
          ))}
        </div>
        <Field label="身長 cm">
          <input value={f.height} onChange={set("height")} inputMode="decimal" className={input} />
        </Field>
        <Field label="体重 kg">
          <input value={f.weight} onChange={set("weight")} inputMode="decimal" className={input} />
        </Field>
        <Field label="アレルギー（、で区切る）" wide>
          <input value={f.allergies} onChange={set("allergies")} className={input} />
        </Field>
      </div>
      <div className="mt-4 flex items-center gap-3">
        {missing.length > 0 && <span className="text-[12px] text-yamabuki">{missing.join("・")}を入れてください</span>}
        <button
          type="button"
          disabled={missing.length > 0}
          onClick={() =>
            onSave({
              id: `er-${Date.now()}`,
              name: f.name.trim(),
              kana: f.kana.trim(),
              sex: f.sex,
              age: Number(f.age),
              ...(young && f.ageMonths.trim() !== "" ? { ageMonths: Number(f.ageMonths) } : {}),
              arrival: f.arrival,
              arrivedAbs: nowAbs,
              complaint: f.complaint.trim(),
              jtas: Number(f.jtas) as Jtas,
              triagedAbs: nowAbs,
              status: "診察待ち",
              vitals: { bt: num(f.bt), hr: num(f.hr), sbp: num(f.sbp), dbp: num(f.dbp), rr: num(f.rr), spo2: num(f.spo2), o2: initial?.vitals?.o2 ?? "室内気" },
              heightCm: num(f.height),
              weightKg: num(f.weight),
              allergies: f.allergies.split(/[、,]/).map((a) => a.trim()).filter(Boolean),
            })
          }
          className="ml-auto rounded-md bg-ink px-5 py-2 text-sm font-bold text-white disabled:bg-ink/30"
        >
          受け付ける
        </button>
      </div>
    </Dialog>
  );
}

function Reassess({ p, nowAbs }: { p: ErPatient; nowAbs: number }) {
  const left = reassessIn(p, nowAbs);
  if (left === null || !p.jtas) return null;
  if (p.jtas === 1) return <div className="mt-0.5 text-[11px] font-bold text-shu">継続して観察</div>;
  return (
    <div className={`mt-0.5 text-[11px] ${left < 0 ? "font-bold text-shu" : "text-ink-soft"}`} title={`JTAS ${p.jtas}：${REASSESS_MIN[p.jtas]}分ごとに再評価（目安）`}>
      {left < 0 ? `再評価 ${-left}分超過` : `再評価まで あと${left}分`}
    </div>
  );
}

const SAMPLE_CALL = "救急隊です。80代男性、自宅で呼吸苦の訴え。血圧160の90、脈110、呼吸数30、サチュレーション88、リザーバー10Lで95まで上がっています。体温37.4度、意識はJCS1桁。心不全で通院中、ラシックス内服。あと10分で着きます。";

interface Call {
  age?: number;
  sex?: Sex;
  complaint: string;
  vitals: ErPatient["vitals"];
  jcs?: string;
  eta?: number;
  history?: string;
}

/** The crew's phone report → items (Claude copies what was said) → a pre-arrival row. */
function HotlineDialog({ nowAbs, onCancel, onSave }: { nowAbs: number; onCancel: () => void; onSave: (p: ErPatient) => void }) {
  const [text, setText] = useState("");
  const [call, setCall] = useState<Call | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const read = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/hotline", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `エラー（${res.status}）`);
      auditLog({ role: "AI", actor: CLAUDE, action: "救急隊の連絡を項目に写した", detail: json.call.complaint });
      setCall(json.call);
    } catch (e) {
      setError(e instanceof Error ? e.message : "読み取れませんでした。");
    } finally {
      setBusy(false);
    }
  };
  const v = call?.vitals;
  return (
    <Dialog title="救急隊からの受入要請" onClose={onCancel}>
      <p className="mb-2 text-[12px] text-ink-soft">電話で聞いたことを打つか話して、Claude で項目に分けます。Claude は言われたことを写すだけで、緊急度は決めません（トリアージは到着後に看護師が入れます）。氏名は入れないでください。</p>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} className={`${input} w-full`} placeholder="例：80代男性、呼吸苦。血圧160の90、脈110、SpO2 88…あと10分" />
      <div className="mt-2 flex items-center gap-2">
        <button type="button" onClick={() => setText(SAMPLE_CALL)} className="rounded border border-rule px-2 py-1 text-[12px] text-ink-soft">
          例文
        </button>
        <button type="button" disabled={!text.trim() || busy} onClick={read} className="rounded bg-ai px-3 py-1.5 text-sm font-bold text-white disabled:opacity-40">
          {busy ? "読み取り中…" : "Claude で項目にする"}
        </button>
        {error && <span className="text-[12px] text-shu">{error}</span>}
      </div>
      {call && (
        <div className="mt-3 rounded-md border border-rule bg-paper p-3 text-[13px]">
          <div>
            <b>{ageSex(call)}</b>　{call.complaint}
          </div>
          <div className="nums text-ink-soft">
            BT {v?.bt ?? "—"}　HR {v?.hr ?? "—"}　BP {v?.sbp ?? "—"}/{v?.dbp ?? "—"}　RR {v?.rr ?? "—"}　SpO2 {v?.spo2 ?? "—"}%{v?.o2 ? `（${v.o2}）` : ""}
          </div>
          <div className="text-ink-soft">
            意識 {call.jcs ?? "—"}　既往・内服 {call.history ?? "—"}
          </div>
          <div className="mt-1 font-bold text-shu">到着予定：{call.eta ? `あと${call.eta}分` : "言われていません"}</div>
          <button
            type="button"
            onClick={() =>
              onSave({
                id: `er-${Date.now()}`,
                name: "（到着前）",
                kana: "",
                sex: call.sex ?? "男",
                age: call.age ?? 0,
                arrival: "救急車",
                arrivedAbs: nowAbs + (call.eta ?? 0),
                complaint: call.complaint,
                status: "搬送中",
                vitals: call.vitals,
                allergies: [],
                hotline: { eta: call.eta ?? 0, jcs: call.jcs, history: call.history },
              })
            }
            className="mt-2 rounded-md bg-shu px-4 py-1.5 text-sm font-bold text-white"
          >
            受け入れる（搬送中として一覧に入れる）
          </button>
        </div>
      )}
    </Dialog>
  );
}
