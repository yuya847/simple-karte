"use client";
import { displayText } from "@/lib/display-text";
import { TimeInput } from "@/components/TimeInput";

import { AlertOctagon, HelpCircle, Info, Plus, Scissors, X } from "lucide-react";
import { useState } from "react";
import { addDays, formatShort, minutesOf, type CalendarDate } from "@/lib/dates";
import {
  ANESTHESIAS,
  OR_ROOMS,
  OR_RULES,
  POSITIONS,
  SIDES,
  checkRequest,
  endOf,
  l008Category,
  l008Fee,
  overlaps,
  type AnesRecord,
  type OrRoom,
  type Surgery,
} from "@/lib/surgery";
import { isolationFor } from "@/lib/ward";
import { CLAUDE, auditLog } from "@/lib/audit";
import type { WorkPatient } from "@/lib/worksheet";
import { ageSex } from "@/lib/person";

interface Props {
  today: CalendarDate;
  nowAbs: number;
  surgeries: Surgery[];
  people: WorkPatient[];
  onSave: (s: Surgery) => void;
}

const PX = 1.1; // pixels per minute
const OPEN = minutesOf(OR_RULES.open);
const CLOSE = minutesOf(OR_RULES.close);
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const abs2hhmm = (a?: number) => (a === undefined ? "—" : hhmm(((a % 1440) + 1440) % 1440));

/** 手術室: the schedule by room, requests from the wards, and the anaesthesia record. */
export function SurgeryView({ today, nowAbs, surgeries, people, onSave }: Props) {
  const [day, setDay] = useState(0);
  const [selected, setSelected] = useState<string | null>(surgeries.find((x) => x.day === 0)?.id ?? null);
  const [requesting, setRequesting] = useState(false);
  const cases = surgeries.filter((x) => x.day === day);
  const sel = surgeries.find((x) => x.id === selected);
  const hours = Array.from({ length: Math.ceil((CLOSE - OPEN) / 60) + 1 }, (_, i) => Math.ceil(OPEN / 60) * 60 + i * 60).filter((m) => m <= CLOSE);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b border-rule bg-sheet px-5 py-2">
        <h1 className="flex items-center gap-1.5 text-base font-bold">
          <Scissors size={17} className="text-ai" />
          手術室

        </h1>
        <div role="tablist" className="flex rounded-md border border-rule p-0.5 text-sm">
          {[0, 1, 2].map((d) => (
            <button key={d} type="button" role="tab" aria-selected={day === d} onClick={() => setDay(d)} className={`rounded px-2.5 py-0.5 ${day === d ? "bg-ink font-bold text-white" : "text-ink-soft"}`}>
              {["今日", "明日", "あさって"][d]} {formatShort(addDays(today, d))}
            </button>
          ))}
        </div>
        <span className="text-xs text-ink-faint">
          {OR_RULES.open}〜{OR_RULES.close}・入れ替え{OR_RULES.turnover}分・予定手術の締切は前日{OR_RULES.deadline}（の院の約束）
        </span>
        <button type="button" onClick={() => setRequesting(true)} className="ml-auto flex items-center gap-1 rounded-md bg-ai px-3 py-1.5 text-sm font-bold text-white">
          <Plus size={15} />
          手術申込
        </button>
      </div>

      <div className="scroll-thin min-h-0 flex-1 overflow-auto bg-paper p-4">
        <div className={`rounded-lg border border-rule bg-sheet p-3`}>
          <div className="relative" style={{ marginLeft: 70, height: 18 }}>
            {hours.map((m) => (
              <span key={m} className="nums absolute text-[10px] text-ink-faint" style={{ left: (m - OPEN) * PX - 12 }}>
                {hhmm(m)}
              </span>
            ))}
          </div>
          {OR_ROOMS.map((room) => (
            <div key={room} className="flex items-stretch border-t border-rule-soft">
              <div className="w-[70px] shrink-0 py-3 text-[12px] font-bold text-ink-soft">{room}</div>
              <div className="relative h-[68px]" style={{ width: (CLOSE - OPEN) * PX }}>
                {hours.map((m) => (
                  <div key={m} className="absolute top-0 h-full border-l border-rule-soft" style={{ left: (m - OPEN) * PX }} />
                ))}
                {day === 0 && nowAbs % 1440 >= OPEN && nowAbs % 1440 <= CLOSE && <div className="absolute top-0 z-10 h-full w-px bg-shu" style={{ left: ((nowAbs % 1440) - OPEN) * PX }} />}
                {cases
                  .filter((x) => x.room === room && x.start && x.minutes)
                  .map((x) => {
                    const left = (minutesOf(x.start!) - OPEN) * PX;
                    const w = x.minutes! * PX;
                    const clash = overlaps(surgeries, x).length > 0;
                    return (
                      <button
                        key={x.id}
                        type="button"
                        onClick={() => setSelected(x.id)}
                        className={`absolute top-1.5 h-[56px] overflow-hidden rounded-md border px-1.5 py-1 text-left text-[11px] leading-tight ${
                          x.status === "申込" ? "border-dashed border-ai bg-ai-soft/60" : x.status === "退室" ? "border-rule bg-tab text-ink-soft" : "border-ai/40 bg-ai-soft"
                        } ${clash ? "outline outline-2 outline-shu" : ""} ${selected === x.id ? "ring-2 ring-ai" : ""}`}
                        style={{ left, width: w }}
                        title={`${x.start}〜 ${x.procedure}`}
                      >
                        <b className="block truncate">{x.name}</b>
                        <span className="block truncate">{x.procedure}</span>
                        <span className="nums block truncate text-ink-faint">
                          {x.start}〜{hhmm(endOf(x)!)} {x.status}
                        </span>
                      </button>
                    );
                  })}
              </div>
            </div>
          ))}
          {cases.some((x) => !x.room || !x.start) && <p className="mt-2 text-[12px] text-yamabuki">部屋や時刻が決まっていない申込があります。</p>}
        </div>

        {sel && <CaseDetail key={sel.id} x={sel} all={surgeries} nowAbs={nowAbs} onSave={onSave} />}
      </div>

      {requesting && (
        <RequestDialog
          people={people}
          all={surgeries}
          nowAbs={nowAbs}
          onCancel={() => setRequesting(false)}
          onSave={(x) => {
            onSave(x);
            setDay(x.day);
            setSelected(x.id);
            setRequesting(false);
          }}
        />
      )}
    </div>
  );
}

