"use client";

import { AlertTriangle, CheckCircle2, CircleDashed, Info } from "lucide-react";
import { useState } from "react";
import { displayText } from "@/lib/display-text";
import type { KisaiCheck } from "@/lib/billing/kisai";
import { KISAI_SOURCES } from "@/lib/billing/kisai-sources";
import { kisaiTarget, PANEL_LABEL, shokiSeriesOf, siLines, unverifiedLines, type KisaiTarget } from "@/lib/billing/kisai-view";
import type { KisaiWorkspace } from "@/lib/billing/kisai-workspace";
import type { ClaimResult } from "@/lib/billing/model";
import type { MonthDocumentation } from "@/lib/billing/month";
import type { collectShokiFacts } from "@/lib/billing/shoki";
import { ShokiPanel } from "./ShokiPanel";
import { TekiyoPanel } from "./TekiyoPanel";

export type KisaiSection = "checks" | "shoki" | "tekiyo";

export interface KisaiPanelProps {
  claim: ClaimResult;
  checks: KisaiCheck[];
  /** サーバーが返す摘要・詳記の結果（計算中は null）。 */
  documentation: MonthDocumentation | null;
  facts: ReturnType<typeof collectShokiFacts>;
  patientId: string;
  month: string;
  /** YYYY-MM-DD. */
  today: string;
  /** 入院日 YYYY-MM-DD. */
  admittedDate: string;
  saved: KisaiWorkspace;
  at: string;
  newId: () => string;
  onSave?: (next: KisaiWorkspace, what: string) => void;
  onOpen?: (t: KisaiTarget) => void;
  section: KisaiSection;
  onSection: (s: KisaiSection) => void;
}

const STATUS: Record<KisaiCheck["status"], { cls: string; icon: typeof Info }> = {
  ある: { cls: "text-wakatake", icon: CheckCircle2 },
  ない: { cls: "text-shu", icon: CircleDashed },
  人が確かめる: { cls: "text-yamabuki", icon: AlertTriangle },
};

const md = (iso?: string) => (iso ? `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}` : "");

/** 算定の「記載・書類」タブ：加算ごとに要る記載・書類の点検。 */
export function KisaiPanel({ claim, checks, documentation, facts, patientId, month, today, admittedDate, saved, at, newId, onSave, onOpen, section, onSection: setSection }: KisaiPanelProps) {
  const required = documentation?.requiredShoki ?? [];
  const confirmed = new Set(shokiSeriesOf(saved.shoki, patientId, month).filter((v) => v.versions.length).flatMap((v) => v.targets.map((t) => t.code)));
  const tabs: { key: KisaiSection; label: string; count: number }[] = [
    { key: "checks", label: "点検", count: checks.filter((c) => c.status === "ない").length },
    { key: "shoki", label: "症状詳記", count: required.filter((r) => !confirmed.has(r.target.code)).length },
    { key: "tekiyo", label: "摘要のコメント", count: (documentation?.tekiyo ?? []).filter((t) => t.status === "人が選ぶ").length },
  ];
  return (
    <div className="space-y-3">
      <div role="tablist" aria-label="記載・書類" className="flex gap-1 text-xs">
        {tabs.map((t) => (
          <button key={t.key} type="button" role="tab" aria-selected={section === t.key} onClick={() => setSection(t.key)} className={`rounded-md border px-2.5 py-1 ${section === t.key ? "border-ai bg-ai-soft font-bold text-ai" : "border-rule bg-paper text-ink-soft hover:text-ink"}`}>
            {t.label}
            {t.count > 0 && <span className="nums ml-1 rounded bg-shu-soft px-1 text-[10px] font-normal text-shu">{t.count}</span>}
          </button>
        ))}
      </div>
      {section === "checks" && <KisaiChecks claim={claim} checks={checks} onOpen={onOpen} />}
      {section === "tekiyo" && documentation && <TekiyoPanel claim={claim} tasks={documentation.tekiyo} saved={saved} patientId={patientId} month={month} today={today} admittedDate={admittedDate} at={at} onSave={onSave} />}
      {section === "shoki" && <ShokiPanel required={required} facts={facts} saved={saved} patientId={patientId} month={month} at={at} newId={newId} onSave={onSave} />}
    </div>
  );
}

