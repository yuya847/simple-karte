"use client";

import { FlaskConical, ShieldAlert } from "lucide-react";
import { useState } from "react";
import { hospitalDay } from "@/lib/dates";
import { news2 } from "@/lib/news2";
import { PatientAvatar } from "./PatientAvatar";
import type { Patient } from "@/lib/types";
import { ROOMS, WARD_NAME, isolationFor, occupant, type OtherPatient, type Room, type WardState } from "@/lib/ward";
import type { BedAssignment } from "@/lib/ward";
import { ageSex } from "@/lib/person";

export interface ChartSummary {
  drafts: number;
  confirmedToday: number;
  /** New orders and stops a nurse has not taken yet (指示受けがまだ). */
  waiting?: number;
}

/** A pulldown in a screen's header (◯階・科・主治医). */
export interface Pick {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}

export function PickSelect({ pick }: { pick: Pick }) {
  return (
    <label className="flex items-center gap-1.5 text-sm text-ink-soft">
      {pick.label}
      <select value={pick.value} onChange={(e) => pick.onChange(e.target.value)} aria-label={pick.label} className="rounded-md border border-rule bg-sheet px-2 py-1 text-sm font-bold text-ink pointer-coarse:py-2">
        {pick.options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

interface Props {
  /** The beds of the floor shown, and the patient lookup. */
  ward: WardState;
  /** The floor's rooms (5階東 when not given). */
  rooms?: Room[];
  title?: string;
  /** Choose the floor. */
  pick?: Pick;
  summaries: Record<string, ChartSummary>;
  onOpen: (patientId: string) => void;
  /** 転棟・転床: a patient card dropped on an empty bed, or the card's 「移動」 (no bed chosen yet). */
  onMove?: (patientId: string, to?: { room: string; bed: string }) => void;
  /** A 病棟 tab narrower than the ward (受け持ち, a department): its beds stay clear, the rest fade. */
  scope?: { label: string; test: (b: BedAssignment) => boolean };
}

/** Floor plan of the ward. Our patients can be opened; other teams' beds are shown for context only. */
export function WardMap({ ward, rooms = ROOMS, title = WARD_NAME, pick, summaries, onOpen, onMove, scope }: Props) {
  const [mineOnly, setMineOnly] = useState(false);
  const occupied = ward.beds.length;
  const totalBeds = rooms.reduce((n, r) => n + r.beds.length, 0);
  const mine = ward.beds.filter((b) => b.patientId).length;
  const north = rooms.filter((r) => r.side === "north");
  const south = rooms.filter((r) => r.side === "south");
  const southBeforeNs = south.slice(0, 3);
  const southAfterNs = south.slice(3);

  return (
    <section aria-label="病棟マップ" className="scroll-thin min-h-0 flex-1 overflow-auto bg-paper px-5 py-4">
      <header className="mb-3 flex flex-wrap items-center gap-x-6 gap-y-2">
        <h1 className="text-lg font-bold">
          {title}
          <span className="ml-2 rounded border border-dashed border-ink-faint px-1.5 py-0.5 align-middle text-[10px] font-normal text-ink-soft">架空の病棟</span>
        </h1>
        {pick && <PickSelect pick={pick} />}
        <p className="nums text-sm text-ink-soft">
          入院 <b className="text-ink">{occupied}</b>名・空床 <b className="text-ink">{totalBeds - occupied}</b>床・受け持ち <b className="text-ai">{mine}</b>名
        </p>
        {scope ? (
          <p className="text-xs text-ink-soft">
            <b className="text-ink">{scope.label}</b>の {ward.beds.filter(scope.test).length}名を濃く、ほかを薄く出しています
          </p>
        ) : (
          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-ink-soft">
            <input type="checkbox" checked={mineOnly} onChange={() => setMineOnly(!mineOnly)} className="accent-ai" />
            受け持ちだけ表示
          </label>
        )}
        <Legend />
      </header>

      <div className="min-w-[1100px] space-y-2">
        <RoomRow ward={ward} rooms={north} summaries={summaries} onOpen={onOpen} onMove={onMove} mineOnly={mineOnly} scope={scope} />
        <div className="flex h-8 items-center justify-center rounded bg-tab/60 text-[11px] tracking-[0.5em] text-ink-faint">廊下</div>
        <div className="flex gap-2">
          <RoomRow ward={ward} rooms={southBeforeNs} summaries={summaries} onOpen={onOpen} onMove={onMove} mineOnly={mineOnly} scope={scope} inline />
          <div className="flex min-h-40 flex-[1.4] flex-col items-center justify-center rounded-lg border border-rule bg-tab/50 text-center text-xs text-ink-soft">
            <b className="text-sm text-ink">ナース</b>
            <b className="text-sm text-ink">ステーション</b>
          </div>
          <RoomRow ward={ward} rooms={southAfterNs} summaries={summaries} onOpen={onOpen} onMove={onMove} mineOnly={mineOnly} scope={scope} inline />
        </div>
      </div>
      <p className="mt-3 text-[11px] text-ink-faint">
        部屋番号は 4 と 9 を飛ばしています。受け持ち以外の患者（灰色）は病棟の様子を示すための架空の患者で、この試作ではカルテを開けません。
      </p>
    </section>
  );
}

const BED_MIME = "application/x-simple-karte-bed";

function RoomRow({ ward, rooms, summaries, onOpen, onMove, mineOnly, scope, inline }: { ward: WardState; rooms: Room[]; summaries: Record<string, ChartSummary>; onOpen: (id: string) => void; onMove?: Props["onMove"]; mineOnly: boolean; scope?: Props["scope"]; inline?: boolean }) {
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
          const out = !!scope && !!occ && !scope.test(occ);
          return (
            <div key={b || "single"} className={`min-h-24 min-w-0 ${out && patient ? "opacity-35" : ""}`}>
              {patient ? (
                <MyBed patient={patient} bed={b} summary={summaries[patient.id]} onOpen={() => onOpen(patient.id)} onMove={onMove ? () => onMove(patient.id) : undefined} />
              ) : occ?.other ? (
                <OtherBed other={occ.other} bed={b} faded={scope ? out : mineOnly} />
              ) : (
                <div
                  onDragOver={(e) => {
                    if (!onMove || !e.dataTransfer.types.includes(BED_MIME)) return;
                    e.preventDefault();
                    e.currentTarget.classList.add("border-ai", "bg-ai-soft");
                  }}
                  onDragLeave={(e) => e.currentTarget.classList.remove("border-ai", "bg-ai-soft")}
                  onDrop={(e) => {
                    e.currentTarget.classList.remove("border-ai", "bg-ai-soft");
                    const pid = e.dataTransfer.getData(BED_MIME);
                    if (pid && onMove) {
                      e.preventDefault();
                      onMove(pid, { room: r.no, bed: b });
                    }
                  }}
                  className="flex h-full items-center justify-center rounded-md border border-dashed border-rule text-[11px] text-ink-faint"
                >
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

function MyBed({ patient: p, bed, summary, onOpen, onMove }: { patient: Patient; bed: string; summary?: ChartSummary; onOpen: () => void; onMove?: () => void }) {
  const latest = p.vitals.at(-1);
  const score = latest ? news2(latest) : null;
  const isolation = isolationFor(p.infections);
  const newCulture = p.cultures.some((c) => c.reportedOn === 0);
  const labsToday = p.labs.some((l) => l.day === 0);
  return (
    <div className="relative h-full">
    {onMove && (
      <button type="button" onClick={onMove} title="転棟・転床（空床へドラッグしても動かせます）" className="absolute right-1 top-1 z-10 rounded border border-rule bg-sheet px-1 text-[10px] text-ink-soft hover:border-ai hover:text-ai pointer-coarse:px-2 pointer-coarse:py-1">
        移動
      </button>
    )}
    <button
      type="button"
      onClick={onOpen}
      draggable={!!onMove}
      onDragStart={(e) => {
        e.dataTransfer.setData(BED_MIME, p.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      className="nums flex h-full w-full flex-col gap-0.5 rounded-md border-2 border-ai/60 bg-sheet px-2 py-1.5 text-left text-[11px] shadow-sm hover:border-ai hover:bg-ai-soft/40"
    >
      <div className="flex min-w-0 items-baseline gap-1.5 whitespace-nowrap">
        {bed && <span className="text-ink-faint">{bed}</span>}
        <PatientAvatar sex={p.sex} age={p.age} size={22} className="self-center rounded-full" />
        <b className="truncate text-[13px] text-ink">{p.name}</b>
      </div>
      <div className="text-ink-soft">
        {ageSex(p)}・<b className="whitespace-nowrap text-ink">入院{hospitalDay(p.admittedOn, 0)}日目</b>
      </div>
      <div className="truncate whitespace-nowrap text-ink-soft" title={p.admissionDiagnosis}>
        {p.admissionDiagnosis}
      </div>
      <div className="flex flex-wrap gap-1">
        {p.codeStatus === "DNAR" && <Tag tone="shu">DNAR</Tag>}
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
    </div>
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
        {ageSex(other)}・{other.department}
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
