"use client";

import { BedDouble, X } from "lucide-react";
import { useState } from "react";
import { REQUEST_WARDS, requestProblems, type AdmissionRequest } from "@/lib/admission";
import { JTAS_LABEL, type ErPatient, type ErStatus } from "@/lib/er";
import { OPD_STATUSES, type OpdPatient } from "@/lib/opd";
import { ageSex } from "@/lib/person";
import { DenyNote, useDeny, useMe } from "./RoleContext";
import { TabChoice } from "./TabChoice";

export type Visit = { kind: "er"; er: ErPatient } | { kind: "opd"; op: OpdPatient };

export interface VisitNote {
  text: string;
  at: string;
  by: string;
}

interface Props {
  visit: Visit;
  nowTime: string;
  fmtDay: (d: number) => string;
  notes: VisitNote[];
  onNote: (text: string) => void;
  request?: AdmissionRequest;
  onRequest: (r: AdmissionRequest) => void;
  onCancelRequest: (id: string) => void;
  onOpenChart: (patientId: string) => void;
  onStatus: (s: string) => void;
  newId: () => string;
  /** More order tools on the right (外来処方・再診予約 …), each with a short summary for the main area. */
  extraTools?: { key: string; label: string; icon: typeof BedDouble; panel: React.ReactNode; summary?: React.ReactNode; wide?: boolean }[];
}

const ER_STATUSES: ErStatus[] = ["診察待ち", "診察中", "入院依頼", "帰宅"];

/**
 * The tab of one patient in 救急外来 or 外来: what is known of the visit, today's record, and the
 * 入院申込 (the ward takes it and decides the bed). The doctor writes; nothing is chosen for them.
 */
