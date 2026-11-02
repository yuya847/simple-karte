"use client";

import { Search } from "lucide-react";
import { useState } from "react";
import { newProcedureDraft, type Draft, type LabDraft } from "@/lib/drafts";
import { DRUGS, LAB_TESTS, ORDER_SETS, WARD_RULES } from "@/lib/master";
import { PROCEDURES, findProcDrug } from "@/lib/procedures";

/** Browse the injection master. Picking a drug puts its name into the instruction box to finish by voice or keys. */
export function AddInjectionPanel({ onPick }: { onPick: (text: string) => void }) {
  const [q, setQ] = useState("");
  const list = DRUGS.filter((d) => !q || [d.name, ...d.aliases].some((a) => a.includes(q)));
  return (
    <div>
      <label className="mb-3 flex items-center gap-2 rounded-md border border-rule px-2 py-1.5">
        <Search size={14} className="text-ink-faint" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="薬の名前・略称" className="flex-1 bg-transparent text-sm outline-none" autoFocus />
      </label>
      <p className="mb-2 text-xs text-ink-soft">選ぶと指示の欄に名前が入ります。量・回数・速度は続けて話すか打ってください。</p>
      <ul className="divide-y divide-rule-soft">
        {list.map((d) => (
          <li key={d.code}>
            <button type="button" onClick={() => onPick(d.aliases[0] ?? d.name)} className="nums flex w-full items-baseline gap-2 px-1 py-2 text-left text-sm hover:bg-paper">
              <span className="font-bold">{d.name}</span>
              <span className="text-xs text-ink-soft">{d.package}</span>
              <span className="ml-auto text-[11px] text-ink-faint">{d.aliases.slice(0, 3).join("・")}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Pick lab sets/tests and a draw time. Becomes a draft that goes through the same checks. */
export function AddLabPanel({ onAdd, newId }: { onAdd: (d: Draft) => void; newId: () => string }) {
  const [picked, setPicked] = useState<string[]>([]);
  const toggle = (code: string) => setPicked((p) => (p.includes(code) ? p.filter((c) => c !== code) : [...p, code]));

  const make = (when: "now" | "morning_routine"): LabDraft => ({
    id: newId(),
    origin: "manual",
    sourceText: "（マスターから選択）",
    comment: null,
    kind: "lab",
    tests: picked.map((code) => ({ code, said: code })),
    collect: { day: when === "now" ? 0 : 1, when, time: null, beforeDose: null },
    priority: null,
    cultureSets: null,
    duplicateOk: false,
  });

  const row = (code: string, name: string, sub?: string) => (
    <label key={code} className="flex cursor-pointer items-baseline gap-2 px-1 py-1.5 text-sm hover:bg-paper">
      <input type="checkbox" checked={picked.includes(code)} onChange={() => toggle(code)} className="accent-ai" />
      <span className="font-bold">{name}</span>
      {sub && <span className="truncate text-[11px] text-ink-faint">{sub}</span>}
    </label>
  );

  return (
    <div className="space-y-4">
      <section>
        <h3 className="mb-1 text-xs font-bold text-ink-soft">院内セット（架空の病院）</h3>
        {ORDER_SETS.map((s) => row(s.code, s.name, s.labCodes.map((c) => LAB_TESTS.find((t) => t.code === c)?.name).join("、")))}
      </section>
      <section>
        <h3 className="mb-1 text-xs font-bold text-ink-soft">項目</h3>
        {LAB_TESTS.map((t) => row(t.code, t.name, t.specimen))}
      </section>
      <div className="sticky bottom-0 flex gap-2 border-t border-rule bg-sheet pt-3">
        <button type="button" disabled={!picked.length} onClick={() => onAdd(make("now"))} className="flex-1 rounded-md border border-ai px-3 py-2 text-sm text-ai disabled:opacity-40">
          今すぐ（至急）
        </button>
        <button type="button" disabled={!picked.length} onClick={() => onAdd(make("morning_routine"))} className="flex-1 rounded-md bg-ai px-3 py-2 text-sm font-bold text-white disabled:opacity-40">
          明日朝の定時（{WARD_RULES.routineDrawTime}）
        </button>
      </div>
    </div>
  );
}

/**
 * Pick a procedure from the master. It becomes a draft right away; the checks ask for what the
 * item needs (器具・流量、部位・範囲・深さ、回数), each with choices for the doctor.
 */
export function AddProcedurePanel({ onAdd, newId }: { onAdd: (d: Draft) => void; newId: () => string }) {
  return (
    <div>
      <p className="mb-2 text-xs text-ink-soft">選ぶと右に下書きができます。足りないところ（流量・部位・範囲・回数など）は下書きの上で選ぶか、話して足してください。</p>
      <ul className="divide-y divide-rule-soft">
        {PROCEDURES.map((p) => (
          <li key={p.code}>
            <button type="button" onClick={() => onAdd(newProcedureDraft(p.code, newId()))} className="flex w-full items-baseline gap-2 px-1 py-2 text-left text-sm hover:bg-paper">
              <span className="font-bold">{p.name}</span>
              {p.uses && <span className="text-xs text-ink-soft">{findProcDrug(p.uses.code)?.name}</span>}
              <span className="ml-auto truncate text-[11px] text-ink-faint">{p.aliases.slice(0, 3).join("・")}</span>
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[11px] text-ink-faint">処置の項目と院内の取り決めは架空の病院のものです。算定のコードと点数は公式の医科診療行為マスターから読みます。</p>
    </div>
  );
}
