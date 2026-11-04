"use client";

import { useState } from "react";
import { checkDraft, isReady, type CheckContext, type Draft } from "@/lib/drafts";
import { masterIssues, useMasterLocal, useMasterLog } from "@/lib/master-local";
import { rpLine } from "@/lib/rp";
import { isNarcotic } from "@/lib/drug-class";
import { NARCOTIC_RULES } from "@/lib/narcotics";
import { DenyNote, useDeny } from "./RoleContext";
import { TabChoice } from "./TabChoice";
import { AddRxPanel } from "./panels/AddPanels";
import type { RxPattern } from "@/lib/rx-memory";
import { linesFromDrafts, type RxLine } from "@/lib/national/rx-lines";

export interface OpdRx {
  lines: string[];
  /** The same prescription line by line (drug, 1回量, 用法, 日数), for the 電子処方箋（模擬）. */
  items?: RxLine[];
  by: string;
  at: string;
}
export interface Revisit {
  day: number;
  time: string;
  purpose: string;
  by: string;
}

/**
 * 外来の処方（院外処方せん）と再診予約. The prescription goes through the same checks as on the ward
 * (allergy, the day's maximum…); the doctor answers what is asked and confirms. Next visit: day,
 * time and what it is for, chosen by the doctor.
 */
export function OpdRxPanel({ allergies, nowTime, newId, fmtDay, rx, onRx, memory }: { allergies: string[]; nowTime: string; newId: () => string; fmtDay: (d: number) => string; rx: OpdRx[]; onRx: (lines: string[], items: RxLine[]) => void; memory?: { patterns: RxPattern[]; previous: RxPattern[]; me: string } }) {
  const deny = useDeny()("order");
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [writing, setWriting] = useState(false);
  const ctx: CheckContext = { activeOrders: [], labOrders: [], drafts, nowTime, fmtDay, describe: (o) => o.id, allergies };
  // マスタ管理: an item made 中止 or 非採用 there cannot be prescribed.
  const ml = useMasterLocal();
  const mlog = useMasterLog();
  const issues = drafts.map((d) => [...checkDraft(d, ctx), ...masterIssues(d, ml, mlog)]);
  // 麻薬 cannot go on an 院外処方せん here (NARCOTIC_RULES.outpatient).
  const narcotic = drafts.some((d) => d.kind === "prescription" && d.items.some((it) => !!it.drugCode && isNarcotic(it.drugCode)));
  const ready = drafts.length > 0 && issues.every(isReady) && !narcotic;
  return (
    <div className="space-y-3">
      <section className="rounded-lg border border-rule bg-sheet p-3 text-[13px]">
        <h2 className="mb-2 text-xs font-bold text-ink-soft">外来処方（院外処方せん）</h2>
        {rx.map((r, i) => (
          <div key={i} className="mb-1 rounded bg-paper px-2 py-1 text-[12px]">
            <div className="nums text-[11px] text-ink-faint">
              {r.at} {r.by}
            </div>
            {r.lines.map((l) => (
              <div key={l}>{l}</div>
            ))}
          </div>
        ))}
        {drafts.length > 0 && (
          <ul className="mb-2 space-y-1 text-[12px]">
            {drafts.map((d, i) => (
              <li key={d.id} className="rounded border border-rule-soft px-2 py-1">
                <div className="font-bold">Rp{i + 1}　{rpLine(d)}</div>
                {issues[i]
                  .filter((x) => x.level !== "info")
                  .map((x) => (
                    <div key={x.key} className={x.level === "stop" ? "text-shu" : "text-yamabuki"}>
                      {x.title}：{x.message}
                      {x.choices?.map((c) => (
                        <button key={c.label} type="button" onClick={() => c.apply && setDrafts((ds) => ds.map((y) => (y.id === d.id ? c.apply!(y) : y)))} className="ml-1 rounded border border-rule px-1.5 text-ink hover:border-ai">
                          {c.label}
                        </button>
                      ))}
                    </div>
                  ))}
                <button type="button" onClick={() => setDrafts((ds) => ds.filter((y) => y.id !== d.id))} className="text-[11px] text-ink-faint hover:text-shu">
                  消す
                </button>
              </li>
            ))}
          </ul>
        )}
        {drafts.length > 0 && (
          <button
            type="button"
            disabled={!ready || !!deny}
            onClick={() => {
              onRx(
                drafts.map((d, i) => `Rp${i + 1}　${rpLine(d)}`),
                linesFromDrafts(drafts),
              );
              setDrafts([]);
            }}
            className="mb-2 rounded-md bg-ai px-4 py-1.5 text-sm font-bold text-white disabled:opacity-40"
          >
            処方を確定（{drafts.length} Rp）
          </button>
        )}
        {narcotic && <p className="mb-2 text-[12px] font-bold text-shu">{NARCOTIC_RULES.outpatient}麻薬の Rp を消してください。</p>}
        <DenyNote action="order" />
        {writing ? (
          <AddRxPanel
            newId={newId}
            drafts={drafts}
            memory={memory}
            onAdd={(ds) => {
              setDrafts((x) => [...x, ...ds]);
              setWriting(false);
            }}
          />
        ) : (
          <button type="button" disabled={!!deny} onClick={() => setWriting(true)} className="rounded-md border border-ai px-3 py-1 text-[12px] font-bold text-ai hover:bg-ai-soft disabled:opacity-40">
            処方を書く
          </button>
        )}
      </section>
    </div>
  );
}

/** 再診予約: when (1〜8週間後), the time and what for — chosen by the doctor. */
export function RevisitPanel({ fmtDay, revisit, onRevisit }: { fmtDay: (d: number) => string; revisit?: Revisit; onRevisit: (r: Omit<Revisit, "by">) => void }) {
  const deny = useDeny()("order");
  const [day, setDay] = useState<number | null>(null);
  const [time, setTime] = useState("");
  const [purpose, setPurpose] = useState("");
  return (
    <div className="space-y-3">
      <section className="rounded-lg border border-rule bg-sheet p-3 text-[13px]">
        <h2 className="mb-2 text-xs font-bold text-ink-soft">再診予約</h2>
        {revisit ? (
          <p className="nums">
            {fmtDay(revisit.day)} {revisit.time}　{revisit.purpose}　<span className="text-ink-faint">（{revisit.by}）</span>
          </p>
        ) : (
          <div className="space-y-1.5 text-[12px]">
            <TabChoice
              label="次の受診"
              options={[
                { value: 7, label: "1週間後" },
                { value: 14, label: "2週間後" },
                { value: 28, label: "4週間後" },
                { value: 56, label: "8週間後" },
              ]}
              value={day}
              onChange={setDay}
            />
            <div className="flex items-center gap-1.5">
              <input type="time" value={time} onChange={(e) => setTime(e.target.value)} aria-label="予約の時刻" className="rounded border border-rule bg-paper px-1 py-0.5" />
              <input value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="何のため（例：採血の結果と体重を確かめる）" aria-label="予約の目的" className="flex-1 rounded border border-rule bg-paper px-2 py-0.5" />
            </div>
            <button type="button" disabled={day === null || !time || !purpose.trim() || !!deny} onClick={() => onRevisit({ day: day!, time, purpose: purpose.trim() })} className="rounded-md bg-ai px-3 py-1 font-bold text-white disabled:opacity-40">
              予約を取る
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
