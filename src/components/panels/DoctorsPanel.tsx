"use client";

// 主治医・担当医・コンサルト医: the doctors of the patient. A doctor adds or removes a 担当医 (on the team) or a
// コンサルト医 (asked by 他科依頼) from the staff list, with who, when and an optional word. The attending is
// changed by 転科, not here. Who may change it follows roles.ts (架空の病院の取り決め). Nothing is suggested.

import { displayText } from "@/lib/display-text";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { DOCTORS } from "@/lib/doctors";
import type { DoctorRole, PatientDoctors } from "@/lib/patient-doctors";
import { CONSULT_DEPTS } from "@/lib/procedures";
import { doctorFor } from "@/lib/ward";
import { DenyNote, useDeny } from "../RoleContext";

export interface DoctorChoice {
  name: string;
  department?: string;
}

/** The doctors one can pick (fictional): the ward's doctors and each consult department's doctor. */
export const DOCTOR_CHOICES: DoctorChoice[] = [
  ...DOCTORS.map((d) => ({ name: d.name, department: d.team.replace(/（.*$/, "") })),
  ...CONSULT_DEPTS.flatMap((dept) => {
    const name = doctorFor(dept);
    return name === dept ? [] : [{ name, department: dept }];
  }),
];

const OTHER = "__other__";

export function DoctorsPanel({
  doctors,
  fmtDay,
  choices = DOCTOR_CHOICES,
  onAdd,
  onRemove,
}: {
  doctors: PatientDoctors;
  fmtDay: (d: number) => string;
  choices?: DoctorChoice[];
  onAdd: (d: { name: string; role: DoctorRole; department?: string; note?: string }) => void;
  onRemove: (name: string, role: DoctorRole) => void;
}) {
  const denied = useDeny()("profile.doctors");
  const [role, setRole] = useState<DoctorRole>("担当医");
  const [pick, setPick] = useState("");
  const [other, setOther] = useState("");
  const [note, setNote] = useState("");
  const chosen = pick === OTHER ? { name: other.trim(), department: undefined } : choices.find((c) => c.name === pick);
  const dup = !!chosen && doctors.others.some((d) => d.name === chosen.name && d.role === role && !d.pending);
  const ready = !!chosen && chosen.name.length > 0 && chosen.name !== doctors.attending && !dup;
  const submit = () => {
    if (!ready || !chosen) return;
    onAdd({ name: chosen.name, role, department: chosen.department, note: note.trim() || undefined });
    setPick("");
    setOther("");
    setNote("");
  };
  const input = "rounded border border-rule bg-paper px-2 py-1 text-sm";

  return (
    <div className="flex flex-col gap-4 text-sm">


      <section>
        <h3 className="mb-1 text-xs font-bold text-ink-soft">いまの医師</h3>
        <ul className="divide-y divide-rule-soft rounded border border-rule bg-sheet">
          <li className="flex items-center gap-3 px-3 py-2">
            <span className="w-24 shrink-0 text-xs font-bold text-ink-soft">主治医</span>
            <span className="font-bold">{doctors.attending}</span>
          </li>
          {doctors.others.map((d) => (
            <li key={`${d.role}:${d.name}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
              <span className={`w-24 shrink-0 text-xs font-bold ${d.pending ? "text-yamabuki" : "text-ink-soft"}`}>
                {d.role}
                {d.pending && <span className="ml-1 font-normal">依頼中</span>}
              </span>
              <span className="font-bold">
                {displayText(d.name)}
                {d.department && !d.name.includes(d.department) && <span className="ml-1 font-normal text-ink-soft">（{d.department}）</span>}
              </span>
              <span className="nums text-xs text-ink-faint">
                {fmtDay(d.since.day)} {d.since.time}　{displayText(d.by)}
                {d.note && <>　{displayText(d.note)}</>}
              </span>
              {!denied && !d.pending && (
                <button type="button" onClick={() => onRemove(d.name, d.role)} className="ml-auto inline-flex items-center gap-1 text-xs text-ink-faint hover:text-shu" title={displayText(`${d.role} ${d.name} を外す`)}>
                  <Trash2 size={12} />
                  外す
                </button>
              )}
            </li>
          ))}
          {!doctors.others.length && <li className="px-3 py-2 text-xs text-ink-faint">担当医・コンサルト医はまだ登録されていません。</li>}
        </ul>
        {doctors.others.some((d) => d.pending) && <p className="mt-1 text-[11px] text-ink-faint">「依頼中」は他科依頼のオーダから自動で載っています。返書が書かれるか、オーダが中止になると変わります。</p>}
      </section>

      <section>
        <h3 className="mb-1 text-xs font-bold text-ink-soft">足す</h3>
        {denied ? (
          <DenyNote action="profile.doctors" />
        ) : (
          <div className="flex flex-wrap items-end gap-2">
            <div role="radiogroup" aria-label="立場" className="flex rounded-md border border-rule p-0.5">
              {(["担当医", "コンサルト医"] as DoctorRole[]).map((r) => (
                <button key={r} type="button" role="radio" aria-checked={role === r} onClick={() => setRole(r)} className={`rounded px-2 py-1 text-xs ${role === r ? "bg-ink text-white" : "text-ink-soft hover:bg-paper"}`}>
                  {r}
                </button>
              ))}
            </div>
            <label className="flex flex-col gap-0.5 text-xs text-ink-soft">
              医師
              <select value={pick} onChange={(e) => setPick(e.target.value)} className={input} aria-label="医師を選ぶ">
                <option value="">選ぶ</option>
                {choices
                  .filter((c) => c.name !== doctors.attending)
                  .map((c) => (
                    <option key={c.name} value={c.name}>
                      {displayText(c.name)}
                      {displayText(c.department && !c.name.includes(c.department) ? `（${c.department}）` : "")}
                    </option>
                  ))}
                <option value={OTHER}>一覧にない医師（名前を入れる）</option>
              </select>
            </label>
            {pick === OTHER && <input value={other} onChange={(e) => setOther(e.target.value)} placeholder="名前（科）" aria-label="医師の名前" className={input} />}
            <label className="flex flex-col gap-0.5 text-xs text-ink-soft">
              一言（任意）
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="例：心房細動の管理について" className={`${input} w-56`} />
            </label>
            <button type="button" disabled={!ready} onClick={submit} className="rounded bg-ink px-3 py-1 text-sm font-bold text-white disabled:opacity-40">
              {role}として足す
            </button>
            {dup && <span className="text-xs text-yamabuki">同じ医師が同じ立場で登録済みです。</span>}
          </div>
        )}

      </section>
    </div>
  );
}

/* Help migration source (references and dynamic wording):
<p >
        担当医（チームで一緒に見る医師）とコンサルト医（他科依頼で意見を求めた医師）を登録すると、その医師の「受け持ち患者」・やること・入院患者一覧の「自分の患者」にこの患者が出ます。主治医は転科で変わります。他科依頼のオーダを確定すると、返書が来るまで依頼先の科の医師が「依頼中」として仮に載り、返書を書いた医師がコンサルト医になります。
      </p>
<p >誰が・いつ足したかが残り、監査ログにも書かれます。誰を足すかは医師が決めます。</p>
*/
