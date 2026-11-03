"use client";

import { FlaskConical, ShieldAlert } from "lucide-react";
import { useState } from "react";
import { hospitalDay } from "@/lib/dates";
import { news2 } from "@/lib/news2";
import type { Patient } from "@/lib/types";
import { ROOMS, WARD_NAME, isolationFor, occupant, type OtherPatient, type Room, type WardState } from "@/lib/ward";

export interface ChartSummary {
  drafts: number;
  confirmedToday: number;
  /** New orders and stops a nurse has not taken yet (指示受けがまだ). */
  waiting?: number;
}

interface Props {
  ward: WardState;
  summaries: Record<string, ChartSummary>;
  onOpen: (patientId: string) => void;
}

/** Floor plan of the ward. Our patients can be opened; other teams' beds are shown for context only. */
export function WardMap({ ward, summaries, onOpen }: Props) {
  const [mineOnly, setMineOnly] = useState(false);
  const occupied = ward.beds.length;
  const totalBeds = ROOMS.reduce((n, r) => n + r.beds.length, 0);
  const mine = ward.beds.filter((b) => b.patientId).length;
  const north = ROOMS.filter((r) => r.side === "north");
  const south = ROOMS.filter((r) => r.side === "south");
  const southBeforeNs = south.slice(0, 3);
  const southAfterNs = south.slice(3);

  return (
    <section aria-label="病棟マップ" className="scroll-thin min-h-0 flex-1 overflow-auto bg-paper px-5 py-4">
      <header className="mb-3 flex flex-wrap items-center gap-x-6 gap-y-2">
        <h1 className="text-lg font-bold">
          {WARD_NAME}
          <span className="ml-2 rounded border border-dashed border-ink-faint px-1.5 py-0.5 align-middle text-[10px] font-normal text-ink-soft">架空の病棟</span>
        </h1>
        <p className="nums text-sm text-ink-soft">
          入院 <b className="text-ink">{occupied}</b>名・空床 <b className="text-ink">{totalBeds - occupied}</b>床・受け持ち <b className="text-ai">{mine}</b>名
        </p>
        <label className="flex cursor-pointer items-center gap-1.5 text-xs text-ink-soft">
          <input type="checkbox" checked={mineOnly} onChange={() => setMineOnly(!mineOnly)} className="accent-ai" />
          受け持ちだけ表示
        </label>
        <Legend />
      </header>

      <div className="min-w-[1100px] space-y-2">
        <RoomRow ward={ward} rooms={north} summaries={summaries} onOpen={onOpen} mineOnly={mineOnly} />
        <div className="flex h-8 items-center justify-center rounded bg-tab/60 text-[11px] tracking-[0.5em] text-ink-faint">廊下</div>
        <div className="flex gap-2">
          <RoomRow ward={ward} rooms={southBeforeNs} summaries={summaries} onOpen={onOpen} mineOnly={mineOnly} inline />
          <div className="flex min-h-40 flex-[1.4] flex-col items-center justify-center rounded-lg border border-rule bg-tab/50 text-center text-xs text-ink-soft">
            <b className="text-sm text-ink">ナース</b>
            <b className="text-sm text-ink">ステーション</b>
          </div>
          <RoomRow ward={ward} rooms={southAfterNs} summaries={summaries} onOpen={onOpen} mineOnly={mineOnly} inline />
        </div>
      </div>
      <p className="mt-3 text-[11px] text-ink-faint">
        部屋番号は 4 と 9 を飛ばしています。受け持ち以外の患者（灰色）は病棟の様子を示すための架空の患者で、この試作ではカルテを開けません。
      </p>
    </section>
  );
}

