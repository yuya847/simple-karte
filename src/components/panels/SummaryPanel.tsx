"use client";

import { Printer } from "lucide-react";
import { useState } from "react";
import { createPortal, flushSync } from "react-dom";
import { DESTINATIONS, type Destination, type SummarySection } from "@/lib/summary";
import { ageSex } from "@/lib/person";
import type { Patient } from "@/lib/types";
import { useMe } from "../RoleContext";
import { TabChoice } from "../TabChoice";

/**
 * 連携サマリ（看護サマリ）: the facts gathered from the record by code, the destination and the
 * writer's own words, on one sheet to print or hand over. Nothing is written by AI.
 */
export function SummaryPanel({ patient, facts, today, nowTime, onSave }: { patient: Patient; facts: SummarySection[]; today: string; nowTime: string; onSave: (to: Destination, words: string) => void }) {
  const me = useMe();
  const [to, setTo] = useState<Destination | null>(null);
  const [words, setWords] = useState("");
  const [printing, setPrinting] = useState(false);
  const title = me.role === "看護師" ? "看護サマリ" : "連携サマリ";
  const sheet = (
    <article className="space-y-2 text-[12px] leading-relaxed print:text-[10.5pt]">
      <header className="border-b border-rule pb-1">
        <h2 className="text-base font-bold">
          {title}
          {to && <span className="ml-2 text-sm font-normal">宛先：{to}</span>}
        </h2>
        <p className="nums text-ink-soft">
          {patient.name}（{patient.kana}）　{ageSex(patient)}　ID {patient.id}　{patient.ward} {patient.room}号室　主治医 {patient.attending}　作成 {today} {nowTime} {me.name}
        </p>
      </header>
      {facts.map((s) => (
        <section key={s.heading}>
          <h3 className="font-bold text-ink-soft">{s.heading}</h3>
          <ul className="pl-3">
            {s.lines.map((l, i) => (
              <li key={i} className={l === "記録なし" ? "text-ink-faint" : ""}>
                {l}
              </li>
            ))}
          </ul>
        </section>
      ))}
      <section>
        <h3 className="font-bold text-ink-soft">申し送り（{me.name}）</h3>
        <p className="whitespace-pre-wrap pl-3">{words || "—"}</p>
      </section>
      <p className="text-[10px] text-ink-faint">項目はカルテの記録からコードで集めたもの（架空の患者）。申し送りは書いた人の言葉です。</p>
    </article>
  );
  const print = () => {
    flushSync(() => setPrinting(true));
    const done = () => {
      setPrinting(false);
      window.removeEventListener("afterprint", done);
    };
    window.addEventListener("afterprint", done);
    window.print();
  };
  return (
    <div className="space-y-3 text-[13px]">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-ink-soft">宛先</span>
        <TabChoice label="サマリの宛先" options={DESTINATIONS.map((d) => ({ value: d, label: d }))} value={to} onChange={setTo} />
      </div>
      <textarea value={words} onChange={(e) => setWords(e.target.value)} rows={4} placeholder="申し送り（自分の言葉で：本人・家族の希望、介護で気をつけること、続けてほしいケアなど）" aria-label="申し送り" className="w-full rounded border border-rule bg-paper px-2 py-1" />
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={!to} onClick={() => to && onSave(to, words.trim())} className="rounded-md bg-ai px-4 py-1.5 font-bold text-white disabled:opacity-40">
          {title}を確定（記録に残す）
        </button>
        <button type="button" disabled={!to} onClick={print} className="flex items-center gap-1 rounded-md border border-rule px-3 py-1.5 disabled:opacity-40">
          <Printer size={14} />
          印刷
        </button>
        {!to && <span className="text-[12px] text-yamabuki">宛先を選んでください</span>}
      </div>
      <div className="rounded-md border border-rule bg-sheet p-3">{sheet}</div>
      {printing && typeof document !== "undefined" && createPortal(<div className="hidden bg-white p-6 text-ink print:block">{sheet}</div>, document.body)}
    </div>
  );
}
