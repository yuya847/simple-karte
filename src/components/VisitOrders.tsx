"use client";

import { FlaskConical, HeartPulse, Radiation } from "lucide-react";
import { useMemo, useState } from "react";
import { checkDraft, isReady, toOrder, type CheckContext, type Draft, type Issue } from "@/lib/drafts";
import { latestCre } from "@/lib/exams";
import { addDays, formatShort, type CalendarDate } from "@/lib/dates";
import { orderLines } from "@/lib/format";
import type { OrderEntry, Patient } from "@/lib/types";
import { DraftCard } from "./DraftCard";
import { AddImagingPanel, AddLabPanel, AddPhysioPanel } from "./panels/AddPanels";
import { useDeny } from "./RoleContext";

type Kind = "lab" | "imaging" | "physio";
const KINDS: { key: Kind; label: string; icon: typeof FlaskConical }[] = [
  { key: "lab", label: "検体検査", icon: FlaskConical },
  { key: "imaging", label: "画像検査", icon: Radiation },
  { key: "physio", label: "生理・内視鏡", icon: HeartPulse },
];

const STATUS_CLASS: Record<string, string> = { 有効: "border-wakatake/40 text-wakatake", 中止: "border-rule text-ink-faint", 実施済: "border-rule text-ink-faint" };

/**
 * 救急外来・外来の受診でのオーダ（検体検査・画像検査・生理検査）と、この受診のオーダ・検査歴の一覧。
 * The same checks and the same order shape as the ward chart (drafts → checkDraft → toOrder); the doctor confirms.
 */