function Checks({ checks }: { checks: ReturnType<typeof checkRequest> }) {
  return (
    <ul className="space-y-0.5 text-[12px]">
      {checks.map((c) => (
        <li key={c.text} className={`flex items-start gap-1 ${c.level === "stop" ? "font-bold text-shu" : c.level === "ask" ? "text-yamabuki" : "text-ink-soft"}`}>
          {c.level === "stop" ? <AlertOctagon size={13} className="mt-0.5 shrink-0" /> : c.level === "ask" ? <HelpCircle size={13} className="mt-0.5 shrink-0" /> : <Info size={13} className="mt-0.5 shrink-0" />}
          {displayText(c.text)}
        </li>
      ))}
    </ul>
  );
}

function CaseDetail({ x, all, nowAbs, onSave }: { x: Surgery; all: Surgery[]; nowAbs: number; onSave: (s: Surgery) => void }) {
  const rec = x.record ?? {};
  const set = (k: keyof AnesRecord) => onSave({ ...x, record: { ...rec, [k]: nowAbs }, status: k === "anesEnd" ? "退室" : "入室" });
  const fee = l008Fee(x);
  const cat = l008Category(x);
  const step = (k: keyof AnesRecord, label: string, enabled: boolean) => (
    <button type="button" disabled={!enabled || rec[k] !== undefined} onClick={() => set(k)} className="rounded border border-ai px-2 py-1 text-[12px] text-ai disabled:border-rule disabled:text-ink-faint">
      {label} {abs2hhmm(rec[k])}
    </button>
  );
  return (
    <section className="mt-3 grid gap-3 rounded-lg border border-rule bg-sheet p-4 text-[13px] md:grid-cols-2">
      <div>
        <h3 className="font-bold">
          {x.name}（{ageSex(x)}）　{x.ward} {x.department}
        </h3>
        <p className="mt-1">
          <b>{x.procedure}</b>　{x.site} {x.side !== "なし" ? x.side : ""}　{x.position}　{x.anesthesia}
          {x.laparoscopic && "（腹腔鏡）"}
        </p>
        <p className="nums text-ink-soft">
          {x.room} {x.start}〜（{x.minutes}分）　申込区分 {x.kind}　輸血 {x.blood}　術後 {x.after}　麻酔科依頼 {x.anesthesiaConsult ? "あり" : "なし"}
        </p>
        <div className="mt-2">
          <Checks checks={checkRequest(all, x, nowAbs).filter((c) => c.key !== "deadline")} />
        </div>
        {x.status === "申込" && (
          <button type="button" onClick={() => onSave({ ...x, status: "受付済" })} className="mt-2 rounded bg-ai px-3 py-1 text-[12px] font-bold text-white">
            手術室で受け付ける
          </button>
        )}
      </div>
      <div>
        <h3 className="font-bold">麻酔の記録（時刻は押した時刻）</h3>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {step("anesStart", "麻酔開始（麻酔器を接続）", x.status !== "申込")}
          {step("opStart", "手術開始", rec.anesStart !== undefined)}
          {step("opEnd", "手術終了", rec.opStart !== undefined)}
          {step("anesEnd", "麻酔終了（麻酔器から離脱）", rec.opEnd !== undefined)}
        </div>
        {x.anesthesia === "全身麻酔" ? (
          <div className="mt-2 rounded-md bg-paper px-3 py-2 text-[12px]">
            <label className="flex items-center gap-1.5">
              <input type="checkbox" className="accent-ai" checked={!!x.difficult} onChange={() => onSave({ ...x, difficult: !x.difficult })} />
              麻酔が困難な患者（告示の別表。麻酔科医が確かめて入れる）
            </label>
            <p className="mt-1 text-ink-soft">区分：{cat.why}（申込の体位・腹腔鏡からコードで決める）</p>
            {fee ? (
              <p className="nums mt-1">
                <b>L008 {fee.points.toLocaleString("ja-JP")}点</b>　{fee.formula}
              </p>
            ) : (
              <p className="mt-1 text-ink-faint">麻酔開始と麻酔終了が入ると、時間と点数を計算します（2時間を超えたら30分ごと、端数を含む）。</p>
            )}
          </div>
        ) : (
          <p className="mt-2 text-[12px] text-ink-faint">{x.anesthesia}の点数は、この試作では計算しません（全身麻酔 L008 だけ）。</p>
        )}
      </div>
    </section>
  );
}

