"use client";

// 入院のときの質問: the same screen on the patient's phone and on the ward's iPad handed to the patient. Large
// targets, the patient's words; the answers keep the 情報収集 form's values (lib/portal/intake.ts).

import { INTAKE_SECTIONS, type IntakeAnswers, type IntakeItem } from "@/lib/portal/intake";

const box = "w-full rounded-lg border border-rule bg-sheet px-3 py-2.5 text-[17px] outline-none focus:border-ai";
const chip = (on: boolean) => `min-h-11 rounded-full border px-4 py-2 text-[16px] ${on ? "border-ai bg-ai font-bold text-white" : "border-rule bg-sheet text-ink"}`;

function Field({ item, value, onChange }: { item: IntakeItem; value: string | string[] | undefined; onChange: (v: string | string[] | undefined) => void }) {
  if (item.type === "one")
    return (
      <div role="radiogroup" aria-label={item.label} className="flex flex-wrap gap-2">
        {item.options!.map((o) => (
          <button key={o.value} type="button" role="radio" aria-checked={value === o.value} onClick={() => onChange(value === o.value ? undefined : o.value)} className={chip(value === o.value)}>
            {o.label}
          </button>
        ))}
      </div>
    );
  if (item.type === "many") {
    const on = Array.isArray(value) ? value : [];
    return (
      <div role="group" aria-label={item.label} className="flex flex-wrap gap-2">
        {item.options!.map((o) => (
          <button key={o.value} type="button" aria-pressed={on.includes(o.value)} onClick={() => onChange(on.includes(o.value) ? on.filter((x) => x !== o.value) : [...on, o.value])} className={chip(on.includes(o.value))}>
            {o.label}
          </button>
        ))}
      </div>
    );
  }
  const text = typeof value === "string" ? value : "";
  return item.type === "long" ? (
    <textarea value={text} onChange={(e) => onChange(e.target.value)} rows={3} aria-label={item.label} maxLength={600} className={`${box} resize-y`} />
  ) : (
    <input value={text} onChange={(e) => onChange(e.target.value)} aria-label={item.label} maxLength={100} className={box} />
  );
}

export function IntakeForm({ value, onChange }: { value: IntakeAnswers; onChange: (v: IntakeAnswers) => void }) {
  return (
    <div className="space-y-5">
      {INTAKE_SECTIONS.map((s) => (
        <section key={s.title} className="space-y-4 rounded-xl border border-rule bg-sheet/60 p-4">
          <h3 className="text-[18px] font-bold">{s.title}</h3>
          {s.items.map((item) => (
            <div key={item.key} className="space-y-2">
              <div className="text-[16px] text-ink-soft">{item.label}</div>
              <Field item={item} value={value[item.key]} onChange={(v) => onChange({ ...value, [item.key]: v })} />
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