export function VisitChart({ visit, nowTime, fmtDay, notes, onNote, request, onRequest, onCancelRequest, onOpenChart, onStatus, newId, extraTools = [] }: Props) {
  const me = useMe();
  const p = visit.kind === "er" ? visit.er : visit.op;
  const [text, setText] = useState("");
  // The order tool open on the right (入院申込, 外来処方, 再診予約), like the tools of a ward chart.
  const [tool, setTool] = useState<string | null>(null);
  const admittedAs = request?.admittedAs ?? (visit.kind === "er" ? visit.er.admittedAs : undefined);
  const status = visit.kind === "er" ? visit.er.status : visit.op.status;

  const requestStatus = admittedAs ? (
    <div className="space-y-2">
      <p className="font-bold text-wakatake">入院しました。</p>
      <button type="button" onClick={() => onOpenChart(admittedAs)} className="rounded-md border border-ai px-3 py-1.5 font-bold text-ai hover:bg-ai-soft">
        病棟のカルテを開く
      </button>
    </div>
  ) : request && request.status === "申込" ? (
    <div className="space-y-2">
      <p className="font-bold text-yamabuki">申込済み・病棟でベッドを決めるのを待っています</p>
      <dl className="grid grid-cols-[6rem_1fr] gap-y-1 text-[12px]">
        <dt className="text-ink-faint">区分・予定</dt>
        <dd className="nums">
          {request.urgency}　{fmtDay(request.when.day)} {request.when.time ?? "（時刻は病棟と調整）"}
        </dd>
        <dt className="text-ink-faint">病棟・部屋</dt>
        <dd>
          {request.ward}・{request.roomWish}
        </dd>
        <dt className="text-ink-faint">病名・目的</dt>
        <dd>
          {request.diagnosis}・{request.purpose}
        </dd>
        <dt className="text-ink-faint">安静度・感染</dt>
        <dd>
          {request.rest}・{request.isolation}
        </dd>
        <dt className="text-ink-faint">申込</dt>
        <dd className="nums">
          {request.at.time}　{request.by}
        </dd>
      </dl>
      <button type="button" onClick={() => onCancelRequest(request.id)} className="text-[12px] text-ink-faint hover:text-shu">
        申込を取り消す
      </button>
    </div>
  ) : null;
  const tools = [
    {
      key: "admit",
      label: "入院申込",
      icon: BedDouble,
      panel:
        requestStatus ??
        <RequestForm
          visit={visit}
          me={me.name}
          nowTime={nowTime}
          newId={newId}
          onCancel={() => setTool(null)}
          onSend={(r) => {
            onRequest(r);
            setTool(null);
          }}
        />,
      summary: requestStatus,
    },
    ...extraTools,
  ];
  const open = tools.find((t) => t.key === tool);

  return (
    <div className="flex min-h-0 flex-1">
    <div className="scroll-thin min-h-0 flex-1 overflow-y-auto bg-paper">
      <header className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-rule bg-sheet px-5 py-3">
        <div>
          <div className="text-[11px] text-ink-faint">{p.kana}</div>
          <h1 className="text-lg font-bold">
            {p.name}
            <span className="ml-2 text-sm font-normal text-ink-soft">{ageSex(p)}</span>
          </h1>
        </div>
        <span className="rounded border border-dashed border-ink-faint px-1.5 py-0.5 text-[10px] text-ink-soft">架空</span>
        <span className="text-sm text-ink-soft">{visit.kind === "er" ? "救急外来" : `外来・${visit.op.department}（${visit.op.kind}）`}</span>
        {p.allergies.length > 0 && <span className="text-sm font-bold text-shu">アレルギー：{p.allergies.join("、")}</span>}
        <label className="ml-auto flex items-center gap-1.5 text-sm text-ink-soft">
          状態
          <select value={status} onChange={(e) => onStatus(e.target.value)} disabled={status === "入院済" || status === "搬送中"} className="rounded border border-rule bg-sheet px-1.5 py-1 text-sm">
            {(visit.kind === "er" ? (status === "入院済" || status === "搬送中" ? [status] : ER_STATUSES) : OPD_STATUSES).map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
      </header>

      <div className="grid gap-4 px-5 py-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <section className="rounded-lg border border-rule bg-sheet p-3 text-[13px]">
            <h2 className="mb-2 text-xs font-bold text-ink-soft">受診</h2>
            {visit.kind === "er" ? <ErFacts er={visit.er} /> : <OpdFacts op={visit.op} fmtDay={fmtDay} />}
          </section>

          <section className="rounded-lg border border-rule bg-sheet p-3 text-[13px]">
            <h2 className="mb-2 text-xs font-bold text-ink-soft">今日の記録</h2>
            {notes.length === 0 ? (
              <p className="text-ink-faint">まだありません。</p>
            ) : (
              <ul className="space-y-2">
                {notes.map((n, i) => (
                  <li key={i} className="whitespace-pre-wrap border-l-2 border-ai/40 pl-2">
                    <div className="nums text-[11px] text-ink-faint">
                      {n.at}　{n.by}
                    </div>
                    {n.text}
                  </li>
                ))}
              </ul>
            )}
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && text.trim()) {
                  e.preventDefault();
                  onNote(text.trim());
                  setText("");
                }
              }}
              rows={5}
              placeholder={"S）\nO）\nA）\nP）"}
              aria-label="今日の記録"
              className="mt-3 w-full rounded-md border border-rule bg-paper px-2 py-1.5 outline-none focus:border-ai"
            />
            <button
              type="button"
              disabled={!text.trim()}
              onClick={() => {
                onNote(text.trim());
                setText("");
              }}
              className="mt-1 rounded-md bg-ai px-4 py-1.5 text-sm font-bold text-white disabled:opacity-40"
            >
              記録を確定（⌘Enter）
            </button>
          </section>
        </div>

        <div className="space-y-4">
          {tools.filter((t) => t.summary).map((t) => (
            <section key={t.key} className="rounded-lg border border-rule bg-sheet p-3 text-[13px]">
              <h2 className="mb-2 flex items-center gap-1.5 text-xs font-bold text-ink-soft">
                <t.icon size={14} />
                {t.label}
              </h2>
              {t.summary}
            </section>
          ))}
          {!tools.some((t) => t.summary) && <p className="text-[12px] text-ink-faint">入院申込・処方・再診予約などは、右端のオーダの列から出します。</p>}
        </div>
      </div>
    </div>
    {open && (
      <aside aria-label={open.label} className={`scroll-thin min-h-0 shrink-0 overflow-y-auto border-l border-rule bg-sheet p-3 text-[13px] ${"wide" in open && open.wide ? "w-[min(56rem,72vw)]" : "w-[min(32rem,48vw)]"}`}>
        <div className="mb-2 flex items-center gap-2">
          <open.icon size={16} className="text-ai" />
          <h2 className="font-bold">{open.label}</h2>
          <button type="button" onClick={() => setTool(null)} aria-label="閉じる" className="ml-auto rounded p-1 text-ink-faint hover:text-ink">
            <X size={16} />
          </button>
        </div>
        {open.panel}
      </aside>
    )}
    <nav aria-label="オーダ" className="scroll-thin flex w-16 shrink-0 flex-col items-stretch gap-1 overflow-y-auto border-l border-rule bg-paper px-1 py-2">
      <div className="mb-1 text-center text-[10px] text-ink-faint">オーダ</div>
      {tools.map((t) => (
        <button
          key={t.key}
          type="button"
          aria-pressed={tool === t.key}
          onClick={() => setTool(tool === t.key ? null : t.key)}
          className={`flex w-full flex-col items-center gap-0.5 rounded-md px-1 py-1.5 text-[10px] leading-tight pointer-coarse:py-2.5 ${tool === t.key ? "bg-ink font-bold text-white" : "text-ink-soft hover:bg-sheet hover:text-ink"}`}
        >
          <t.icon size={18} />
          {t.label}
        </button>
      ))}
    </nav>
    </div>
  );
}