export function KisaiChecks({ claim, checks, onOpen }: { claim: ClaimResult; checks: KisaiCheck[]; onOpen?: (t: KisaiTarget) => void }) {
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const toggle = (id: string) => setOpen((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const lines = siLines(claim);
  const unverified = unverifiedLines(claim, checks.flatMap((c) => c.codes));
  return (
    <section aria-label="点検">
      {checks.length === 0 ? (
        <p className="text-xs text-ink-soft">この月の算定に、点検する加算・管理料・指導料はありません。</p>
      ) : (
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="border-b border-rule text-[10px] text-ink-faint">
              <th className="py-1 text-left font-normal">項目</th>
              <th className="py-1 text-left font-normal">要るもの</th>
              <th className="w-56 py-1 text-left font-normal">状態</th>
              <th className="w-28 py-1" />
            </tr>
          </thead>
          <tbody>
            {checks.map((c) => {
              const s = STATUS[c.status];
              const Icon = s.icon;
              const ev = c.evidence[0];
              const target = kisaiTarget(c);
              // 同じ要件に掛かる行（入院料と物価対応料など）は短い名前で1つに。
              const name = c.codes.map((code) => lines.find((l) => l.code === code)?.name ?? code).sort((a, b) => a.length - b.length)[0];
              const isOpen = open.has(c.id);
              const src = KISAI_SOURCES[c.basis.source];
              return (
                <tr key={c.id} data-check={c.id} className="border-b border-rule-soft align-top">
                  <td className="py-1.5 pr-2">
                    {name}
                    <button type="button" aria-label="根拠" aria-expanded={isOpen} title="根拠" onClick={() => toggle(c.id)} className={`ml-1 inline-flex align-[-1px] ${isOpen ? "text-ai" : "text-ink-faint hover:text-ink"}`}>
                      <Info size={11} />
                    </button>
                    {isOpen && (
                      <div className="mt-1 space-y-0.5 text-[10px] leading-snug text-ink-soft">
                        <p>{src.title}（{src.version}）{c.basis.section}：{c.basis.text}</p>
                        <p>{c.reason}</p>
                      </div>
                    )}
                  </td>
                  <td className="py-1.5 pr-2 text-ink-soft">{c.requirement}</td>
                  <td className={`nums py-1.5 pr-2 ${s.cls}`}>
                    <span className="inline-flex items-center gap-1 font-bold">
                      <Icon size={12} />
                      {c.status}
                    </span>
                    {ev && (ev.by || ev.date) && (
                      <span className="ml-1 text-ink-soft">
                        {ev.by ? displayText(ev.by) : ""} {md(ev.date)} {ev.time ?? ""}
                        {c.evidence.length > 1 ? ` ほか${c.evidence.length - 1}件` : ""}
                      </span>
                    )}
                  </td>
                  <td className="py-1 text-right">
                    {onOpen && (
                      <button type="button" onClick={() => onOpen(target)} className={`rounded border px-2 py-0.5 ${ev ? "border-rule bg-sheet text-ink hover:bg-tab" : "border-ai/50 bg-ai-soft font-bold text-ai"}`}>
                        {ev ? "開く" : "作る"}：{PANEL_LABEL[target.panel] ?? target.panel}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {unverified.length > 0 && (
        <details className="mt-2 text-xs text-ink-soft">
          <summary className="cursor-pointer select-none">点検していない算定項目（{unverified.length}件）</summary>
          <ul className="mt-1 columns-2 text-[11px]">{unverified.map((l) => <li key={l.code}>{l.name}<span className="ml-1 text-[10px] text-ink-faint">{l.code}</span></li>)}</ul>
        </details>
      )}
    </section>
  );
}