function RoomRow({ ward, rooms, summaries, onOpen, mineOnly, inline }: { ward: WardState; rooms: Room[]; summaries: Record<string, ChartSummary>; onOpen: (id: string) => void; mineOnly: boolean; inline?: boolean }) {
  const body = rooms.map((r) => (
    <div key={r.no} className={`flex flex-col rounded-lg border border-rule bg-sheet ${r.kind === "4床室" ? "flex-[2]" : "flex-1"}`}>
      <div className="nums flex items-baseline gap-2 border-b border-rule-soft px-2.5 py-1">
        <b className="text-sm">{r.no}</b>
        <span className="text-[10px] text-ink-faint">{r.kind}</span>
      </div>
      <div className={`grid flex-1 gap-1.5 p-1.5 ${r.kind === "4床室" ? "grid-cols-2" : "grid-cols-1"}`}>
        {r.beds.map((b) => {
          const occ = occupant(ward.beds, r.no, b);
          const patient = occ?.patientId ? ward.patient(occ.patientId) : undefined;
          return (
            <div key={b || "single"} className="min-h-24 min-w-0">
              {patient ? (
                <MyBed patient={patient} bed={b} summary={summaries[patient.id]} onOpen={() => onOpen(patient.id)} />
              ) : occ?.other ? (
                <OtherBed other={occ.other} bed={b} faded={mineOnly} />
              ) : (
                <div className="flex h-full items-center justify-center rounded-md border border-dashed border-rule text-[11px] text-ink-faint">
                  {b && <span className="mr-1">{b}</span>}空床
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  ));
  return inline ? <>{body}</> : <div className="flex gap-2">{body}</div>;
}

function MyBed({ patient: p, bed, summary, onOpen }: { patient: Patient; bed: string; summary?: ChartSummary; onOpen: () => void }) {
  const latest = p.vitals.at(-1);
  const score = latest ? news2(latest) : null;
  const isolation = isolationFor(p.infections);
  const newCulture = p.cultures.some((c) => c.reportedOn === 0);
  const labsToday = p.labs.some((l) => l.day === 0);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="nums flex h-full w-full flex-col gap-0.5 rounded-md border-2 border-ai/60 bg-sheet px-2 py-1.5 text-left text-[11px] shadow-sm hover:border-ai hover:bg-ai-soft/40"
    >
      <div className="flex min-w-0 items-baseline gap-1.5 whitespace-nowrap">
        {bed && <span className="text-ink-faint">{bed}</span>}
        <b className="truncate text-[13px] text-ink">{p.name}</b>
      </div>
      <div className="text-ink-soft">
        {p.sex}・{p.age}歳・<b className="whitespace-nowrap text-ink">入院{hospitalDay(p.admittedOn, 0)}日目</b>
      </div>
      <div className="truncate whitespace-nowrap text-ink-soft" title={p.admissionDiagnosis}>
        {p.admissionDiagnosis}
      </div>
      <div className="flex flex-wrap gap-1">
        {p.admittedOn === 0 && <Tag tone="ai">新入院</Tag>}
        {isolation && (
          <Tag tone="fuji">
            <ShieldAlert size={10} />
            {isolation}
          </Tag>
        )}
        {p.allergies.length > 0 && <Tag tone="shu">アレルギー</Tag>}
        {p.cautions.map((c) => (
          <Tag key={c} tone="yamabuki">
            {c}
          </Tag>
        ))}
      </div>
      {latest && (
        <div className="flex flex-wrap gap-x-2 text-ink-soft" title={`${latest.time} の測定`}>
          <span className="whitespace-nowrap">BT {latest.bt?.toFixed(1)}</span>
          {score && (score.total >= 5 || score.red) && <span className="whitespace-nowrap font-bold text-shu">NEWS2 {score.total}</span>}
          <span className="whitespace-nowrap">
            SpO2 {latest.spo2}%{latest.o2 && latest.o2 !== "室内気" ? `（${latest.o2.replace("鼻カニュラ ", "")}）` : ""}
          </span>
          <span className="whitespace-nowrap text-ink-faint">{latest.time}</span>
        </div>
      )}
      <div className="mt-auto flex flex-wrap gap-1">
        {newCulture && (
          <Tag tone="ai">
            <FlaskConical size={10} />
            培養結果（今日）
          </Tag>
        )}
        {!newCulture && labsToday && <Tag tone="ai">採血結果（今日）</Tag>}
        {summary && summary.drafts > 0 && <Tag tone="yamabuki">下書き {summary.drafts}件</Tag>}
        {summary && summary.confirmedToday > 0 && <Tag tone="wakatake">今日確定 {summary.confirmedToday}件</Tag>}
        {summary && (summary.waiting ?? 0) > 0 && <Tag tone="yamabuki">指示受けがまだ {summary.waiting}件</Tag>}
      </div>
    </button>
  );
}

function OtherBed({ other, bed, faded }: { other: OtherPatient; bed: string; faded: boolean }) {
  return (
    <div
      title="他チームの患者（架空）。この試作ではカルテを開けません。"
      className={`nums flex h-full flex-col gap-0.5 rounded-md bg-paper px-2 py-1.5 text-[11px] text-ink-faint ${faded ? "opacity-30" : ""}`}
    >
      <div className="flex min-w-0 items-baseline gap-1.5 whitespace-nowrap">
        {bed && <span>{bed}</span>}
        <span className="truncate text-ink-soft">{other.name}</span>
      </div>
      <div className="truncate whitespace-nowrap">
        {other.sex}・{other.age}歳・{other.department}
      </div>
      {other.note && <span className="mt-auto self-start rounded border border-rule px-1">{other.note}</span>}
    </div>
  );
}

function Tag({ tone, children }: { tone: "fuji" | "shu" | "yamabuki" | "ai" | "wakatake"; children: React.ReactNode }) {
  const styles = {
    fuji: "bg-fuji-soft text-fuji",
    shu: "bg-shu-soft text-shu",
    yamabuki: "bg-yamabuki-soft text-yamabuki",
    ai: "bg-ai-soft text-ai",
    wakatake: "bg-wakatake-soft text-wakatake",
  }[tone];
  return <span className={`inline-flex items-center gap-0.5 rounded px-1 py-px text-[10px] font-bold ${styles}`}>{children}</span>;
}

function Legend() {
  return (
    <div className="ml-auto flex flex-wrap items-center gap-3 text-[11px] text-ink-soft">
      <span className="flex items-center gap-1">
        <span className="h-3 w-4 rounded-sm border-2 border-ai/60 bg-sheet" />
        受け持ち（押すとカルテが開く）
      </span>
      <span className="flex items-center gap-1">
        <span className="h-3 w-4 rounded-sm bg-paper ring-1 ring-rule" />
        他チーム
      </span>
      <span className="flex items-center gap-1">
        <span className="h-3 w-4 rounded-sm border border-dashed border-rule" />
        空床
      </span>
    </div>
  );
}
