"use client";

import { displayText } from "@/lib/display-text";
import { FlaskConical, ShieldAlert } from "lucide-react";
import { useState } from "react";
import { hospitalDay } from "@/lib/dates";
import { news2 } from "@/lib/news2";
import { PatientAvatar } from "./PatientAvatar";
import type { Patient } from "@/lib/types";
import { ROOMS, WARD_NAME, isolationFor, occupant, type OtherPatient, type Room, type WardState } from "@/lib/ward";
import type { BedAssignment } from "@/lib/ward";
import { ageSex } from "@/lib/person";
import { useEmphasizeTeam } from "@/lib/use-emphasis";
import { expectedOf, isUnknownBed, markOf, markText, type Expected, type WardAsOf } from "@/lib/ward-asof";
import { AsOfBand, DayNav, type DayNavProps } from "./DayNav";
import { EmphasisToggle } from "./EmphasisToggle";

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
  /** The viewer's own team (受け持ち): it stands out while 「受け持ちを目立たせる」 is on. Everyone when not given. */
  mine?: (patientId: string) => boolean;
  /** 業務分担 of the shift now: the nurses of a room, shown in its header. */
  roomNote?: (room: Room) => string | undefined;
  /** 日付の移動 in the header. */
  dayNav?: DayNavProps;
  /** The day shown, when `ward.beds` came from bedsAsOf (its marks are drawn; another day gets a band). */
  asOf?: WardAsOf;
}

const everyone = () => true;
const noFmt = (d: number) => `${d}日後`;

/**
 * Floor plan of the ward. Every patient opens on click. With 「受け持ちを目立たせる」 (the default) the viewer's
 * team gets the full card and the others a short gray one; without it, everyone gets the full card.
 */
export function WardMap({ ward, rooms = ROOMS, title = WARD_NAME, pick, summaries, onOpen, onMove, scope, mine: mineOf = everyone, roomNote, dayNav, asOf }: Props) {
  const [mineOnly, setMineOnly] = useState(false);
  const [emphasize, setEmphasize] = useEmphasizeTeam();
  const day = asOf?.day ?? 0;
  const fmtDay = dayNav?.fmtDay ?? noFmt;
  const occupied = asOf ? asOf.counts.occupied : ward.beds.length;
  const totalBeds = rooms.reduce((n, r) => n + r.beds.length, 0);
  const empty = asOf ? asOf.counts.empty : totalBeds - occupied;
  const mine = ward.beds.filter((b) => b.patientId && mineOf(b.patientId)).length;
  const look: Look = { emphasize, mineOnly, mine: mineOf, roomNote, day, fmtDay };
  const north = rooms.filter((r) => r.side === "north");
  const south = rooms.filter((r) => r.side === "south");
  const southBeforeNs = south.slice(0, 3);
  const southAfterNs = south.slice(3);

  return (
    <section aria-label="病棟マップ" className="scroll-thin min-h-0 flex-1 overflow-auto bg-paper px-5 py-4">
      <header className="mb-3 flex flex-wrap items-center gap-x-6 gap-y-2">
        <h1 className="text-lg font-bold">
          {title}
        </h1>
        {pick && <PickSelect pick={pick} />}
        {dayNav && <DayNav {...dayNav} />}
        <p className="nums text-sm text-ink-soft">
          入院 <b className="text-ink">{occupied}</b>名・空床 <b className="text-ink">{empty ?? "—"}</b>床{asOf && asOf.counts.reserved > 0 ? `（うち入院予定 ${asOf.counts.reserved}）` : ""}・受け持ち <b className="text-ai">{mine}</b>名
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
        <EmphasisToggle on={emphasize} onChange={setEmphasize} />
        <Legend emphasize={emphasize} day={day} />
      </header>
      {asOf && (
        <div className="-mx-5 mb-3">
          <AsOfBand asOf={asOf} fmtDay={fmtDay} />
        </div>
      )}

      <div className="min-w-[1100px] space-y-2">
        <RoomRow ward={ward} rooms={north} summaries={summaries} onOpen={onOpen} onMove={onMove} look={look} scope={scope} />
        <div className="flex h-8 items-center justify-center rounded bg-tab/60 text-[11px] tracking-[0.5em] text-ink-faint">廊下</div>
        <div className="flex gap-2">
          <RoomRow ward={ward} rooms={southBeforeNs} summaries={summaries} onOpen={onOpen} onMove={onMove} look={look} scope={scope} inline />
          <div className="flex min-h-40 flex-[1.4] flex-col items-center justify-center rounded-lg border border-rule bg-tab/50 text-center text-xs text-ink-soft">
            <b className="text-sm text-ink">ナース</b>
            <b className="text-sm text-ink">ステーション</b>
          </div>
          <RoomRow ward={ward} rooms={southAfterNs} summaries={summaries} onOpen={onOpen} onMove={onMove} look={look} scope={scope} inline />
        </div>
      </div>
      <p className="mt-3 text-[11px] text-ink-faint">
        部屋番号は 4 と 9 を飛ばしています。受け持ち以外の患者には、入院時の記事・病名・バイタル数回・採血1回・食事・オーダ数件の記録があります。押すと開き、開いた記録は監査ログに残ります。
      </p>
    </section>
  );
}