function ErFacts({ er }: { er: ErPatient }) {
  const v = er.vitals;
  return (
    <dl className="grid grid-cols-[6rem_1fr] gap-y-1 text-[12px]">
      <dt className="text-ink-faint">来院</dt>
      <dd>{er.arrival}</dd>
      <dt className="text-ink-faint">主訴</dt>
      <dd>{er.complaint}</dd>
      <dt className="text-ink-faint">トリアージ</dt>
      <dd>{er.jtas ? `JTAS ${er.jtas}　${JTAS_LABEL[er.jtas]}（看護師の判定）` : "未判定"}</dd>
      {v && (
        <>
          <dt className="text-ink-faint">来院時</dt>
          <dd className="nums">
            BT {v.bt?.toFixed(1)}　HR {v.hr}　BP {v.sbp}/{v.dbp}　RR {v.rr}　SpO2 {v.spo2}%（{v.o2 ?? "室内気"}）
          </dd>
        </>
      )}
      {er.hotline && (
        <>
          <dt className="text-ink-faint">救急隊</dt>
          <dd>{[er.hotline.jcs && `意識 ${er.hotline.jcs}`, er.hotline.history].filter(Boolean).join("　")}</dd>
        </>
      )}
      {er.note && (
        <>
          <dt className="text-ink-faint">申し送り</dt>
          <dd>{er.note}</dd>
        </>
      )}
    </dl>
  );
}

function OpdFacts({ op, fmtDay }: { op: OpdPatient; fmtDay: (d: number) => string }) {
  const v = op.vitals;
  return (
    <dl className="grid grid-cols-[6rem_1fr] gap-y-1 text-[12px]">
      <dt className="text-ink-faint">予約・受付</dt>
      <dd className="nums">
        {op.slot ?? "予約外"}　{op.arrived ? `受付 ${op.arrived}` : "未受付"}
      </dd>
      <dt className="text-ink-faint">受診の理由</dt>
      <dd>{op.reason}</dd>
      {op.referral && (
        <>
          <dt className="text-ink-faint">紹介状</dt>
          <dd>{op.referral}</dd>
        </>
      )}
      {v && (
        <>
          <dt className="text-ink-faint">今日の測定</dt>
          <dd className="nums">{[v.bt !== undefined && `BT ${v.bt.toFixed(1)}`, v.sbp !== undefined && `BP ${v.sbp}/${v.dbp}`, v.hr !== undefined && `HR ${v.hr}`, v.spo2 !== undefined && `SpO2 ${v.spo2}%`].filter(Boolean).join("　")}</dd>
        </>
      )}
      <dt className="text-ink-faint">病名</dt>
      <dd>{op.problems.join("、") || "—"}</dd>
      <dt className="text-ink-faint">処方中</dt>
      <dd>{op.meds.length ? op.meds.map((m) => <div key={m}>{m}</div>) : "—"}</dd>
      <dt className="text-ink-faint">前回まで</dt>
      <dd>{op.visits.length ? op.visits.map((x) => <div key={x.day}>{fmtDay(x.day)}　{x.text}</div>) : "—"}</dd>
    </dl>
  );
}

