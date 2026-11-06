"use client";
import { displayText } from "@/lib/display-text";
import { TimeInput } from "@/components/TimeInput";

import { Cable, ClipboardList, Download, FilePen, ListChecks, Microscope, ShowerHead, Stethoscope } from "lucide-react";
import { useState } from "react";
import { auditLog } from "@/lib/audit";
import { addDays, formatShort, type CalendarDate } from "@/lib/dates";
import {
  CONSCIOUSNESS,
  ENDO_HOUSE_RULES,
  ENDO_RULES,
  ENDO_SOURCES,
  ROOMS,
  SCOPES,
  WASHERS,
  WASHER_AGENT,
  biopsyCase,
  doneProblems,
  endoReportProblems,
  endoResultItems,
  endoRows,
  lastUse,
  machineLeft,
  newWork,
  nextReprocessStep,
  scopeKindOf,
  scopeState,
  todayCheck,
  usableScopes,
  versionOf,
  washerBlock,
  watchGaps,
  type Consciousness,
  type EndoDesk,
  type EndoRow,
  type EndoStatus,
  type EndoWork,
  type Reprocess,
} from "@/lib/endoscopy";
import { abs } from "@/lib/flowsheet";
import { caseTitle, pathStatus, requestProblems, type PathCase } from "@/lib/pathology";
import type { Ack } from "@/lib/results";
import type { OrderEntry, Patient } from "@/lib/types";
import { Sources, SubTabs, saveFile } from "./DeskParts";
import { DenyNote, useDeny, useMe } from "./RoleContext";

type Person = { patient: Patient; room: string; entries: OrderEntry[] };
type Tab = "list" | "exam" | "scope" | "report" | "read";

interface Props {
  /** Every inpatient (all wards). */
  people: Person[];
  desk: EndoDesk;
  onDesk: (f: (d: EndoDesk) => EndoDesk) => void;
  pathology: PathCase[];
  onAddPath: (c: PathCase) => void;
  /** Open the 病理 screen. */
  onGoPath: () => void;
  acks: Record<string, Ack>;
  today: CalendarDate;
  nowTime: string;
  /** The tab shown first (for tests). */
  start?: Tab;
}