const BED_MIME = "application/x-simple-karte-bed";

/** How the beds are drawn: the team emphasized or not, and 受け持ちだけ表示 (the others faded). */
interface Look {
  emphasize: boolean;
  mineOnly: boolean;
  mine: (patientId: string) => boolean;
  roomNote?: Props["roomNote"];
  /** The day shown (0 = today): 入院◯日目 and 新入院 are counted for it; today's vitals and results show on today only. */
  day: number;
  fmtDay: (day: number) => string;
}

function RoomRow({ ward, rooms, summaries, onOpen, onMove, look, scope, inline }: { ward: WardState; rooms: Room[]; summaries: Record<string, ChartSummary>; onOpen: (id: string) => void; onMove?: Props["onMove"]; look: Look; scope?: Props["scope"]; inline?: boolean }) {
  const body = rooms.map((r) => (
    <div key={r.no} className={`flex flex-col rounded-lg border border-rule bg-sheet ${r.kind === "4床室" ? "flex-[2]" : "flex-1"}`}>
      <div className="nums flex items-baseline gap-2 border-b border-rule-soft px-2.5 py-1">
        <b className="text-sm">{displayText(r.no)}</b>
        <span className="text-[10px] text-ink-faint">{r.kind}</span>
        {look.roomNote?.(r) && (
          <span className="ml-auto truncate text-[10px] font-bold text-ai" title="業務分担（いまの勤務帯の受け持ち）">
            {look.roomNote(r)}
          </span>
        )}
      </div>
      <div className={`grid flex-1 gap-1.5 p-1.5 ${r.kind === "4床室" ? "grid-cols-2" : "grid-cols-1"}`}>
        {r.beds.map((b) => {
          const occ = occupant(ward.beds, r.no, b);
          const patient = occ?.patientId ? ward.patient(occ.patientId) : undefined;
          const mark = occ ? markOf(occ) : undefined;
          const expected = occ ? expectedOf(occ) : undefined;
          const out = !!scope && !!occ && !scope.test(occ);
          const mine = !!patient && look.mine(patient.id);
          // 受け持ちだけ表示 fades everyone else (a narrower tab's scope decides instead when there is one).
          const faded = !!occ && (scope ? out : look.mineOnly && !mine);
          // 退院予定 that day: the card stays, lighter, with the mark on it.
          const leaving = mark?.kind === "退院予定" ? markText(mark, look.day, look.fmtDay) : null;
          return (
            <div key={b || "single"} className={`relative min-h-24 min-w-0 ${faded && (patient && (mine || !look.emphasize)) ? "opacity-35" : leaving ? "opacity-70" : ""}`}>
              {leaving && <span className="absolute right-1 top-1 z-10 rounded bg-wakatake-soft px-1 py-px text-[10px] font-bold text-wakatake">{leaving}</span>}
              {occ && isUnknownBed(occ) ? (
                <div className="flex h-full items-center justify-center rounded-md border border-rule bg-tab/50 text-[11px] text-ink-faint" title="この日に誰がいたか、記録からは分かりません">
                  {b && <span className="mr-1">{b}</span>}記録なし
                </div>
              ) : expected && mark ? (
                <ExpectedBed who={expected} bed={b} text={markText(mark, look.day, look.fmtDay)} faded={faded} />
              ) : mark?.kind === "空く予定" ? (
                <div className="flex h-full flex-col items-center justify-center rounded-md border border-dashed border-wakatake/60 bg-wakatake-soft/30 text-[11px] text-wakatake">
                  <span>
                    {b && <span className="mr-1">{b}</span>}空く予定
                  </span>
                  <span className="text-[10px] text-ink-soft">{displayText(markText(mark, look.day, look.fmtDay).replace(/^空く予定/, ""))}</span>
                </div>
              ) : patient && (mine || !look.emphasize) ? (
                // 移動 is offered for the team's patients (their bed moves are the team's work).
                <MyBed patient={patient} bed={b} day={look.day} summary={summaries[patient.id]} onOpen={() => onOpen(patient.id)} onMove={onMove && mine ? () => onMove(patient.id) : undefined} />
              ) : patient || occ?.other ? (
                <OtherBed other={occ!.other} patient={patient} bed={b} faded={faded} onOpen={patient ? () => onOpen(patient.id) : undefined} />
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

function MyBed({ patient: p, bed, day, summary, onOpen, onMove }: { patient: Patient; bed: string; day: number; summary?: ChartSummary; onOpen: () => void; onMove?: () => void }) {
  // Today's vitals and results are today's: on another day the card shows the standing facts only.
  const latest = day === 0 ? p.vitals.at(-1) : undefined;
  const score = latest ? news2(latest) : null;
  const isolation = isolationFor(p.infections);
  const newCulture = day === 0 && p.cultures.some((c) => c.reportedOn === 0);
  const labsToday = day === 0 && p.labs.some((l) => l.day === 0);
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
        {ageSex(p)}・<b className="whitespace-nowrap text-ink">入院{hospitalDay(p.admittedOn, day)}日目</b>
      </div>
      <div className="truncate whitespace-nowrap text-ink-soft" title={p.admissionDiagnosis}>
        {p.admissionDiagnosis}
      </div>
      <div className="flex flex-wrap gap-1">
        {p.codeStatus === "DNAR" && <Tag tone="shu">DNAR</Tag>}
        {p.admittedOn === day && <Tag tone="ai">新入院</Tag>}
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

/** Another team's patient while 「受け持ちを目立たせる」 is on: name, age, department and the bed's note, in gray. */
function OtherBed({ other, patient, bed, faded, onOpen }: { other?: OtherPatient; patient?: Patient; bed: string; faded: boolean; onOpen?: () => void }) {
  const who = patient ?? other;
  const body = (
    <>
      <div className="flex min-w-0 items-baseline gap-1.5 whitespace-nowrap">
        {bed && <span>{bed}</span>}
        <span className="truncate text-ink-soft">{who?.name}</span>
      </div>
      <div className="truncate whitespace-nowrap">
        {who ? ageSex(who) : ""}・{who?.department}
      </div>
      {other?.note && <span className="mt-auto self-start rounded border border-rule px-1">{displayText(other.note)}</span>}
    </>
  );
  const cls = `nums flex h-full w-full flex-col gap-0.5 rounded-md bg-paper px-2 py-1.5 text-left text-[11px] text-ink-faint ${faded ? "opacity-30" : ""}`;
  return onOpen ? (
    <button type="button" onClick={onOpen} title="受け持ち以外の患者。押すとカルテが開きます（開いた記録は監査ログに残ります）" className={`${cls} hover:bg-ai-soft/30 hover:ring-1 hover:ring-ai/40`}>
      {body}
    </button>
  ) : (
    <div title="受け持ち以外の患者" className={cls}>
      {body}
    </div>
  );
}

/** Someone expected on this bed (入院予定): no chart yet, so a dotted card with what the plan says. */
function ExpectedBed({ who, bed, text, faded }: { who: Expected; bed: string; text: string; faded: boolean }) {
  return (
    <div title="入院予定（予定から）。カルテは入院を受けたときにできます" className={`nums flex h-full w-full flex-col gap-0.5 rounded-md border-2 border-dotted border-ai/70 bg-ai-soft/20 px-2 py-1.5 text-left text-[11px] ${faded ? "opacity-30" : ""}`}>
      <div className="flex min-w-0 items-baseline gap-1.5 whitespace-nowrap">
        {bed && <span className="text-ink-faint">{bed}</span>}
        <b className="truncate text-[13px] text-ink">{who.name}</b>
      </div>
      <div className="text-ink-soft">
        {ageSex(who)}・{who.department}
      </div>
      <Tag tone="ai">{displayText(text)}</Tag>
      {who.note && <div className="truncate whitespace-nowrap text-ink-soft">{displayText(who.note)}</div>}
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

function Legend({ emphasize, day }: { emphasize: boolean; day: number }) {
  return (
    <div className="ml-auto flex flex-wrap items-center gap-3 text-[11px] text-ink-soft">
      <span className="flex items-center gap-1">
        <span className="h-3 w-4 rounded-sm border-2 border-ai/60 bg-sheet" />
        {emphasize ? "受け持ち" : "入院中"}
      </span>
      {emphasize && (
        <span className="flex items-center gap-1">
          <span className="h-3 w-4 rounded-sm bg-paper ring-1 ring-rule" />
          受け持ち以外
        </span>
      )}
      <span className="hint">押すとカルテが開きます</span>
      {day >= 0 && (
        <span className="flex items-center gap-1">
          <span className="h-3 w-4 rounded-sm border border-dashed border-rule" />
          空床
        </span>
      )}
      {day >= 0 && (
        <span className="flex items-center gap-1">
          <span className="h-3 w-4 rounded-sm border-2 border-dotted border-ai/70 bg-ai-soft/20" />
          入院予定
        </span>
      )}
      {day > 0 && (
        <span className="flex items-center gap-1">
          <span className="rounded bg-wakatake-soft px-1 font-bold text-wakatake">退院予定</span>
          <span className="h-3 w-4 rounded-sm border border-dashed border-wakatake/60 bg-wakatake-soft/30" />
          空く予定
        </span>
      )}
      {day < 0 && (
        <span className="flex items-center gap-1">
          <span className="h-3 w-4 rounded-sm border border-rule bg-tab/50" />
          記録なし
        </span>
      )}
    </div>
  );
}