const SAMPLE = "明日の午後1時半から手術室3で、右下腿の膿瘍に対して切開排膿とデブリードマン。腰椎麻酔、仰臥位で1時間。術後は病棟に戻ります。";
const sel = "rounded border border-rule bg-paper px-1.5 py-1 text-[13px] outline-none focus:border-ai";

function RequestDialog({ people, all, nowAbs, onCancel, onSave }: { people: WorkPatient[]; all: Surgery[]; nowAbs: number; onCancel: () => void; onSave: (s: Surgery) => void }) {
  const [pid, setPid] = useState(people[0]?.patient.id ?? "");
  const person = people.find((x) => x.patient.id === pid)!;
  const pt = person.patient;
  const blank = (): Surgery => ({
    id: `or-${Date.now()}`,
    patientId: pt.id,
    name: pt.name,
    sex: pt.sex,
    age: pt.age,
    ward: `5階東 ${person.room}`,
    department: pt.department,
    day: 1,
    room: null,
    start: null,
    minutes: null,
    procedure: "",
    site: "",
    side: null,
    position: null,
    anesthesia: null,
    laparoscopic: false,
    kind: "予定",
    blood: "なし",
    after: "病棟",
    anesthesiaConsult: true,
    infections: [...pt.infections, ...(isolationFor(pt.infections) ? [isolationFor(pt.infections)!] : [])],
    allergies: pt.allergies,
    heightCm: pt.heightCm,
    weightKg: pt.weightKg,
    status: "申込",
    requestedAt: nowAbs,
  });
  const [x, setX] = useState<Surgery>(blank);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const checks = checkRequest(all, x, nowAbs);
  const blocking = checks.filter((c) => c.level === "stop" || (c.level === "ask" && c.key !== "deadline"));
  const lateDeadline = checks.some((c) => c.key === "deadline");

  const read = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/or-request", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `エラー（${res.status}）`);
      const r = json.request;
      auditLog({ role: "AI", actor: CLAUDE, action: "手術申込を項目に写した", patient: pt.name, detail: text });
      setX((cur) => ({
        ...cur,
        procedure: r.procedure || cur.procedure,
        site: r.site || cur.site,
        side: r.side ?? cur.side,
        position: r.position ?? cur.position,
        anesthesia: r.anesthesia ?? cur.anesthesia,
        laparoscopic: r.laparoscopic || cur.laparoscopic,
        day: r.day ?? cur.day,
        start: r.start ?? cur.start,
        minutes: r.minutes ?? cur.minutes,
        room: r.room ?? cur.room,
        kind: r.kind ?? cur.kind,
        blood: r.blood ?? cur.blood,
        after: r.after ?? cur.after,
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "読み取れませんでした。");
    } finally {
      setBusy(false);
    }
  };

  const field = (label: string, el: React.ReactNode) => (
    <label className="flex flex-col gap-0.5 text-[11px] text-ink-soft">
      {label}
      {el}
    </label>
  );
  return (
    <div className="absolute inset-0 z-30 flex items-start justify-center bg-ink/30 pt-[4vh]" onClick={onCancel}>
      <div role="dialog" aria-label="手術申込" className="w-[min(760px,94%)] rounded-xl border border-rule bg-sheet shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-rule px-4 py-2.5">
          <h2 className="font-bold">手術申込</h2>
          <button type="button" onClick={onCancel} aria-label="閉じる" className="rounded p-1 text-ink-faint hover:bg-paper">
            <X size={16} />
          </button>
        </div>
        <div className="max-h-[78vh] space-y-3 overflow-y-auto p-4 text-[13px]">
          <label className="flex items-center gap-2">
            患者（受け持ち）
            <select
              value={pid}
              onChange={(e) => {
                setPid(e.target.value);
                setX(blank);
              }}
              className={sel}
            >
              {people.map((p) => (
                <option key={p.patient.id} value={p.patient.id}>
                  {p.room} {p.patient.name}
                </option>
              ))}
            </select>
            <span className="text-[11px] text-ink-faint">感染症・アレルギー・身長体重はカルテから自動で入ります。</span>
          </label>
          <div className="flex gap-2">
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} className="flex-1 rounded border border-rule bg-paper px-2 py-1.5 outline-none" placeholder="話すか打つ（例：明日の午後1時半から手術室3で…）" />
            <div className="flex flex-col gap-1">
              <button type="button" onClick={() => setText(SAMPLE)} className="rounded border border-rule px-2 py-1 text-[11px] text-ink-soft">
                例文
              </button>
              <button type="button" disabled={!text.trim() || busy} onClick={read} className="rounded bg-ai px-2 py-1 text-[12px] font-bold text-white disabled:opacity-40">
                {busy ? "読み取り中…" : "保存する"}
              </button>
            </div>
          </div>
          {error && <p className="text-shu">{error}</p>}
          <div className="grid grid-cols-4 gap-2">
            {field("術式", <input value={x.procedure} onChange={(e) => setX({ ...x, procedure: e.target.value })} className={sel} />)}
            {field("部位", <input value={x.site} onChange={(e) => setX({ ...x, site: e.target.value })} className={sel} />)}
            {field(
              "左右",
              <select value={x.side ?? ""} onChange={(e) => setX({ ...x, side: (e.target.value || null) as Surgery["side"] })} className={sel}>
                <option value="">（選ぶ）</option>
                {SIDES.map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>,
            )}
            {field(
              "体位",
              <select value={x.position ?? ""} onChange={(e) => setX({ ...x, position: (e.target.value || null) as Surgery["position"] })} className={sel}>
                <option value="">（選ぶ）</option>
                {POSITIONS.map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>,
            )}
            {field(
              "麻酔",
              <select value={x.anesthesia ?? ""} onChange={(e) => setX({ ...x, anesthesia: (e.target.value || null) as Surgery["anesthesia"] })} className={sel}>
                <option value="">（選ぶ）</option>
                {ANESTHESIAS.map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>,
            )}
            {field(
              "日",
              <select value={x.day} onChange={(e) => setX({ ...x, day: Number(e.target.value) })} className={sel}>
                {[0, 1, 2].map((d) => (
                  <option key={d} value={d}>
                    {["今日", "明日", "あさって"][d]}
                  </option>
                ))}
              </select>,
            )}
            {field(
              "手術室",
              <select value={x.room ?? ""} onChange={(e) => setX({ ...x, room: (e.target.value || null) as OrRoom | null })} className={sel}>
                <option value="">（選ぶ）</option>
                {OR_ROOMS.map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>,
            )}
            {field("開始", <TimeInput value={x.start ?? ""} onChange={(e) => setX({ ...x, start: /^\d{2}:\d{2}$/.test(e.target.value) ? e.target.value : e.target.value || null })} placeholder="13:30" className={sel} />)}
            {field("予定時間（分）", <input value={x.minutes ?? ""} onChange={(e) => setX({ ...x, minutes: Number(e.target.value) || null })} inputMode="numeric" className={sel} />)}
            {field(
              "申込区分",
              <select value={x.kind} onChange={(e) => setX({ ...x, kind: e.target.value as Surgery["kind"] })} className={sel}>
                {(["予定", "締切後", "緊急"] as const).map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>,
            )}
            {field(
              "輸血",
              <select value={x.blood} onChange={(e) => setX({ ...x, blood: e.target.value as Surgery["blood"] })} className={sel}>
                {(["なし", "血液型・不規則抗体", "輸血準備"] as const).map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>,
            )}
            {field(
              "術後の行き先",
              <select value={x.after} onChange={(e) => setX({ ...x, after: e.target.value as Surgery["after"] })} className={sel}>
                {(["病棟", "ICU", "回復室"] as const).map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>,
            )}
            <label className="col-span-2 flex items-center gap-1.5 text-[12px]">
              <input type="checkbox" className="accent-ai" checked={x.laparoscopic} onChange={() => setX({ ...x, laparoscopic: !x.laparoscopic })} />
              腹腔鏡を使う
            </label>
            <label className="col-span-2 flex items-center gap-1.5 text-[12px]">
              <input type="checkbox" className="accent-ai" checked={x.anesthesiaConsult} onChange={() => setX({ ...x, anesthesiaConsult: !x.anesthesiaConsult })} />
              麻酔科に依頼する
            </label>
          </div>
          <Checks checks={checks} />
          <div className="flex items-center gap-3">
            {lateDeadline && x.kind === "予定" && (
              <button type="button" onClick={() => setX({ ...x, kind: "締切後" })} className="rounded border border-yamabuki px-2 py-1 text-[12px] text-yamabuki">
                申込区分を「締切後」にする
              </button>
            )}
            <button
              type="button"
              disabled={blocking.length > 0 || (lateDeadline && x.kind === "予定")}
              onClick={() => onSave(x)}
              className="ml-auto rounded-md bg-ai px-4 py-1.5 font-bold text-white disabled:opacity-40"
            >
              申し込む（医師）
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
