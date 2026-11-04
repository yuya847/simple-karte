"use client";

// In the chart: the doctor's view of the patient's rehabilitation — units by day, what was done, the Barthel Index
// over time, the day counts (標準的算定日数・早期リハビリテーション加算) and the state of the 実施計画書. The doctor
// can mark the patient as one who may have 9 units a day (別に厚生労働大臣が定める患者); code does not decide it.

import { auditLog } from "@/lib/audit";
import { BI_DROP_NOTE, biDrops } from "@/lib/barthel";
import { addDays, formatShort, type CalendarDate } from "@/lib/dates";
import { categoryOf, progressOf, rehabPrescriptions, unitsOf, type RehabDesk } from "@/lib/rehab";
import type { HistoryEntry, OrderEntry, Patient } from "@/lib/types";
import { useDeny, useMe } from "../RoleContext";

interface Props {
  patient: Patient;
  entries: HistoryEntry[];
  desk: RehabDesk;
  onDesk: (f: (d: RehabDesk) => RehabDesk) => void;
  today: CalendarDate;
  nowTime: string;
}

export function RehabProgressPanel({ patient, entries, desk, onDesk, today, nowTime }: Props) {
  const me = useMe();
  const deny = useDeny()("rehab.plan");
  const fmt = (d: number) => formatShort(addDays(today, d));
  const rxs = rehabPrescriptions([{ patient, room: patient.room, entries: entries.filter((e): e is OrderEntry => e.kind === "order") }]);
  if (rxs.length === 0) return <p className="text-sm text-ink-faint">リハビリ処方はありません（オーダ › その他 › リハビリ）。</p>;
  const nine = desk.nine[patient.id];
  return (
    <div className="space-y-3 text-[12px]">
      {rxs.map((rx) => {
        const pr = progressOf(desk, rx, 0);
        const cat = categoryOf(rx.order.field);
        const drops = biDrops(pr.bi);
        const maxUnits = Math.max(6, ...pr.units.map((u) => u.units));
        return (
          <section key={rx.orderId} className="space-y-2 rounded-md border border-rule bg-paper p-2">
            <h3 className="flex flex-wrap items-baseline gap-x-2 font-bold">
              {cat.name}
              <span className="font-normal text-ink-soft">
                {rx.order.therapists.join("・")}　目標：{rx.order.goal}
              </span>
            </h3>
            <p>
              標準的算定日数：<b>{pr.standard.dayNo}日目</b>（{cat.countFromText}。{fmt(pr.standard.from)}から、あと{Math.max(0, pr.standard.left)}日）
              {pr.standard.over && <b className="ml-1 text-shu">超えています（1月13単位まで。改善が期待できるなどで続けるかは医師が判断）</b>}
            </p>
            <p>
              早期リハビリテーション加算：{pr.early.points ? `入院${pr.early.dayNo}日目（1単位 ${pr.early.points}点、${fmt(pr.early.until)} まで）` : `期間外（入院${pr.early.dayNo}日目）`}
            </p>
            <p className={pr.plan.state.includes("過ぎた") || pr.plan.state.includes("まだ") ? "font-bold text-yamabuki" : ""}>
              実施計画書：{pr.plan.state}
              {pr.plan.plan && `（${fmt(pr.plan.plan.madeBy.day)} ${pr.plan.plan.madeBy.by}${pr.plan.plan.explained ? `、説明 ${fmt(pr.plan.plan.explained.day)} ${pr.plan.plan.explained.by}` : ""}）`}
              {!pr.plan.plan && pr.started !== null && `　原則 ${fmt(pr.plan.dueBy)}、遅くとも ${fmt(pr.plan.lastBy)} まで`}
            </p>
            <div>
              <h4 className="font-bold">1日の単位（1日{nine ? 9 : 6}単位まで）</h4>
              {pr.units.length === 0 && <p className="text-ink-faint">まだ実施の記録はありません。</p>}
              <ul className="space-y-0.5">
                {pr.units.map((u) => (
                  <li key={u.day} className="flex items-center gap-2">
                    <span className="nums w-20 text-ink-soft">{fmt(u.day)}</span>
                    <span className="inline-block h-2.5 rounded-sm bg-ai" style={{ width: `${(u.units / maxUnits) * 10}rem` }} aria-hidden />
                    <span className="nums">{u.units}単位</span>
                    {u.over > 0 && <b className="text-shu">（{u.over}単位は算定できない）</b>}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h4 className="font-bold">ADL（Barthel Index）</h4>
              {pr.bi.length === 0 ? <p className="text-ink-faint">まだ評価はありません。</p> : <p className="nums">{pr.bi.map((b) => `${fmt(b.day)} ${b.total ?? "—"}点`).join(" → ")}</p>}
              {drops.map((x) => (
                <p key={x.to.id} className="font-bold text-yamabuki">
                  {fmt(x.from.day)} から {fmt(x.to.day)} に {x.drop}点下がっています。{BI_DROP_NOTE}
                </p>
              ))}
            </div>
            <div>
              <h4 className="font-bold">実施の記録</h4>
              <ul className="space-y-0.5">
                {[...pr.sessions].reverse().map((s) => (
                  <li key={s.id}>
                    <span className="nums text-ink-soft">
                      {fmt(s.day)} {s.start}〜{s.end}（{unitsOf(s.start, s.end).units}単位）{s.therapist}・{s.place}
                    </span>
                    　{s.content}
                  </li>
                ))}
              </ul>
            </div>
          </section>
        );
      })}
      <p className="flex flex-wrap items-center gap-2">
        {nine ? (
          <span className="text-ink-soft">
            1日9単位の対象（別に厚生労働大臣が定める患者）と判断：{nine.by}（{fmt(nine.day)} {nine.time}）
          </span>
        ) : (
          <button
            type="button"
            disabled={!!deny}
            title={deny ?? undefined}
            onClick={() => {
              onDesk((d) => ({ ...d, nine: { ...d.nine, [patient.id]: { day: 0, time: nowTime, by: me.name } } }));
              auditLog({ role: me.role, actor: me.name, action: "確定（リハビリ 1日9単位の対象と判断）", patient: patient.name });
            }}
            className="rounded border border-ai px-2 py-0.5 text-ai disabled:opacity-40"
          >
            1日9単位の対象と判断する（医師）
          </button>
        )}
        <span className="hint text-[11px] text-ink-faint">1日9単位まで算定できる患者は、告示（特掲診療料の施設基準等 別表第九の三）に決まっています。当たるかは医師が判断します。</span>
      </p>
    </div>
  );
}
