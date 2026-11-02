"use client";

import { Ambulance, BedDouble, Plus, X } from "lucide-react";
import { useState } from "react";
import { bedProblem, formProblems, type AdmitForm } from "@/lib/admission";
import { JTAS_LABEL, type Arrival, type ErPatient, type ErStatus } from "@/lib/er";
import type { Sex } from "@/lib/types";
import { emptyBeds, type WardState } from "@/lib/ward";

interface Props {
  patients: ErPatient[];
  nowAbs: number;
  ward: WardState;
  onRegister: (p: ErPatient) => void;
  onStatus: (id: string, s: ErStatus) => void;
  onAdmit: (er: ErPatient, form: AdmitForm) => void;
  onOpenChart: (patientId: string) => void;
}

const hhmm = (min: number) => {
  const day = Math.floor(min / 1440);
  const m = min - day * 1440;
  return `${day < 0 ? "昨日 " : ""}${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};
const DONE: ErStatus[] = ["帰宅", "入院済"];

/** Emergency department board: who is here, how urgent (as triaged by a nurse), and admission to the ward. */
export function EmergencyBoard({ patients, nowAbs, ward, onRegister, onStatus, onAdmit, onOpenChart }: Props) {
  const [registering, setRegistering] = useState(false);
  const [admitting, setAdmitting] = useState<ErPatient | null>(null);

  const sorted = [...patients].sort((a, b) => {
    const da = DONE.includes(a.status) ? 1 : 0;
    const db = DONE.includes(b.status) ? 1 : 0;
    return da - db || a.jtas - b.jtas || a.arrivedAbs - b.arrivedAbs;
  });
  const active = patients.filter((p) => !DONE.includes(p.status)).length;

  return (
    <section aria-label="救急外来" className="relative flex min-h-0 flex-1 flex-col bg-paper">
      <header className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-rule bg-sheet px-5 py-3">
        <h1 className="flex items-center gap-2 text-lg font-bold">
          <Ambulance size={20} className="text-shu" />
          救急外来
          <span className="rounded border border-dashed border-ink-faint px-1.5 py-0.5 text-[10px] font-normal text-ink-soft">架空</span>
        </h1>
        <p className="nums text-sm text-ink-soft">
          対応中 <b className="text-ink">{active}</b>名・空床 <b className="text-ink">{emptyBeds(ward.beds).length}</b>床（5階東）
        </p>
        <button
          type="button"
          onClick={() => setRegistering(true)}
          className="ml-auto flex items-center gap-1.5 rounded-md bg-ink px-3 py-1.5 text-sm font-bold text-white hover:bg-ink/90"
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
              <th className="px-3 py-2 font-normal">入院</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((p) => {
              const done = DONE.includes(p.status);
              return (
                <tr key={p.id} className={`border-b border-rule-soft align-top ${done ? "text-ink-faint" : "bg-sheet"}`}>
                  <td className="whitespace-nowrap px-3 py-2">
                    <b className={done ? "" : "text-ink"}>{hhmm(p.arrivedAbs)}</b>
                    <div className="text-[11px]">
                      {p.arrival}・{Math.max(0, nowAbs - p.arrivedAbs)}分前
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">
                    <span
                      className={`rounded border px-1.5 py-0.5 text-[12px] font-bold ${
                        done ? "border-rule" : p.jtas <= 2 ? "border-shu/50 bg-shu-soft text-shu" : p.jtas === 3 ? "border-yamabuki/50 bg-yamabuki-soft text-yamabuki" : "border-rule text-ink-soft"
                      }`}
                    >
                      JTAS {p.jtas}　{JTAS_LABEL[p.jtas]}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <div className="text-[10px] text-ink-faint">{p.kana}</div>
                    <b className={done ? "" : "text-ink"}>{p.name}</b>
                    <span className="ml-2 text-[12px]">
                      {p.sex}・{p.age}歳
                    </span>
                    {p.allergies.length > 0 && <div className="text-[11px] font-bold text-shu">アレルギー：{p.allergies.join("、")}</div>}
                  </td>
                  <td className="px-3 py-2">
                    {p.complaint}
                    {p.note && <div className="text-[11px] text-ink-soft">{p.note}</div>}
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
                  <td className="px-3 py-2">
                    {p.admittedAs ? (
                      <button type="button" onClick={() => onOpenChart(p.admittedAs!)} className="text-[12px] font-bold text-ai hover:underline">
                        カルテを開く
                      </button>
                    ) : p.status !== "帰宅" ? (
                      <button
                        type="button"
                        onClick={() => setAdmitting(p)}
                        className={`flex items-center gap-1 rounded-md px-2 py-1 text-[12px] font-bold ${
                          p.status === "入院依頼" ? "bg-ai text-white hover:bg-ai/90" : "border border-ai/40 text-ai hover:bg-ai-soft"
                        }`}
                      >
                        <BedDouble size={14} />
                        入院にする
                      </button>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="px-5 py-3 text-[11px] text-ink-faint">
          患者はすべて架空です。受付で入れた内容はこのブラウザの中だけにあり、サーバーには送りません。保険証の確認などの事務の手続きは、この試作では扱いません。トリアージの段階（JTAS）は看護師が判定して入れるもので、アプリは判定しません。
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
      {admitting && (
        <AdmitDialog
          er={admitting}
          ward={ward}
          onCancel={() => setAdmitting(null)}
          onAdmit={(f) => {
            onAdmit(admitting, f);
            setAdmitting(null);
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

function RegisterDialog({ nowAbs, onCancel, onSave }: { nowAbs: number; onCancel: () => void; onSave: (p: ErPatient) => void }) {
  const [f, setF] = useState({
    name: "",
    kana: "",
    sex: "女" as Sex,
    age: "",
    arrival: "救急車" as Arrival,
    complaint: "",
    jtas: "3",
    bt: "",
    hr: "",
    sbp: "",
    dbp: "",
    rr: "",
    spo2: "",
    height: "",
    weight: "",
    allergies: "",
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const missing = [!f.name.trim() && "氏名", !(Number(f.age) > 0) && "年齢", !f.complaint.trim() && "主訴"].filter(Boolean);

  return (
    <Dialog title="救急外来の受付（架空の患者）" onClose={onCancel}>
      <p className="mb-3 rounded-md bg-yamabuki-soft px-3 py-2 text-[12px] text-yamabuki">名前は架空のものを入れてください。実在の人の情報は入れないでください。</p>
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
          <input value={f.age} onChange={set("age")} inputMode="numeric" className={input} />
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
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                JTAS {n}　{JTAS_LABEL[n as ErPatient["jtas"]]}
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
              arrival: f.arrival,
              arrivedAbs: nowAbs,
              complaint: f.complaint.trim(),
              jtas: Number(f.jtas) as ErPatient["jtas"],
              status: "診察待ち",
              vitals: { bt: num(f.bt), hr: num(f.hr), sbp: num(f.sbp), dbp: num(f.dbp), rr: num(f.rr), spo2: num(f.spo2), o2: "室内気" },
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

function AdmitDialog({ er, ward, onCancel, onAdmit }: { er: ErPatient; ward: WardState; onCancel: () => void; onAdmit: (f: AdmitForm) => void }) {
  const [f, setF] = useState<AdmitForm>({
    diagnosis: "",
    department: "総合診療科",
    heightCm: er.heightCm ?? 0,
    weightKg: er.weightKg ?? 0,
    allergies: er.allergies,
    room: "",
    bed: "",
  });
  const beds = emptyBeds(ward.beds);
  const problems = formProblems(f);

  return (
    <Dialog title={`入院にする：${er.name}（${er.sex}・${er.age}歳）`} onClose={onCancel}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="入院時の病名（医師が入れる）" wide>
          <input value={f.diagnosis} onChange={(e) => setF({ ...f, diagnosis: e.target.value })} className={input} placeholder="例：尿路感染症の疑い" />
        </Field>
        <Field label="診療科">
          <select value={f.department} onChange={(e) => setF({ ...f, department: e.target.value })} className={input}>
            <option>総合診療科</option>
          </select>
        </Field>
        <Field label="主治医">
          <input value="山本（専攻医）" readOnly className={`${input} text-ink-soft`} />
        </Field>
        <Field label="身長 cm">
          <input value={f.heightCm || ""} onChange={(e) => setF({ ...f, heightCm: Number(e.target.value) })} inputMode="decimal" className={input} />
        </Field>
        <Field label="体重 kg">
          <input value={f.weightKg || ""} onChange={(e) => setF({ ...f, weightKg: Number(e.target.value) })} inputMode="decimal" className={input} />
        </Field>
        <Field label="アレルギー（、で区切る）" wide>
          <input
            value={f.allergies.join("、")}
            onChange={(e) => setF({ ...f, allergies: e.target.value.split(/[、,]/).map((a) => a.trim()).filter(Boolean) })}
            className={input}
            placeholder="なし"
          />
        </Field>
      </div>

      <h3 className="mb-1.5 mt-4 text-[12px] font-bold text-ink-soft">ベッド（5階東の空床）</h3>
      <div className="grid grid-cols-4 gap-1.5">
        {beds.map(({ room, bed }) => {
          const problem = bedProblem(ward, room, er.sex);
          const chosen = f.room === room.no && f.bed === bed;
          return (
            <button
              key={`${room.no}${bed}`}
              type="button"
              disabled={!!problem}
              onClick={() => setF({ ...f, room: room.no, bed })}
              title={problem ?? undefined}
              className={`nums rounded-md border px-2 py-1.5 text-left text-[12px] ${
                chosen ? "border-ai bg-ai text-white" : problem ? "cursor-not-allowed border-rule-soft text-ink-faint/60" : "border-rule hover:border-ai"
              }`}
            >
              <b>
                {room.no}
                {bed && `-${bed}`}
              </b>
              <div className={`text-[10px] ${chosen ? "text-white/80" : ""}`}>{problem ?? room.kind}</div>
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex items-center gap-3">
        {problems.length > 0 && <span className="text-[12px] text-yamabuki">{problems.join("・")}</span>}
        <button
          type="button"
          disabled={problems.length > 0}
          onClick={() => onAdmit(f)}
          className="ml-auto rounded-md bg-ai px-5 py-2 text-sm font-bold text-white disabled:bg-ai/40"
        >
          入院を受ける
        </button>
      </div>
      <p className="mt-2 text-[11px] text-ink-faint">受けるとカルテが開きます。入院時の指示は、右の欄に話すか打ってください（例：入院時採血セット、血培2セット、生食500 1日2本 24時間で）。</p>
    </Dialog>
  );
}
