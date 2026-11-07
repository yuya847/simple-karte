"use client";

// 情報収集の上：患者さんの入力（スマートフォン・病棟の iPad）を項目ごとに並べ、看護師が確かめて（直して）確定すると
// 入院時の情報収集の新しい版になる（誰がいつ、元は患者さんの入力）。病棟の iPad を患者さんに渡す入口もここ。

import { displayText } from "@/lib/display-text";
import { Tablet } from "lucide-react";
import { useState } from "react";
import { ANAMNESIS_SECTIONS, anamnesisChanges, emptyAnamnesis, type AnamnesisFields, type AnamnesisRecord } from "@/lib/anamnesis";
import { confirmEntry, pendingIntakes, readInbox, type PortalInboxEntry } from "@/lib/portal/inbox";
import { intakeRows, intakeToFields, type IntakeAnswers, type IntakeItem } from "@/lib/portal/intake";
import { useDeny, useMe } from "../RoleContext";
import { PortalHandover } from "./PortalHandover";

const input = "w-full rounded border border-rule bg-sheet px-1.5 py-0.5 text-[13px] outline-none focus:border-ai";
const chip = (on: boolean) => `rounded-md border px-2 py-0.5 text-[12px] pointer-coarse:py-1.5 ${on ? "border-wakatake bg-wakatake font-bold text-white" : "border-rule bg-sheet text-ink-soft hover:text-ink"}`;
const FORM = ANAMNESIS_SECTIONS.flatMap((s) => s.fields);

/** What the patient's answer goes into (the 情報収集's own choices, not only the patient's). */
function Edit({ item, value, onChange, disabled }: { item: IntakeItem; value: string | string[] | undefined; onChange: (v: string | string[]) => void; disabled: boolean }) {
  const f = FORM.find((x) => x.key === item.key);
  if (f?.type === "one")
    return (
      <div role="radiogroup" aria-label={item.staff} className="flex flex-wrap gap-1">
        {f.options.map((o) => (
          <button key={o} type="button" role="radio" aria-checked={value === o} disabled={disabled} onClick={() => onChange(value === o ? "" : o)} className={chip(value === o)}>
            {o}
          </button>
        ))}
      </div>
    );
  if (f?.type === "many") {
    const on = Array.isArray(value) ? value : [];
    return (
      <div role="group" aria-label={item.staff} className="flex flex-wrap gap-1">
        {f.options.map((o) => (
          <button key={o} type="button" aria-pressed={on.includes(o)} disabled={disabled} onClick={() => onChange(on.includes(o) ? on.filter((x) => x !== o) : [...on, o])} className={chip(on.includes(o))}>
            {o}
          </button>
        ))}
      </div>
    );
  }
  const text = typeof value === "string" ? value : "";
  return item.type === "long" ? <textarea value={text} disabled={disabled} rows={2} aria-label={item.staff} onChange={(e) => onChange(e.target.value)} className={`${input} resize-y`} /> : <input value={text} disabled={disabled} aria-label={item.staff} onChange={(e) => onChange(e.target.value)} className={input} />;
}