export function VisitOrders({ patient, orders, today, nowTime, newId, me, onConfirm }: { patient: Patient; orders: OrderEntry[]; today: CalendarDate; nowTime: string; newId: () => string; me: string; onConfirm: (entries: OrderEntry[]) => void }) {
  const deny = useDeny();
  const locked = deny("order");
  const [kind, setKind] = useState<Kind | null>(null);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const ctx: CheckContext = useMemo(
    () => ({
      activeOrders: orders.filter((o) => o.status === "有効"),
      labOrders: orders.filter((o) => o.order.type === "lab" && o.status !== "中止"),
      drafts,
      nowTime,
      fmtDay: (d) => formatShort(addDays(today, d)),
      describe: (o) => {
        const { main, detail } = orderLines(o.order, today);
        return `${main}（${detail}）`;
      },
      allergies: patient.allergies,
      patientFacts: { sex: patient.sex, age: patient.age, allergies: patient.allergies, cre: latestCre(patient), heightCm: patient.heightCm || undefined, weightKg: patient.weightKg || undefined, pregnancy: patient.pregnancy ?? null },
      consents: [],
    }),
    [orders, drafts, nowTime, today, patient],
  );
  const issues: Record<string, Issue[]> = useMemo(() => Object.fromEntries(drafts.map((d) => [d.id, checkDraft(d, ctx)])), [drafts, ctx]);
  const allReady = drafts.length > 0 && drafts.every((d) => isReady(issues[d.id] ?? []));
  const add = (d: Draft) => {
    setDrafts((ds) => [...ds, d]);
    setKind(null);
  };
  const confirm = () => {
    if (!allReady) return;
    const added: OrderEntry[] = [];
    for (const d of drafts) {
      const r = toOrder(d, ctx);
      for (const o of [...(r.order ? [r.order] : []), ...(r.orders ?? [])]) added.push({ kind: "order", id: newId(), day: 0, time: nowTime, author: me, status: "有効", order: o });
    }
    onConfirm(added);
    setDrafts([]);
  };
  const sorted = [...orders].sort((a, b) => b.day - a.day || b.time.localeCompare(a.time));

  return (
    <div className="space-y-4 text-[13px]">
      <section>
        <h3 className="mb-1.5 text-sm font-bold">オーダを出す</h3>
        {locked ? (
          <p className="text-[12px] text-ink-soft">{locked}</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {KINDS.map((k) => {
              const Icon = k.icon;
              const on = kind === k.key;
              return (
                <button key={k.key} type="button" aria-pressed={on} onClick={() => setKind(on ? null : k.key)} className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1 ${on ? "border-ai bg-ai text-white" : "border-rule bg-sheet hover:border-ai"}`}>
                  <Icon size={14} />
                  {k.label}
                </button>
              );
            })}
          </div>
        )}
        {kind === "lab" && <div className="mt-2 rounded-md border border-rule bg-paper p-2"><AddLabPanel onAdd={add} newId={newId} /></div>}
        {kind === "imaging" && <div className="mt-2 rounded-md border border-rule bg-paper p-2"><AddImagingPanel onAdd={add} newId={newId} /></div>}
        {kind === "physio" && <div className="mt-2 rounded-md border border-rule bg-paper p-2"><AddPhysioPanel onAdd={add} newId={newId} /></div>}
        {drafts.length > 0 && (
          <div className="mt-2 space-y-2">
            <h4 className="text-xs font-bold text-ink-soft">下書き（{drafts.length}件）</h4>
            {drafts.map((d) => (
              <div key={d.id} className="space-y-1">
                <DraftCard draft={d} issues={issues[d.id] ?? []} ctx={ctx} onApply={(next) => setDrafts((ds) => ds.map((x) => (x.id === d.id ? next : x)))} onRemove={() => setDrafts((ds) => ds.filter((x) => x.id !== d.id))} />
                {(d.kind === "imaging" || d.kind === "physio") && (
                  <label className="flex items-center gap-2 text-[12px] text-ink-soft">
                    検査の目的
                    <input
                      value={d.purpose ?? ""}
                      placeholder="例：息苦しさ。心不全の疑い"
                      onChange={(e) => setDrafts((ds) => ds.map((x) => (x.id === d.id ? { ...x, purpose: e.target.value || null } : x)))}
                      className="flex-1 rounded border border-rule bg-sheet px-2 py-1 text-[13px] text-ink outline-none focus:border-ai"
                    />
                  </label>
                )}
              </div>
            ))}
            <button type="button" disabled={!allReady} onClick={confirm} className="w-full rounded-md bg-ai px-3 py-2 font-bold text-white disabled:opacity-40">
              確定（{nowTime}　{me}）
            </button>
            <p className="hint text-[11px] text-ink-faint">確定すると、この受診のオーダになり、検査室の受付と結果の表に入ります。病棟のカルテと同じ確認（重複・アレルギー・造影剤の腎機能など）が働きます。</p>
          </div>
        )}
      </section>

      <section>
        <h3 className="mb-1.5 text-sm font-bold">この受診のオーダ・検査歴（{orders.length}件）</h3>
        {sorted.length === 0 ? (
          <p className="text-[12px] text-ink-faint">まだオーダはありません。</p>
        ) : (
          <ul className="space-y-1.5">
            {sorted.map((e) => {
              const { main, detail } = orderLines(e.order, today);
              const kindLabel = e.order.type === "lab" ? "検体検査" : e.order.type === "imaging" ? "画像検査" : e.order.type === "physio" ? "生理・内視鏡" : e.order.type === "injection" ? "注射" : e.order.type === "prescription" ? "内服" : "処置";
              return (
                <li key={e.id} className="rounded-md border border-rule-soft bg-paper/60 px-2.5 py-1.5">
                  <div className="nums flex items-center gap-2 text-[11px] text-ink-faint">
                    <span>
                      {formatShort(addDays(today, e.day))} {e.time}
                    </span>
                    <span className="font-bold text-ink-soft">{kindLabel}</span>
                    <span>{e.author}</span>
                    <span className={`ml-auto rounded border px-1 ${STATUS_CLASS[e.status] ?? "border-rule text-ink-faint"}`}>{e.status}</span>
                  </div>
                  <div className="nums">{main}</div>
                  {detail && <div className="nums text-xs text-ink-soft">{detail}</div>}
                </li>
              );
            })}
          </ul>
        )}
        <p className="mt-1 text-[11px] text-ink-faint">検体検査の結果は「検査結果」、画像は「放射線画像」で見ます。</p>
      </section>
    </div>
  );
}