const card = "rounded-lg border border-rule bg-sheet";
const field = "rounded border border-rule bg-paper px-1.5 py-0.5 outline-none focus:border-ai";
const btn = "rounded bg-ai px-2.5 py-0.5 font-bold text-white disabled:opacity-40";
const STATUS_STYLE: Record<EndoStatus, string> = { 予約: "text-ink-soft", 受付済み: "font-bold text-ai", 検査中: "font-bold text-yamabuki", 実施済み: "font-bold text-yamabuki", 報告済み: "text-wakatake", 中止: "text-shu" };
const whenText = (a: number) => {
  const d = Math.floor(a / 1440);
  const m = a - d * 1440;
  const t = `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  return `${d === 0 ? "今日" : d === 1 ? "明日" : d === -1 ? "昨日" : d < 0 ? `${-d}日前` : `${d}日後`} ${t}`;
};

/**
 * 内視鏡室: the endoscopies doctors ordered — 予約・受付, 前処置・鎮静・観察・実施記録, the 洗浄・消毒 of the
 * scopes, the report and the biopsy sent to 病理, and whether the ordering doctor has read the report. No AI.
 */
export function EndoView(p: Props) {
  const [tab, setTab] = useState<Tab>(p.start ?? "list");
  const rows = endoRows(p.people, p.desk);
  const waitingScopes = p.desk.reprocess.filter((r) => nextReprocessStep(r) !== null).length;
  return (
    <section aria-label="内視鏡室" className="scroll-thin min-h-0 flex-1 overflow-auto bg-paper">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-rule bg-sheet px-5 py-3">
        <h1 className="flex items-center gap-1.5 text-lg font-bold">
          <Cable size={18} className="text-ai" />
          内視鏡室

        </h1>
        <SubTabs
          label="内視鏡室の画面"
          value={tab}
          onChange={setTab}
          tabs={[
            { key: "list", label: "予約・受付", icon: ClipboardList, badge: rows.filter((r) => r.status === "予約" && Math.floor(r.at / 1440) === 0).length },
            { key: "exam", label: "前処置・鎮静・実施", icon: Stethoscope, badge: rows.filter((r) => r.status === "受付済み" || r.status === "検査中").length },
            { key: "scope", label: "洗浄・消毒", icon: ShowerHead, badge: waitingScopes },
            { key: "report", label: "レポート・病理", icon: FilePen, badge: rows.filter((r) => r.status === "実施済み").length },
            { key: "read", label: "結果と既読", icon: ListChecks },
          ]}
        />
      </header>
      <div className="space-y-4 px-5 py-4 text-[13px]">
        {tab === "list" && <List {...p} rows={rows} />}
        {tab === "exam" && <Exam {...p} rows={rows} />}
        {tab === "scope" && <Scopes {...p} />}
        {tab === "report" && <Reports {...p} rows={rows} />}
        {tab === "read" && <Read {...p} rows={rows} />}
        <p className="text-[11px] text-ink-faint">
          {ENDO_HOUSE_RULES.rooms}
          {ENDO_HOUSE_RULES.scopes}
          {ENDO_HOUSE_RULES.roles}所見と診断を書くのは医師で、コードは判定しません。
        </p>
        <Sources items={Object.values(ENDO_SOURCES)} />
      </div>
    </section>
  );
}

const put = (onDesk: Props["onDesk"], r: Pick<EndoRow, "orderId" | "patientId" | "test">, f: (w: EndoWork) => EndoWork) =>
  onDesk((d) => ({ ...d, works: { ...d.works, [r.orderId]: f(d.works[r.orderId] ?? newWork(r.orderId, r.patientId, r.test)) } }));

function Head({ r }: { r: EndoRow }) {
  return (
    <header className="flex flex-wrap items-baseline gap-x-3">
      <span className="nums">
        {displayText(whenText(r.at))}
        {r.work?.slot && <span className="ml-1 text-ink-soft">{r.work.slot.room}</span>}
        {r.priority === "至急" && <span className="ml-1 rounded bg-shu px-1 text-[10px] font-bold text-white">至急</span>}
      </span>
      <b>
        {r.room}　{r.name}
      </b>
      <span className="font-bold">{r.testName}</span>
      <span className="text-ink-soft">
        目的：{r.purpose}
        {r.transport ? `（${r.transport}）` : ""}　{displayText(r.orderedBy)}
      </span>
      <span className={STATUS_STYLE[r.status]}>{r.status}</span>
    </header>
  );
}

// ---------------------------------------------------------------------------
// 予約・受付
// ---------------------------------------------------------------------------

function List({ rows, onDesk, nowTime }: Props & { rows: EndoRow[] }) {
  const me = useMe();
  const locked = !!useDeny()("endo.desk");
  const [slot, setSlot] = useState<Record<string, { room: string; time: string }>>({});
  const [reason, setReason] = useState<Record<string, string>>({});
  const log = (r: EndoRow, what: string, detail = "") => auditLog({ role: me.role, actor: me.name, action: `確定（内視鏡の${what}）`, patient: r.name, detail: `${r.testName}${detail}` });
  const open = rows.filter((r) => r.status !== "報告済み" && r.status !== "中止");
  return (
    <section className="space-y-2">
      <p className="hint text-[11px] text-ink-soft">医師が出した内視鏡（胃カメラ・大腸・気管支鏡）が並びます。部屋と時刻の枠を決めて予約し、来室したら「受付」。できなかったときは理由を書いて中止にします。</p>
      <DenyNote action="endo.desk" />
      {open.length === 0 && <p className={`${card} px-4 py-3 text-ink-soft`}>予約・受付を待っている内視鏡はありません。</p>}
      {open.map((r) => {
        const s = slot[r.orderId] ?? { room: r.work?.slot?.room ?? ROOMS[0], time: r.work?.slot?.time ?? "" };
        return (
          <article key={r.orderId} className={`${card} p-3 text-[12px]`}>
            <Head r={r} />
            {r.comment && <p className="text-ink-soft">コメント：{r.comment}</p>}
            {r.work?.arrived && (
              <p className="text-ink-soft">
                受付 {r.work.arrived.time} {displayText(r.work.arrived.by)}
              </p>
            )}
            {r.status === "予約" && (
              <p className="mt-1 flex flex-wrap items-center gap-2">
                <select value={s.room} onChange={(e) => setSlot({ ...slot, [r.orderId]: { ...s, room: e.target.value } })} aria-label="部屋" className={field} disabled={locked}>
                  {ROOMS.map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
                <TimeInput step={1800} value={s.time} onChange={(e) => setSlot({ ...slot, [r.orderId]: { ...s, time: e.target.value } })} aria-label="予約の時刻" className={field} disabled={locked} />
                <button
                  type="button"
                  disabled={locked || !/^\d{2}:\d{2}$/.test(s.time)}
                  onClick={() => {
                    put(onDesk, r, (w) => ({ ...w, slot: { room: s.room, time: s.time, by: me.name } }));
                    log(r, "予約の枠", `　${s.room} ${s.time}`);
                  }}
                  className="rounded border border-ai px-2 text-ai disabled:opacity-40"
                >
                  枠を決める
                </button>
                <button
                  type="button"
                  disabled={locked}
                  onClick={() => {
                    put(onDesk, r, (w) => ({ ...w, arrived: { day: 0, time: nowTime, by: me.name } }));
                    log(r, "受付");
                  }}
                  className={btn}
                >
                  受付（来室した）
                </button>
              </p>
            )}
            {(r.status === "予約" || r.status === "受付済み") && (
              <p className="mt-1 flex items-center gap-2">
                <input value={reason[r.orderId] ?? ""} onChange={(e) => setReason({ ...reason, [r.orderId]: e.target.value })} placeholder="中止の理由（例：前処置が不十分で延期）" aria-label="中止の理由" className={`${field} w-72`} disabled={locked} />
                <button
                  type="button"
                  disabled={locked || !(reason[r.orderId] ?? "").trim()}
                  onClick={() => {
                    put(onDesk, r, (w) => ({ ...w, notDone: { day: 0, time: nowTime, by: me.name, reason: reason[r.orderId].trim() } }));
                    log(r, "中止", `　${reason[r.orderId].trim()}`);
                  }}
                  className="rounded border border-shu px-2 text-shu disabled:opacity-40"
                >
                  中止
                </button>
              </p>
            )}
          </article>
        );
      })}
    </section>
  );
}

// ---------------------------------------------------------------------------
// 前処置・鎮静・実施
// ---------------------------------------------------------------------------

function Exam(p: Props & { rows: EndoRow[] }) {
  const ready = p.rows.filter((r) => r.status === "受付済み" || r.status === "検査中" || (r.status === "実施済み" && !r.work?.release && !!r.work?.sedation));
  const [pick, setPick] = useState<string | null>(null);
  const target = ready.find((r) => r.orderId === pick) ?? ready[0] ?? null;
  return (
    <section className="space-y-3">
      <p className="hint text-[11px] text-ink-soft">受付した患者の前処置、鎮静の薬と観察（意識・脈拍・血圧・SpO2）、実施記録（使ったスコープ・生検）を記録します。洗浄・消毒が済んでいないスコープは選べません。鎮静した患者は、医師が評価して監視を解除（退室）します。</p>
      <div className="flex flex-wrap gap-1 text-[12px]">
        {ready.length === 0 && <span className="text-ink-faint">受付した患者はいません。</span>}
        {ready.map((r) => (
          <button key={r.orderId} type="button" onClick={() => setPick(r.orderId)} className={`rounded border px-2 py-0.5 ${target?.orderId === r.orderId ? "border-ai bg-ai-soft font-bold text-ai" : "border-rule"}`}>
            {r.name} {r.testName.replace(/（.*?）/, "")}（{r.status}）
          </button>
        ))}
      </div>
      {target && <ExamForm key={target.orderId} {...p} r={target} />}
    </section>
  );
}

function ExamForm({ r, desk, onDesk, nowTime }: Props & { r: EndoRow }) {
  const me = useMe();
  const deny = useDeny();
  const nurseLock = !!deny("endo.desk");
  const docLock = !!deny("endo.doctor");
  const w = r.work ?? newWork(r.orderId, r.patientId, r.test);
  const [prep, setPrep] = useState({ what: "", time: nowTime });
  const [drug, setDrug] = useState({ name: "", dose: "", route: "静注", time: nowTime });
  const [sed, setSed] = useState({ o2: w.sedation?.o2 ?? "", doctor: w.sedation?.doctor ?? "", nurse: w.sedation?.nurse ?? me.name });
  const [obs, setObs] = useState<{ time: string; consciousness: Consciousness; hr: string; sbp: string; dbp: string; spo2: string }>({ time: nowTime, consciousness: "清明", hr: "", sbp: "", dbp: "", spo2: "" });
  const kind = scopeKindOf(r.test);
  const usable = usableScopes(desk, kind).map((s) => s.id);
  const [done, setDone] = useState({ start: "", end: nowTime, scope: usable[0] ?? "", doctor: me.role === "医師" ? me.name : "", assist: "", biopsy: "0", procedures: "", complication: "なし" });
  const [release, setRelease] = useState("");
  const problems = doneProblems(done, usable);
  const gaps = watchGaps(w);
  const log = (what: string, detail = "") => auditLog({ role: me.role, actor: me.name, action: `確定（内視鏡の${what}）`, patient: r.name, detail: `${r.testName}${detail ? `　${detail}` : ""}` });
  const num = (s: string) => (s.trim() === "" ? undefined : Number(s));
  return (
    <article className={`${card} space-y-3 p-3 text-[12px]`}>
      <Head r={r} />
      <section>
        <h3 className="font-bold">前処置</h3>
        <ul className="nums">
          {w.prep.map((x, i) => (
            <li key={i}>
              {x.time} {x.what} <span className="text-ink-soft">（{displayText(x.by)}）</span>
            </li>
          ))}
          {w.prep.length === 0 && <li className="text-ink-faint">まだありません。</li>}
        </ul>
        {!w.done && (
          <p className="mt-1 flex flex-wrap gap-1">
            <TimeInput value={prep.time} onChange={(e) => setPrep({ ...prep, time: e.target.value })} aria-label="前処置の時刻" className={field} disabled={nurseLock} />
            <input value={prep.what} onChange={(e) => setPrep({ ...prep, what: e.target.value })} placeholder="例：消泡剤を内服、咽頭麻酔、腸管洗浄剤、排便の状態" aria-label="前処置" className={`${field} min-w-0 flex-1`} disabled={nurseLock} />
            <button
              type="button"
              disabled={nurseLock || !prep.what.trim()}
              onClick={() => {
                put(onDesk, r, (x) => ({ ...x, prep: [...x.prep, { what: prep.what.trim(), time: prep.time, by: me.name }] }));
                log("前処置", prep.what.trim());
                setPrep({ what: "", time: nowTime });
              }}
              className="rounded border border-ai px-2 text-ai disabled:opacity-40"
            >
              足す
            </button>
          </p>
        )}
      </section>

      <section>
        <h3 className="font-bold">鎮静</h3>
        <p className="text-[11px] text-ink-soft">{ENDO_RULES.sedationRecord}</p>
        <ul className="nums">
          {(w.sedation?.drugs ?? []).map((x, i) => (
            <li key={i}>
              {x.time} {x.name} {x.dose} {x.route}
            </li>
          ))}
          {w.sedation && (
            <li className="text-ink-soft">
              酸素：{w.sedation.o2 || "なし"}　鎮静の担当：医師 {displayText(w.sedation.doctor || "—")}・看護師 {displayText(w.sedation.nurse || "—")}
            </li>
          )}
          {!w.sedation && <li className="text-ink-faint">鎮静なし（記録なし）</li>}
        </ul>
        {!w.done && (
          <div className="mt-1 space-y-1">
            <p className="flex flex-wrap gap-1">
              <TimeInput value={drug.time} onChange={(e) => setDrug({ ...drug, time: e.target.value })} aria-label="投与の時刻" className={field} disabled={nurseLock} />
              <input value={drug.name} onChange={(e) => setDrug({ ...drug, name: e.target.value })} placeholder="鎮静薬の名前" aria-label="鎮静薬の名前" className={`${field} w-36`} disabled={nurseLock} />
              <input value={drug.dose} onChange={(e) => setDrug({ ...drug, dose: e.target.value })} placeholder="量（例：2mg）" aria-label="投与量" className={`${field} w-24`} disabled={nurseLock} />
              <select value={drug.route} onChange={(e) => setDrug({ ...drug, route: e.target.value })} aria-label="投与経路" className={field} disabled={nurseLock}>
                {["静注", "筋注", "その他"].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </p>
            <p className="flex flex-wrap gap-1">
              <input value={sed.o2} onChange={(e) => setSed({ ...sed, o2: e.target.value })} placeholder="酸素（例：鼻カニュラ 2L/分）" aria-label="酸素投与量" className={`${field} w-48`} disabled={nurseLock} />
              <input value={sed.doctor} onChange={(e) => setSed({ ...sed, doctor: e.target.value })} placeholder="鎮静を担当した医師" aria-label="鎮静を担当した医師" className={`${field} w-40`} disabled={nurseLock} />
              <input value={sed.nurse} onChange={(e) => setSed({ ...sed, nurse: e.target.value })} placeholder="担当した看護師" aria-label="担当した看護師" className={`${field} w-40`} disabled={nurseLock} />
              <button
                type="button"
                disabled={nurseLock || !drug.name.trim() || !drug.dose.trim() || !sed.doctor.trim() || !sed.nurse.trim()}
                onClick={() => {
                  put(onDesk, r, (x) => ({ ...x, sedation: { drugs: [...(x.sedation?.drugs ?? []), { name: drug.name.trim(), dose: drug.dose.trim(), route: drug.route, time: drug.time }], o2: sed.o2.trim(), doctor: sed.doctor.trim(), nurse: sed.nurse.trim() } }));
                  log("鎮静", `${drug.name.trim()} ${drug.dose.trim()} ${drug.route}`);
                  setDrug({ name: "", dose: "", route: "静注", time: nowTime });
                }}
                className="rounded border border-ai px-2 text-ai disabled:opacity-40"
              >
                鎮静薬を記録
              </button>
            </p>
          </div>
        )}
      </section>

      <section>
        <h3 className="font-bold">観察（意識・脈拍・血圧・SpO2）</h3>
        <p className="text-[11px] text-ink-soft">{ENDO_RULES.watch}</p>
        <table className="nums text-[12px]">
          <tbody>
            {w.watch.map((x, i) => (
              <tr key={i}>
                <td className="pr-3">{x.time}</td>
                <td className="pr-3">{x.consciousness}</td>
                <td className="pr-3">HR {x.hr ?? "—"}</td>
                <td className="pr-3">
                  BP {x.sbp ?? "—"}/{x.dbp ?? "—"}
                </td>
                <td className="pr-3">SpO2 {x.spo2 ?? "—"}%</td>
                <td className="text-ink-soft">{displayText(x.by)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {gaps.length > 0 && <p className="font-bold text-yamabuki">検査中の観察の間隔が5分を超えています：{displayText(gaps.map((g) => `${g.from}〜${g.to}（${g.minutes}分）`).join("、"))}</p>}
        {!w.release && (
          <p className="mt-1 flex flex-wrap gap-1">
            <TimeInput value={obs.time} onChange={(e) => setObs({ ...obs, time: e.target.value })} aria-label="観察の時刻" className={field} disabled={nurseLock} />
            <select value={obs.consciousness} onChange={(e) => setObs({ ...obs, consciousness: e.target.value as Consciousness })} aria-label="意識" className={field} disabled={nurseLock}>
              {CONSCIOUSNESS.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
            {(["hr", "sbp", "dbp", "spo2"] as const).map((k) => (
              <input key={k} inputMode="numeric" value={obs[k]} onChange={(e) => setObs({ ...obs, [k]: e.target.value })} placeholder={{ hr: "HR", sbp: "収縮期", dbp: "拡張期", spo2: "SpO2" }[k]} aria-label={{ hr: "脈拍", sbp: "収縮期血圧", dbp: "拡張期血圧", spo2: "SpO2" }[k]} className={`${field} w-16 text-right`} disabled={nurseLock} />
            ))}
            <button
              type="button"
              disabled={nurseLock}
              onClick={() => {
                put(onDesk, r, (x) => ({ ...x, watch: [...x.watch, { time: obs.time, consciousness: obs.consciousness, hr: num(obs.hr), sbp: num(obs.sbp), dbp: num(obs.dbp), spo2: num(obs.spo2), by: me.name }].sort((a, b) => a.time.localeCompare(b.time)) }));
                log("観察", `${obs.time} ${obs.consciousness}`);
                setObs({ time: nowTime, consciousness: obs.consciousness, hr: "", sbp: "", dbp: "", spo2: "" });
              }}
              className="rounded border border-ai px-2 text-ai disabled:opacity-40"
            >
              観察を記録
            </button>
          </p>
        )}
      </section>

      <section>
        <h3 className="font-bold">実施記録</h3>
        {w.done ? (
          <p className="nums">
            {w.done.start}〜{w.done.end}　スコープ {w.done.scope}　実施医 {displayText(w.done.doctor)}　介助 {displayText(w.done.assist || "—")}　生検 {w.done.biopsy}個　処置：{w.done.procedures || "なし"}　偶発症：{w.done.complication}
          </p>
        ) : (
          <div className="space-y-1">
            <p className="flex flex-wrap items-center gap-1">
              <TimeInput value={done.start} onChange={(e) => setDone({ ...done, start: e.target.value })} aria-label="開始" className={field} disabled={docLock} />〜
              <TimeInput value={done.end} onChange={(e) => setDone({ ...done, end: e.target.value })} aria-label="終了" className={field} disabled={docLock} />
              <select value={done.scope} onChange={(e) => setDone({ ...done, scope: e.target.value })} aria-label="使ったスコープ" className={field} disabled={docLock}>
                <option value="">スコープを選ぶ</option>
                {SCOPES.filter((s) => s.kind === kind).map((s) => (
                  <option key={s.id} value={s.id} disabled={!usable.includes(s.id)}>
                    {s.id}（{scopeState(desk, s.id)}）
                  </option>
                ))}
              </select>
              <input value={done.doctor} onChange={(e) => setDone({ ...done, doctor: e.target.value })} placeholder="実施医" aria-label="実施医" className={`${field} w-40`} disabled={docLock} />
              <input value={done.assist} onChange={(e) => setDone({ ...done, assist: e.target.value })} placeholder="介助" aria-label="介助" className={`${field} w-32`} disabled={docLock} />
              <label className="flex items-center gap-1">
                生検
                <input inputMode="numeric" value={done.biopsy} onChange={(e) => setDone({ ...done, biopsy: e.target.value })} aria-label="生検の個数" className={`${field} w-10 text-right`} disabled={docLock} />個
              </label>
            </p>
            <p className="flex flex-wrap gap-1">
              <input value={done.procedures} onChange={(e) => setDone({ ...done, procedures: e.target.value })} placeholder="処置（例：止血、ポリペクトミー）" aria-label="処置" className={`${field} min-w-0 flex-1`} disabled={docLock} />
              <input value={done.complication} onChange={(e) => setDone({ ...done, complication: e.target.value })} placeholder="偶発症" aria-label="偶発症" className={`${field} w-40`} disabled={docLock} />
            </p>
            {problems.length > 0 && <p className="text-ink-soft">足りないもの：{problems.join("、")}</p>}
            <DenyNote action="endo.doctor" />
            <button
              type="button"
              disabled={docLock || problems.length > 0}
              onClick={() => {
                const biopsy = Math.max(0, Math.floor(Number(done.biopsy) || 0));
                put(onDesk, r, (x) => ({ ...x, done: { day: 0, start: done.start, end: done.end, scope: done.scope, doctor: done.doctor.trim(), assist: done.assist.trim(), biopsy, procedures: done.procedures.trim(), complication: done.complication.trim() || "なし" } }));
                onDesk((d) => ({ ...d, reprocess: [...d.reprocess, { id: `rp-${r.orderId}`, scope: done.scope, orderId: r.orderId, patientId: r.patientId, used: { day: 0, time: done.end } }] }));
                log("実施記録", `${done.start}〜${done.end} ${done.scope} 生検${biopsy}個`);
              }}
              className={btn}
            >
              実施を記録（スコープは洗浄待ちになる）
            </button>
          </div>
        )}
      </section>

      {w.done && w.sedation && (
        <section>
          <h3 className="font-bold">監視解除（退室）</h3>
          <p className="text-[11px] text-ink-soft">{ENDO_RULES.release}</p>
          {w.release ? (
            <p>
              {w.release.time} {displayText(w.release.by)}：{w.release.assessment}
            </p>
          ) : (
            <p className="mt-1 flex gap-1">
              <input value={release} onChange={(e) => setRelease(e.target.value)} placeholder="評価（意識・呼吸・SpO2・血圧と脈拍・歩けるか）" aria-label="監視解除の評価" className={`${field} min-w-0 flex-1`} disabled={docLock} />
              <button
                type="button"
                disabled={docLock || !release.trim()}
                onClick={() => {
                  put(onDesk, r, (x) => ({ ...x, release: { day: 0, time: nowTime, by: me.name, assessment: release.trim() } }));
                  log("監視解除", release.trim());
                }}
                className={btn}
              >
                監視を解除する
              </button>
            </p>
          )}
        </section>
      )}
    </article>
  );
}

// ---------------------------------------------------------------------------
// 洗浄・消毒
// ---------------------------------------------------------------------------

function Scopes({ desk, onDesk, people, today, nowTime }: Props) {
  const me = useMe();
  const locked = !!useDeny()("endo.desk");
  const [washer, setWasher] = useState<Record<string, string>>({});
  const [checkNote, setCheckNote] = useState("");
  const nowAbs = abs(0, nowTime);
  const nameOf = (pid: string) => people.find((x) => x.patient.id === pid)?.patient.name ?? pid;
  const at = { day: 0, time: nowTime, by: me.name };
  const step = (r: Reprocess, f: (x: Reprocess) => Reprocess, what: string) => {
    auditLog({ role: me.role, actor: me.name, action: `確定（スコープの${what}）`, patient: nameOf(r.patientId), detail: r.scope });
    onDesk((d) => ({ ...d, reprocess: d.reprocess.map((x) => (x.id === r.id ? f(x) : x)) }));
  };
  const queue = desk.reprocess.filter((r) => nextReprocessStep(r) !== null);
  const history = [...desk.reprocess].reverse();
  const concentration = (r: Reprocess) => {
    if (!r.machine) return "—";
    const c = desk.checks.filter((x) => x.washer === r.machine!.washer && x.day === r.machine!.start.day && x.time <= r.machine!.start.time).at(-1);
    return c ? `${c.ok ? "最低使用濃度以上" : "下回った"}（${c.time} ${c.by}）` : "確認の記録なし";
  };
  const row = (r: Reprocess) => [
    formatShort(addDays(today, r.used.day)),
    r.machine?.start.time ?? r.used.time,
    `${nameOf(r.patientId)}（${r.patientId}）`,
    r.scope,
    r.manual?.by ?? r.bedside?.by ?? "—",
    r.machine ? `${r.machine.washer}（${r.machine.agent}）` : "—",
    concentration(r),
    r.leak && !r.leak.ok ? "漏水あり（使用停止）" : r.stored ? `保管 ${r.stored.time}` : (nextReprocessStep(r) ?? ""),
  ];
  const HEAD = ["年月日", "時刻", "患者氏名（ID）", "内視鏡番号", "洗浄担当者", "洗浄消毒機番号（消毒薬）", "消毒薬濃度", "状態"];
  return (
    <section className="space-y-3">
      <p className="hint text-[11px] text-ink-soft">スコープは使うたびに、ベッドサイド洗浄 → 漏水テスト → 用手洗浄 → 自動洗浄・消毒装置 → 保管 の順に記録します。保管まで済んだスコープだけが次の患者に選べます。装置は、その日の消毒薬の濃度を確かめてから使えます。</p>
      <ul className="space-y-0.5 text-[11px] text-ink-soft">
        <li>{ENDO_RULES.steps}</li>
        <li>{ENDO_RULES.agents}</li>
        <li>{ENDO_RULES.concentration}</li>
        <li>{ENDO_RULES.storage}</li>
      </ul>
      <DenyNote action="endo.desk" />
      <div className="grid gap-2 md:grid-cols-3">
        {SCOPES.map((s) => {
          const st = scopeState(desk, s.id);
          const last = lastUse(desk, s.id);
          return (
            <div key={s.id} className={`${card} px-3 py-1.5 text-[12px]`}>
              <b>{s.id}</b> <span className="text-ink-soft">{s.name}</span>
              <span className={`block ${st === "使用可" ? "text-wakatake" : st.startsWith("使用停止") ? "font-bold text-shu" : "font-bold text-yamabuki"}`}>{st}</span>
              {last && (
                <span className="block text-[11px] text-ink-soft">
                  最後の使用：{last.used.time} {nameOf(last.patientId)}
                </span>
              )}
            </div>
          );
        })}
      </div>

      <h2 className="text-xs font-bold text-ink-soft">洗浄消毒装置：今日の消毒薬の濃度確認</h2>
      <div className="grid gap-2 md:grid-cols-2">
        {WASHERS.map((wsh) => {
          const c = todayCheck(desk, wsh);
          return (
            <div key={wsh} className={`${card} space-y-1 px-3 py-2 text-[12px]`}>
              <b>{wsh}</b>（{WASHER_AGENT[wsh]}）
              <span className={`block ${c?.ok ? "text-wakatake" : "font-bold text-shu"}`}>{displayText(c ? `${c.time} ${c.by}：${c.ok ? "最低使用濃度以上" : "下回った（交換して確かめ直す）"}${c.note ? `（${c.note}）` : ""}` : "今日の確認がまだです")}</span>
              <p className="flex flex-wrap gap-1">
                <input value={checkNote} onChange={(e) => setCheckNote(e.target.value)} placeholder="メモ（例：テストストリップ）" aria-label="濃度確認のメモ" className={`${field} w-40`} disabled={locked} />
                {[true, false].map((ok) => (
                  <button
                    key={String(ok)}
                    type="button"
                    disabled={locked}
                    onClick={() => {
                      auditLog({ role: me.role, actor: me.name, action: "確定（消毒薬の濃度確認）", detail: `${wsh}：${ok ? "最低使用濃度以上" : "下回った"}` });
                      onDesk((d) => ({ ...d, checks: [...d.checks, { washer: wsh, day: 0, time: nowTime, by: me.name, ok, ...(checkNote.trim() ? { note: checkNote.trim() } : {}) }] }));
                      setCheckNote("");
                    }}
                    className={`rounded border px-2 disabled:opacity-40 ${ok ? "border-wakatake text-wakatake" : "border-shu text-shu"}`}
                  >
                    {ok ? "最低使用濃度以上" : "下回った（交換する）"}
                  </button>
                ))}
              </p>
            </div>
          );
        })}
      </div>

      <h2 className="text-xs font-bold text-ink-soft">洗浄・消毒の途中のスコープ（{queue.length}）</h2>
      {queue.length === 0 && <p className="text-ink-faint">ありません。</p>}
      {queue.map((r) => {
        const next = nextReprocessStep(r);
        const chosen = washer[r.id] ?? WASHERS[0];
        const block = washerBlock(desk, chosen);
        const left = machineLeft(r, nowAbs);
        return (
          <article key={r.id} className={`${card} p-3 text-[12px]`}>
            <p>
              <b>{r.scope}</b>　{nameOf(r.patientId)}（{r.patientId}）　使用 {r.used.time}
              <span className="ml-2 text-ink-soft">
                {displayText([r.bedside && `ベッドサイド洗浄 ${r.bedside.time} ${r.bedside.by}`, r.leak && `漏水テスト ${r.leak.time} ${r.leak.ok ? "漏れなし" : "漏れあり"}`, r.manual && `用手洗浄 ${r.manual.time} ${r.manual.by}`, r.machine && `${r.machine.washer} ${r.machine.start.time}〜${r.machine.end?.time ?? ""}${r.machine.ok === false ? "（異常）" : ""}`].filter(Boolean).join("　"))}
              </span>
            </p>
            <p className="mt-1 flex flex-wrap items-center gap-2">
              次：<b>{next}</b>
              {next === "ベッドサイド洗浄" && (
                <button type="button" disabled={locked} onClick={() => step(r, (x) => ({ ...x, bedside: at }), "ベッドサイド洗浄")} className={btn}>
                  外表面の清拭と吸引洗浄をした
                </button>
              )}
              {next === "漏水テスト" && (
                <>
                  <button type="button" disabled={locked} onClick={() => step(r, (x) => ({ ...x, leak: { ...at, ok: true } }), "漏水テスト（漏れなし）")} className={btn}>
                    漏れなし
                  </button>
                  <button type="button" disabled={locked} onClick={() => step(r, (x) => ({ ...x, leak: { ...at, ok: false } }), "漏水テスト（漏れあり・使用停止）")} className="rounded border border-shu px-2 text-shu disabled:opacity-40">
                    漏れあり（使用を止める）
                  </button>
                </>
              )}
              {next === "用手洗浄" && (
                <button type="button" disabled={locked} onClick={() => step(r, (x) => ({ ...x, manual: at }), "用手洗浄")} className={btn}>
                  ブラッシングとすすぎをした
                </button>
              )}
              {next === "装置で消毒" && (
                <>
                  <select value={chosen} onChange={(e) => setWasher({ ...washer, [r.id]: e.target.value })} aria-label="洗浄消毒装置" className={field} disabled={locked}>
                    {WASHERS.map((x) => (
                      <option key={x}>{x}</option>
                    ))}
                  </select>
                  <button type="button" disabled={locked || !!block} onClick={() => step(r, (x) => ({ ...x, machine: { washer: chosen, agent: WASHER_AGENT[chosen], start: { day: 0, time: nowTime }, by: me.name } }), `自動洗浄・消毒の開始（${chosen}）`)} className={btn}>
                    装置にかけた
                  </button>
                  {block && <span className="text-shu">{block}</span>}
                </>
              )}
              {next === "装置の終了" && (
                <>
                  {left > 0 && <span className="text-yamabuki">消毒の時間があと {left}分</span>}
                  <button type="button" disabled={locked || left > 0} onClick={() => step(r, (x) => ({ ...x, machine: { ...x.machine!, end: { day: 0, time: nowTime }, ok: true } }), "自動洗浄・消毒の終了（正常）")} className={btn}>
                    正常に終わった
                  </button>
                  <button type="button" disabled={locked} onClick={() => step(r, (x) => ({ ...x, machine: { ...x.machine!, end: { day: 0, time: nowTime }, ok: false } }), "自動洗浄・消毒の異常（やり直す）")} className="rounded border border-shu px-2 text-shu disabled:opacity-40">
                    異常で止まった（やり直す）
                  </button>
                </>
              )}
              {next === "保管" && (
                <button type="button" disabled={locked} onClick={() => step(r, (x) => ({ ...x, stored: at }), "保管")} className={btn}>
                  アルコールフラッシュ・乾燥し、ボタン類を外して保管した
                </button>
              )}
            </p>
          </article>
        );
      })}

      <div className="flex items-center gap-2">
        <h2 className="text-xs font-bold text-ink-soft">洗浄・消毒の履歴</h2>
        <button type="button" onClick={() => saveFile(`洗浄消毒履歴_${formatShort(today).replace(/[/（）]/g, "")}.csv`, `﻿${[HEAD, ...history.map(row)].map((cols) => cols.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\r\n")}`)} className="flex items-center gap-1 rounded border border-rule px-2 py-0.5 text-[11px] text-ink-soft hover:text-ai">
          <Download size={12} />
          CSV で保存
        </button>
      </div>
      <p className="text-[11px] text-ink-soft">{ENDO_RULES.history}</p>
      <table className={`${card} w-full border-collapse text-[11px]`}>
        <thead>
          <tr className="border-b border-rule text-left text-ink-soft">
            {HEAD.map((h) => (
              <th key={h} className="px-2 py-1 font-normal">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {history.map((r) => (
            <tr key={r.id} className="border-b border-rule-soft">
              {row(r).map((c, i) => (
                <td key={i} className="nums px-2 py-1">
                  {c}
                </td>
              ))}
            </tr>
          ))}
          {history.length === 0 && (
            <tr>
              <td colSpan={HEAD.length} className="px-2 py-3 text-center text-ink-faint">
                まだありません。
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );
}

// ---------------------------------------------------------------------------
// レポート・病理
// ---------------------------------------------------------------------------

function Reports(p: Props & { rows: EndoRow[] }) {
  const ready = p.rows.filter((r) => r.status === "実施済み" || r.status === "報告済み");
  const [pick, setPick] = useState<string | null>(null);
  const target = ready.find((r) => r.orderId === pick) ?? ready.find((r) => r.status === "実施済み") ?? ready[0] ?? null;
  return (
    <section className="space-y-3">
      <p className="hint text-[11px] text-ink-soft">実施した内視鏡の所見と診断を医師が書いて確定します。確定すると、オーダした医師のカルテの「未確認の結果」に出ます。生検をしたら、病理への依頼をここから出せます（病理の画面の受付に並びます）。</p>
      <div className="flex flex-wrap gap-1 text-[12px]">
        {ready.length === 0 && <span className="text-ink-faint">実施した内視鏡はありません。</span>}
        {ready.map((r) => (
          <button key={r.orderId} type="button" onClick={() => setPick(r.orderId)} className={`rounded border px-2 py-0.5 ${target?.orderId === r.orderId ? "border-ai bg-ai-soft font-bold text-ai" : "border-rule"} ${r.status === "報告済み" ? "text-ink-soft" : ""}`}>
            {r.name} {r.testName.replace(/（.*?）/, "")}
            {r.status === "報告済み" ? "（報告済み）" : ""}
          </button>
        ))}
      </div>
      {target && <ReportForm key={target.orderId} {...p} r={target} />}
    </section>
  );
}

function ReportForm({ r, onDesk, nowTime, pathology, onAddPath, onGoPath }: Props & { r: EndoRow }) {
  const me = useMe();
  const locked = !!useDeny()("endo.doctor");
  const w = r.work!;
  const prev = w.report;
  const [findings, setFindings] = useState(prev?.findings ?? "");
  const [diagnosis, setDiagnosis] = useState(prev?.diagnosis ?? "");
  const [reason, setReason] = useState("");
  const [path, setPath] = useState({ site: "", containers: String(w.done?.biopsy ?? 1), clinical: r.purpose, question: "" });
  const problems = endoReportProblems({ findings, diagnosis, reason }, !!prev);
  const pc = w.pathCaseId ? pathology.find((c) => c.id === w.pathCaseId) : undefined;
  const at = { day: 0, time: nowTime };
  const draft = biopsyCase(w, at, me.name, { site: path.site, containers: Math.floor(Number(path.containers) || 0), clinical: path.clinical, question: path.question });
  const pathMissing = requestProblems(draft);
  return (
    <article className={`${card} space-y-2 p-3 text-[12px]`}>
      <Head r={r} />
      {w.done && (
        <p className="nums text-ink-soft">
          実施 {w.done.start}〜{w.done.end}　{w.done.scope}　{displayText(w.done.doctor)}　生検 {w.done.biopsy}個　処置：{w.done.procedures || "なし"}　偶発症：{w.done.complication}
        </p>
      )}
      {prev && (
        <p className="text-ink-soft">
          いまの版：第{versionOf(w)}版（{prev.time} {displayText(prev.by)}）
        </p>
      )}
      <label className="block">
        所見
        <textarea value={findings} onChange={(e) => setFindings(e.target.value)} rows={4} className={`${field} block w-full`} disabled={locked} />
      </label>
      <label className="block">
        診断（医師の「未確認の結果」に出る）
        <input value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} className={`${field} block w-full`} disabled={locked} />
      </label>
      {prev && <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="訂正の理由" aria-label="訂正の理由" className={`${field} w-full`} disabled={locked} />}
      {problems.length > 0 && (
        <ul className="list-disc pl-5 text-ink-soft">
          {problems.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      )}
      <DenyNote action="endo.doctor" />
      <button
        type="button"
        disabled={locked || problems.length > 0}
        onClick={() => {
          const rep = { day: 0, time: nowTime, findings: findings.trim(), diagnosis: diagnosis.trim(), by: me.name, ...(prev ? { reason: reason.trim() } : {}) };
          put(onDesk, r, (x) => ({ ...x, report: rep, ...(x.report ? { earlier: [...(x.earlier ?? []), x.report] } : {}) }));
          auditLog({ role: me.role, actor: me.name, action: prev ? "確定（内視鏡のレポートを訂正）" : "確定（内視鏡のレポート）", patient: r.name, detail: `${r.testName}　${diagnosis.trim().slice(0, 60)}` });
        }}
        className={btn}
      >
        {prev ? "訂正を確定" : "レポートを確定"}
      </button>

      {(w.done?.biopsy ?? 0) > 0 && (
        <section className="border-t border-rule pt-2">
          <h3 className="flex items-center gap-1 font-bold">
            <Microscope size={14} />
            病理への提出（生検 {w.done!.biopsy}個）
          </h3>
          {pc ? (
            <p>
              {caseTitle(pc)}　{pc.received?.number ?? "受付番号はまだ"}　<b>{pathStatus(pc)}</b>
              <button type="button" onClick={onGoPath} className="ml-2 rounded border border-ai px-2 text-ai">
                病理の画面を開く
              </button>
            </p>
          ) : (
            <div className="space-y-1">
              <p className="flex flex-wrap gap-1">
                <input value={path.site} onChange={(e) => setPath({ ...path, site: e.target.value })} placeholder="臓器・部位（例：胃 前庭部）" aria-label="臓器・部位" className={`${field} w-48`} disabled={locked} />
                <label className="flex items-center gap-1">
                  容器
                  <input inputMode="numeric" value={path.containers} onChange={(e) => setPath({ ...path, containers: e.target.value })} aria-label="容器の数" className={`${field} w-10 text-right`} disabled={locked} />個
                </label>
                <input value={path.question} onChange={(e) => setPath({ ...path, question: e.target.value })} placeholder="病理に知りたいこと" aria-label="病理に知りたいこと" className={`${field} min-w-0 flex-1`} disabled={locked} />
              </p>
              <input value={path.clinical} onChange={(e) => setPath({ ...path, clinical: e.target.value })} placeholder="臨床診断・経過" aria-label="臨床診断・経過" className={`${field} w-full`} disabled={locked} />
              {pathMissing.length > 0 && <p className="text-ink-soft">足りないもの：{pathMissing.join("、")}</p>}
              <button
                type="button"
                disabled={locked || pathMissing.length > 0}
                onClick={() => {
                  onAddPath(draft);
                  put(onDesk, r, (x) => ({ ...x, pathCaseId: draft.id }));
                  auditLog({ role: me.role, actor: me.name, action: "確定（内視鏡の生検を病理へ提出）", patient: r.name, detail: caseTitle(draft) });
                }}
                className={btn}
              >
                病理へ依頼を出す（組織診・内視鏡下生検）
              </button>
            </div>
          )}
        </section>
      )}
    </article>
  );
}

// ---------------------------------------------------------------------------
// 結果と既読
// ---------------------------------------------------------------------------

function Read({ rows, desk, acks }: Props & { rows: EndoRow[] }) {
  const items = endoResultItems(desk);
  return (
    <table className={`${card} w-full border-collapse text-[12px]`}>
      <thead>
        <tr className="border-b border-rule text-left text-ink-soft">
          <th className="px-2 py-1 font-normal">予定</th>
          <th className="px-2 py-1 font-normal">患者</th>
          <th className="px-2 py-1 font-normal">検査</th>
          <th className="px-2 py-1 font-normal">状態</th>
          <th className="px-2 py-1 font-normal">診断</th>
          <th className="px-2 py-1 font-normal">オーダした医師の確認</th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 && (
          <tr>
            <td colSpan={6} className="px-2 py-3 text-center text-ink-faint">
              今日の前後の内視鏡はありません。
            </td>
          </tr>
        )}
        {[...rows]
          .sort((a, b) => a.at - b.at)
          .map((r) => {
            const item = items.find((i) => i.key.startsWith(`endo|${r.orderId}|`));
            const ack = item ? acks[item.key] : undefined;
            const rep = r.work?.report;
            return (
              <tr key={r.orderId} className="border-b border-rule-soft align-top">
                <td className="nums px-2 py-1">{displayText(whenText(r.at))}</td>
                <td className="px-2 py-1">
                  {r.room}　{r.name}
                </td>
                <td className="px-2 py-1">{r.testName}</td>
                <td className={`px-2 py-1 ${STATUS_STYLE[r.status]}`}>
                  {r.status}
                  {r.work?.notDone && <span className="block font-normal">{displayText(r.work.notDone.reason)}</span>}
                </td>
                <td className="px-2 py-1">{rep ? rep.diagnosis : "—"}</td>
                <td className={`px-2 py-1 ${rep && !ack ? "font-bold text-yamabuki" : "text-ink-soft"}`}>{displayText(rep ? (ack ? `${ack.at.time} ${ack.by}` : "まだ") : "—")}</td>
              </tr>
            );
          })}
      </tbody>
    </table>
  );
}