/** 入院申込の欄. Every choice is the doctor's; nothing is preselected except what the record already says (身長・体重・アレルギー). */
function RequestForm({ visit, me, nowTime, newId, onCancel, onSend }: { visit: Visit; me: string; nowTime: string; newId: () => string; onCancel: () => void; onSend: (r: AdmissionRequest) => void }) {
  const deny = useDeny()("er.admit");
  const p = visit.kind === "er" ? visit.er : visit.op;
  const [f, setF] = useState({
    urgency: null as AdmissionRequest["urgency"] | null,
    day: null as number | null,
    time: "",
    ward: null as string | null,
    roomWish: null as AdmissionRequest["roomWish"] | null,
    isolation: null as AdmissionRequest["isolation"] | null,
    rest: null as AdmissionRequest["rest"] | null,
    diagnosis: "",
    purpose: "",
    heightCm: p.heightCm ?? 0,
    weightKg: p.weightKg ?? 0,
    allergies: p.allergies,
    note: "",
  });
  const set = (x: Partial<typeof f>) => setF((c) => ({ ...c, ...x }));
  const missing = [
    !f.urgency && "区分",
    f.day === null && "入院予定日",
    !f.ward && "病棟",
    !f.roomWish && "部屋",
    !f.isolation && "感染対策",
    !f.rest && "安静度",
    ...requestProblems(f),
  ].filter((x): x is string => !!x);
  const input = "w-full rounded border border-rule bg-paper px-2 py-1 outline-none focus:border-ai";
  const row = (label: string, el: React.ReactNode) => (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="w-20 shrink-0 text-[12px] text-ink-soft">{label}</span>
      {el}
    </div>
  );
  const send = () => {
    if (missing.length || deny) return;
    onSend({
      id: newId(),
      from: { kind: visit.kind, id: p.id },
      name: p.name,
      kana: p.kana,
      sex: p.sex,
      age: p.age,
      ...(p.ageMonths !== undefined ? { ageMonths: p.ageMonths } : {}),
      diagnosis: f.diagnosis.trim(),
      department: visit.kind === "opd" ? visit.op.department : "総合診療科",
      attending: me,
      urgency: f.urgency!,
      when: { day: f.day!, time: f.time || null },
      ward: f.ward!,
      roomWish: f.roomWish!,
      isolation: f.isolation!,
      rest: f.rest!,
      purpose: f.purpose.trim(),
      heightCm: f.heightCm,
      weightKg: f.weightKg,
      allergies: f.allergies,
      note: f.note.trim(),
      status: "申込",
      by: me,
      at: { day: 0, time: nowTime },
    });
  };
  return (
    <div className="space-y-2 text-[12px]">
      {row("区分", <TabChoice label="入院の区分" options={(["緊急", "予定"] as const).map((x) => ({ value: x, label: x }))} value={f.urgency} onChange={(v) => set({ urgency: v })} />)}
      {row(
        "入院予定日",
        <>
          <TabChoice
            label="入院予定日"
            options={[
              { value: 0, label: "今日" },
              { value: 1, label: "明日" },
              { value: 2, label: "あさって" },
              { value: 7, label: "1週間後" },
            ]}
            value={f.day}
            onChange={(v) => set({ day: v })}
          />
          <input type="time" value={f.time} onChange={(e) => set({ time: e.target.value })} aria-label="入院予定の時刻" className="rounded border border-rule bg-paper px-1 py-0.5" />
        </>,
      )}
      {row("病棟", <TabChoice label="希望の病棟" options={REQUEST_WARDS.map((w) => ({ value: w, label: w }))} value={f.ward} onChange={(v) => set({ ward: v })} />)}
      {row("部屋", <TabChoice label="部屋の希望" options={(["個室", "大部屋", "どちらでも"] as const).map((x) => ({ value: x, label: x }))} value={f.roomWish} onChange={(v) => set({ roomWish: v })} />)}
      {row("感染対策", <TabChoice label="感染対策" options={(["なし", "接触予防策", "飛沫予防策", "空気予防策"] as const).map((x) => ({ value: x, label: x }))} value={f.isolation} onChange={(v) => set({ isolation: v })} />)}
      {row("安静度", <TabChoice label="安静度" options={(["ベッド上", "車いす", "歩行可"] as const).map((x) => ({ value: x, label: x }))} value={f.rest} onChange={(v) => set({ rest: v })} />)}
      {row("入院時の病名", <input value={f.diagnosis} onChange={(e) => set({ diagnosis: e.target.value })} placeholder="例：心不全の増悪" className={input} />)}
      {row("入院の目的", <input value={f.purpose} onChange={(e) => set({ purpose: e.target.value })} placeholder="例：治療（利尿薬の静注）・精査" className={input} />)}
      {row(
        "身長・体重",
        <>
          <input value={f.heightCm || ""} onChange={(e) => set({ heightCm: Number(e.target.value) })} inputMode="decimal" aria-label="身長" className="w-16 rounded border border-rule bg-paper px-1 py-0.5 text-right" />
          cm
          <input value={f.weightKg || ""} onChange={(e) => set({ weightKg: Number(e.target.value) })} inputMode="decimal" aria-label="体重" className="w-16 rounded border border-rule bg-paper px-1 py-0.5 text-right" />
          kg
        </>,
      )}
      {row(
        "アレルギー",
        <input
          value={f.allergies.join("、")}
          onChange={(e) => set({ allergies: e.target.value.split(/[、,]/).map((a) => a.trim()).filter(Boolean) })}
          placeholder="なし"
          className={input}
        />,
      )}
      <textarea value={f.note} onChange={(e) => set({ note: e.target.value })} rows={2} placeholder="病棟への申し送り（任意）" aria-label="病棟への申し送り" className={input} />
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <button type="button" disabled={missing.length > 0 || !!deny} onClick={send} className="rounded-md bg-ai px-4 py-2 text-sm font-bold text-white disabled:opacity-40">
          入院申込を出す
        </button>
        <button type="button" onClick={onCancel} className="rounded-md border border-rule px-3 py-2 text-sm text-ink-soft">
          やめる
        </button>
        {missing.length > 0 && <span className="text-yamabuki">未入力：{missing.join("・")}</span>}
        <DenyNote action="er.admit" />
      </div>
    </div>
  );
}