function Review({ entry, record, allergies, locked, onConfirm, onOpenProfile }: { entry: PortalInboxEntry; record?: AnamnesisRecord; allergies: string[]; locked: boolean; onConfirm: (a: IntakeAnswers, edited: boolean) => void; onOpenProfile: () => void }) {
  const me = useMe();
  const sent = entry.answers ?? {};
  const [a, setA] = useState<IntakeAnswers>(sent);
  const edited = JSON.stringify(a) !== JSON.stringify(sent);
  const rows = intakeRows(sent, record?.fields);
  return (
    <section aria-label="患者さんの入力" className="rounded-lg border border-yamabuki/50 bg-yamabuki-soft/40 p-2.5 text-[13px]">
      <h3 className="mb-1.5 flex flex-wrap items-baseline gap-2 text-sm font-bold">
        患者さんの入力
        <span className="nums text-xs font-normal text-ink-soft">
          {entry.at.time}　{entry.via}
        </span>
      </h3>
      <table className="w-full border-collapse">
        <thead>
          <tr className="text-left text-[11px] text-ink-faint">
            <th className="w-[9rem] py-0.5 font-normal">項目</th>
            <th className="py-0.5 font-normal">患者さんの答え</th>
            <th className="w-[28%] py-0.5 pl-2 font-normal">いまの記録</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ item, now }) => (
            <tr key={item.key} className="border-t border-rule-soft align-top">
              <td className="py-1 pr-2 text-[12px] text-ink-soft">{item.staff}</td>
              <td className="py-1">
                <Edit item={item} value={a[item.key]} disabled={locked} onChange={(v) => setA({ ...a, [item.key]: v })} />
              </td>
              <td className="py-1 pl-2 text-[12px] text-ink-soft">
                {item.key === "allergy" ? (
                  <>
                    {displayText(allergies.join("、") || "なし")}
                    <button type="button" onClick={onOpenProfile} className="ml-1 text-ai underline">
                      プロファイル
                    </button>
                  </>
                ) : (
                  displayText(now || "—")
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-2 flex justify-end">
        <button type="button" disabled={locked} onClick={() => onConfirm(a, edited)} className="rounded-md bg-wakatake px-3 py-1 text-xs font-bold text-white disabled:opacity-40">
          {edited ? "直して確定" : "この答えで確定"}（{me.name}）
        </button>
      </div>
    </section>
  );
}

const startFields = (record?: AnamnesisRecord): AnamnesisFields => record?.fields ?? emptyAnamnesis();

export function PortalIntake({
  patient,
  record,
  inbox,
  onInbox,
  onSave,
  nowTime,
  newId,
  onOpenProfile,
}: {
  patient: { id: string; name: string; allergies: string[] };
  record?: AnamnesisRecord;
  inbox: unknown;
  onInbox: (f: (all: PortalInboxEntry[]) => PortalInboxEntry[]) => void;
  /** A new version of 入院時の情報収集 (the reason for an update, and where it came from). */
  onSave: (fields: AnamnesisFields, reason: string, origin: string) => void;
  nowTime: string;
  newId: () => string;
  onOpenProfile: () => void;
}) {
  const me = useMe();
  const locked = !!useDeny()("anamnesis");
  const [handover, setHandover] = useState(false);
  const pending = pendingIntakes(readInbox(inbox), patient.id);
  const confirm = (e: PortalInboxEntry, a: IntakeAnswers, edited: boolean) => {
    if (locked) return;
    const origin = `患者さんの入力（${e.via} ${e.at.time}）`;
    const fields = intakeToFields(startFields(record), a);
    if (!record || anamnesisChanges(record.fields, fields).length) onSave(fields, `${origin}を${edited ? "直して" : ""}確定`, origin);
    onInbox((all) => confirmEntry(readInbox(all), e.id, me.name, { day: 0, time: nowTime }, edited));
  };
  return (
    <div className="mb-3 space-y-2">
      <div className="flex justify-end">
        <button type="button" disabled={locked} onClick={() => setHandover(true)} className="flex items-center gap-1.5 rounded-md border border-rule px-2.5 py-1 text-xs hover:border-ai hover:text-ai disabled:opacity-40">
          <Tablet size={13} />
          患者さんに入力してもらう
        </button>
      </div>
      {pending.map((e) => (
        <Review key={e.id} entry={e} record={record} allergies={patient.allergies} locked={locked} onConfirm={(a, edited) => confirm(e, a, edited)} onOpenProfile={onOpenProfile} />
      ))}
      {handover && (
        <PortalHandover
          name={patient.name}
          onExit={() => setHandover(false)}
          onSend={(answers) => onInbox((all) => [...readInbox(all), { id: newId(), patientId: patient.id, kind: "intake", at: { day: 0, time: nowTime }, iso: new Date().toISOString(), via: "病棟の iPad", answers }])}
        />
      )}
    </div>
  );
}
