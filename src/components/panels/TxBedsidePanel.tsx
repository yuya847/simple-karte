"use client";

import { useState } from "react";
import { auditLog } from "@/lib/audit";
import {
  BLOOD_RULES,
  BLOOD_SOURCES,
  SEVERE,
  SYMPTOMS,
  bagLabel,
  bedsideCheck,
  bloodState,
  momentOf,
  momentText,
  obsPlan,
  productName,
  txRequests,
  typeText,
  unitState,
  unitsOf,
  vitalSymptoms,
  type BloodBank,
  type BloodState,
  type BloodUnit,
  type ObsPoint,
  type Observation,
  type Symptom,
  type TxAdmin,
  type TxRequest,
} from "@/lib/blood-bank";
import { abs } from "@/lib/flowsheet";
import type { IoEntry } from "@/lib/io-balance";
import { txMinutes, txText, txVolume } from "@/lib/procedures";
import type { OrderEntry, Patient } from "@/lib/types";
import { DenyNote, useDeny, useMe } from "../RoleContext";

interface Props {
  patient: Patient;
  room: string;
  entries: OrderEntry[];
  bank: BloodBank;
  onBank: (f: (b: BloodBank) => BloodBank) => void;
  /** The patient's blood type in the record before this session. */
  recordBlood: Patient["blood"];
  nowTime: string;
  /** 水分出納: the volume transfused goes in as IN（輸血）when the bag is finished or stopped. */
  onIo: (es: IoEntry[]) => void;
}

const field = "rounded border border-rule bg-paper px-1 py-0.5 outline-none focus:border-ai";

/** 輸血の実施: the bedside check of each bag, observation at the start, 5 and 15 minutes and the end, and reactions. */
export function TxBedsidePanel(p: Props) {
  const reqs = txRequests([{ patient: p.patient, room: p.room, entries: p.entries }]);
  const blood = bloodState(p.recordBlood, p.bank.typings.filter((t) => t.patientId === p.patient.id));
  return (
    <div className="space-y-3 text-[12px]">
      <DenyNote action="tx.bedside" />
      {reqs.length === 0 && <p className="text-ink-soft">この患者の輸血のオーダはありません。</p>}
      {reqs.map((r) => {
        const bags = unitsOf(p.bank, r.entry.id);
        return (
          <section key={r.entry.id} className="rounded-lg border border-rule bg-paper p-2.5">
            <h3 className="font-bold">{txText(r.tx)}</h3>
            <p className="nums text-ink-soft">
              輸血 {momentText(momentOf(r.at))}　{r.entry.author}　理由：{r.tx.reason}
            </p>
            {bags.length === 0 && <p className="mt-1 text-ink-soft">輸血部門が製剤を割り付けて払い出すと、ここに出ます。</p>}
            {bags.map((u) => (
              <Bag key={u.lot} {...p} req={r} unit={u} blood={blood} />
            ))}
          </section>
        );
      })}
      <div className="rounded-md border border-rule bg-sheet p-2 text-[11px] text-ink-soft">
        <p>{BLOOD_RULES.bedside}</p>
        <p className="mt-1">{BLOOD_RULES.observe}</p>
        <p className="mt-1">{BLOOD_RULES.before}</p>
        <p className="mt-1">
          出典：
          <a href={BLOOD_SOURCES.guide.url} target="_blank" rel="noreferrer" className="text-ai underline">
            {BLOOD_SOURCES.guide.label}
          </a>
          ／症状の項目と定義：
          <a href={BLOOD_SOURCES.symptoms.url} target="_blank" rel="noreferrer" className="text-ai underline">
            {BLOOD_SOURCES.symptoms.label}
          </a>
        </p>
      </div>
    </div>
  );
}

type BagProps = Props & { req: TxRequest; unit: BloodUnit; blood: BloodState };

function Bag(p: BagProps) {
  const { unit, bank, onBank, nowTime } = p;
  const admin = bank.admins[unit.lot];
  const state = unitState(unit, bank.admins, abs(0, nowTime));
  const put = (a: TxAdmin) => onBank((b) => ({ ...b, admins: { ...b.admins, [a.lot]: a } }));
  return (
    <div className="mt-2 border-t border-rule pt-1.5">
      <p className="flex flex-wrap items-baseline gap-x-2">
        <span className="font-mono font-bold">{unit.lot}</span>
        <span>
          {productName(unit.product)} {bagLabel(unit)} {typeText(unit.abo, unit.rh)}
        </span>
        <span className="font-bold text-ai">{state}</span>
      </p>
      {!unit.issued ? (
        <p className="text-ink-soft">輸血部門の払出を待っています。</p>
      ) : !admin ? (
        <Check {...p} put={put} />
      ) : (
        <>
          <p className="text-ink-soft">
            照合 {admin.check.time}：{admin.check.by} と {admin.check.second}（リストバンド・製剤のバーコード・外観）
          </p>
          <Observe {...p} admin={admin} put={put} />
        </>
      )}
    </div>
  );
}

function Check({ req, unit, bank, blood, nowTime, patient, put }: BagProps & { put: (a: TxAdmin) => void }) {
  const me = useMe();
  const deny = useDeny()("tx.bedside");
  const [wb, setWb] = useState("");
  const [bag, setBag] = useState("");
  const [second, setSecond] = useState("");
  const [look, setLook] = useState(false);
  const nowAbs = abs(0, nowTime);
  const r = bedsideCheck({ req, blood, bank, wristband: wb, bag, by: me.name, second, appearanceOk: look, nowAbs });
  const save = () => {
    if (!r.ok) return;
    put({ lot: unit.lot, orderId: req.entry.id, patientId: req.patientId, check: { ...momentOf(nowAbs), by: me.name, second: second.trim(), wristband: wb.trim(), bag: bag.trim(), appearanceOk: look }, obs: [] });
    auditLog({ role: me.role, actor: me.name, action: "確定（輸血の照合）", patient: patient.name, detail: `製造番号 ${unit.lot}　リストバンド・製剤のバーコード一致　確認 ${me.name}・${second.trim()}` });
  };
  return (
    <div className="mt-1 space-y-1 rounded border border-rule bg-sheet p-2">
      <b>ベッドサイドでの照合（1回に1患者・1バッグ）</b>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1">
          リストバンド
          <input value={wb} onChange={(e) => setWb(e.target.value)} placeholder="バーコードを読む" aria-label="リストバンド" className={`${field} nums w-32`} disabled={!!deny} />
        </label>
        <button type="button" onClick={() => setWb(patient.id)} className="text-ai underline disabled:opacity-40" title="デモ：この患者のリストバンドを読む" disabled={!!deny}>
          読む
        </button>
        <label className="flex items-center gap-1">
          製剤
          <input value={bag} onChange={(e) => setBag(e.target.value)} placeholder="製造番号のバーコード" aria-label="製剤のバーコード" className={`${field} nums w-36 font-mono`} disabled={!!deny} />
        </label>
        <button type="button" onClick={() => setBag(unit.lot)} className="text-ai underline disabled:opacity-40" title="デモ：この製剤のバーコードを読む" disabled={!!deny}>
          読む
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={look} onChange={(e) => setLook(e.target.checked)} disabled={!!deny} />
          外観を確かめた（色・溶血・凝集物・破損{unit.product === "PC" ? "・スワーリング" : ""}）
        </label>
        <input value={second} onChange={(e) => setSecond(e.target.value)} placeholder="一緒に読み合わせた人" aria-label="2人目" className={`${field} w-40`} disabled={!!deny} />
      </div>
      <ul className="space-y-0.5">
        {r.lines.map((l) => (
          <li key={l.text} className={l.tone === "ok" ? "text-wakatake" : "font-bold text-shu"}>
            {l.tone === "ok" ? "✓" : "×"} {l.text}
          </li>
        ))}
      </ul>
      <button type="button" disabled={!!deny || !r.ok} onClick={save} className="rounded bg-ai px-3 py-0.5 font-bold text-white disabled:opacity-40">
        照合を記録
      </button>
    </div>
  );
}

interface VitalsDraft {
  bt: string;
  sbp: string;
  dbp: string;
  hr: string;
  spo2: string;
}
const EMPTY_V: VitalsDraft = { bt: "", sbp: "", dbp: "", hr: "", spo2: "" };
const num = (s: string) => (s.trim() === "" || Number.isNaN(Number(s)) ? undefined : Number(s));
const VITAL_INPUTS = [
  ["bt", "体温", "℃", "w-14"],
  ["sbp", "血圧 上", "", "w-12"],
  ["dbp", "下", "mmHg", "w-12"],
  ["hr", "脈拍", "/分", "w-12"],
  ["spo2", "SpO2", "%", "w-12"],
] as const;

/** The next point to record: 開始前, then (after 開始) 5分, 15分, 終了時. Null while waiting for 開始. */
function nextPoint(a: TxAdmin): ObsPoint | null {
  const has = (p: ObsPoint) => a.obs.some((o) => o.point === p);
  if (a.end) return null;
  if (!has("開始前")) return "開始前";
  if (!a.start) return null;
  return (["開始5分", "開始15分", "終了時"] as ObsPoint[]).find((p) => !has(p)) ?? null;
}

function Observe({ admin, put, nowTime, patient, unit, onIo, blood }: BagProps & { admin: TxAdmin; put: (a: TxAdmin) => void }) {
  const me = useMe();
  const disabled = !!useDeny()("tx.bedside");
  const [v, setV] = useState<VitalsDraft>(EMPTY_V);
  const [picked, setPicked] = useState<Symptom[]>([]);
  const [action, setAction] = useState("");
  const [kept, setKept] = useState(true);
  const [stop, setStop] = useState(false);
  const [ml, setMl] = useState(String(txVolume(unit)));
  const [recheck, setRecheck] = useState(false);
  const nowAbs = abs(0, nowTime);
  const plan = obsPlan(admin, nowAbs);
  const before = admin.obs.find((o) => o.point === "開始前");
  const next = nextPoint(admin);
  const vitals = { bt: num(v.bt), sbp: num(v.sbp), dbp: num(v.dbp), hr: num(v.hr), spo2: num(v.spo2) };
  const auto = next && next !== "開始前" ? vitalSymptoms(before, vitals, patient.age >= 18) : [];
  const symptoms = [...new Set([...auto.map((a) => a.symptom), ...picked])];
  const newReaction = symptoms.length > 0 && !admin.reaction;
  const ending = next === "終了時" || (symptoms.length > 0 && stop);
  const at = momentOf(nowAbs);
  const pace = txMinutes(txVolume(unit));
  const record = (point: ObsPoint) => {
    const o: Observation = { point, ...at, by: me.name, ...(Object.fromEntries(Object.entries(vitals).filter(([, x]) => x !== undefined)) as Partial<Observation>), symptoms };
    let a: TxAdmin = { ...admin, obs: [...admin.obs.filter((x) => x.point !== point), o] };
    if (newReaction) a = { ...a, reaction: { ...at, symptoms, onsetMin: admin.start ? nowAbs - abs(admin.start.day, admin.start.time) : 0, action: action.trim(), by: me.name, bagKept: kept } };
    if (ending) {
      const amount = Number(ml) || 0;
      a = { ...a, end: { ...at, by: me.name, ml: amount, rechecked: recheck, stopped: point !== "終了時" } };
      if (amount > 0) onIo([{ id: crypto.randomUUID(), patientId: admin.patientId, side: "IN", kind: "輸血", ml: amount, at: nowAbs, by: me.name, recordedAt: nowTime, note: `製造番号 ${unit.lot}` }]);
    }
    put(a);
    auditLog({
      role: me.role,
      actor: me.name,
      action: newReaction ? "確定（輸血の副反応）" : ending ? `確定（輸血の${point === "終了時" ? "終了" : "中止"}）` : `確定（輸血の観察：${point}）`,
      patient: patient.name,
      detail: `製造番号 ${unit.lot}　BT ${vitals.bt ?? "—"} BP ${vitals.sbp ?? "—"}/${vitals.dbp ?? "—"} HR ${vitals.hr ?? "—"} SpO2 ${vitals.spo2 ?? "—"}　${symptoms.length ? `症状：${symptoms.join("・")}${action.trim() ? `　対応：${action.trim()}` : ""}` : "症状なし"}`,
    });
    setV(EMPTY_V);
    setPicked([]);
    setAction("");
  };
  const start = () => {
    put({ ...admin, start: { ...at, by: me.name } });
    auditLog({ role: me.role, actor: me.name, action: "確定（輸血の開始）", patient: patient.name, detail: `製造番号 ${unit.lot}　${blood.abo ? typeText(blood.abo, blood.rh!) : ""}` });
  };
  const obsLine = (o: Observation) => `${o.time} ${o.by}　BT ${o.bt ?? "—"} BP ${o.sbp ?? "—"}/${o.dbp ?? "—"} HR ${o.hr ?? "—"} SpO2 ${o.spo2 ?? "—"}　${o.symptoms.length ? `症状：${o.symptoms.join("・")}` : "症状なし"}`;
  return (
    <div className="mt-1 space-y-1.5">
      <table className="w-full border-collapse">
        <tbody>
          {plan.map((x) => (
            <tr key={x.point} className="border-b border-rule-soft align-top">
              <td className="w-20 py-0.5 font-bold">{x.point}</td>
              <td className="nums w-24 py-0.5 text-ink-soft">{x.due !== null ? `${momentOf(x.due).time} の予定` : x.point === "開始前" ? "開始の前" : ""}</td>
              <td className={`py-0.5 ${x.state === "時刻を過ぎた" ? "font-bold text-shu" : x.state === "済み" ? "" : "text-ink-faint"}`}>
                {x.rec ? obsLine(x.rec) : x.state === "時刻を過ぎた" ? "時刻を過ぎた（記録なし）" : x.point === "終了時" && admin.end ? `${admin.end.stopped ? "中止" : "終了"} ${admin.end.time}` : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {admin.start && (
        <p className="text-ink-soft">
          開始 {admin.start.time} {admin.start.by}。速さの目安：最初の15分は 1mL/分ほど、副反応がなければ 5mL/分ほど（{pace.formula}）。
        </p>
      )}
      {admin.reaction && (
        <p className="rounded bg-shu-soft px-2 py-1 font-bold text-shu">
          副反応：{admin.reaction.symptoms.join("・")}（開始から {admin.reaction.onsetMin}分）　対応：{admin.reaction.action}　→ 輸血部門に届いています{admin.reaction.received ? `（${admin.reaction.received.time} ${admin.reaction.received.by}が受けた）` : ""}
        </p>
      )}
      {admin.end && (
        <p className={admin.end.rechecked ? "text-wakatake" : "font-bold text-shu"}>
          {admin.end.stopped ? "中止" : "終了"} {admin.end.time} {admin.end.by}　量 {admin.end.ml}mL（水分出納の IN に入れた）　{admin.end.rechecked ? "終了後に患者名・血液型・製造番号を再確認" : "終了後の再確認の記録なし"}
        </p>
      )}

      {!admin.end && before && !admin.start && (
        <button type="button" disabled={disabled} onClick={start} className="rounded bg-wakatake px-3 py-1 font-bold text-white disabled:opacity-40">
          輸血を開始（{at.time}）
        </button>
      )}

      {next && (
        <div className="space-y-1 rounded border border-rule bg-sheet p-2">
          <b>{next === "終了時" ? "終了" : next}の記録</b>
          <div className="flex flex-wrap items-center gap-1.5">
            {VITAL_INPUTS.map(([k, label, unitText, w]) => (
              <label key={k} className="flex items-center gap-0.5">
                {label}
                <input inputMode="decimal" value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} aria-label={label} className={`${field} nums ${w}`} disabled={disabled} />
                {unitText}
              </label>
            ))}
          </div>
          {next !== "開始前" && (
            <>
              {auto.length > 0 && <p className="font-bold text-shu">バイタルから（学会の症状項目の定義）：{auto.map((a) => `${a.symptom}（${a.why}）`).join("、")}</p>}
              <div className="flex flex-wrap gap-x-2 gap-y-0.5">
                {SYMPTOMS.map((s) => (
                  <label key={s} className={`flex items-center gap-0.5 ${SEVERE.includes(s) ? "font-bold" : ""}`}>
                    <input type="checkbox" checked={symptoms.includes(s)} disabled={disabled || auto.some((a) => a.symptom === s)} onChange={(e) => setPicked(e.target.checked ? [...picked, s] : picked.filter((x) => x !== s))} />
                    {s}
                  </label>
                ))}
              </div>
              {newReaction && (
                <div className="space-y-1 rounded border border-shu/50 bg-shu-soft p-1.5">
                  <b className="text-shu">副反応として記録し、輸血部門に知らせます{symptoms.some((s) => SEVERE.includes(s)) ? "（重症副反応の可能性が高い項目があります）" : ""}</b>
                  <input value={action} onChange={(e) => setAction(e.target.value)} placeholder="対応（医師への報告と指示を含めて）" aria-label="副反応への対応" className={`${field} w-full`} disabled={disabled} />
                  <label className="mr-3 inline-flex items-center gap-1">
                    <input type="checkbox" checked={stop} onChange={(e) => setStop(e.target.checked)} disabled={disabled} />
                    輸血を中止した
                  </label>
                  <label className="inline-flex items-center gap-1">
                    <input type="checkbox" checked={kept} onChange={(e) => setKept(e.target.checked)} disabled={disabled} />
                    使用済みバッグと輸血セットを清潔に回収した
                  </label>
                </div>
              )}
            </>
          )}
          {ending && (
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-1">
                入った量
                <input inputMode="numeric" value={ml} onChange={(e) => setMl(e.target.value)} aria-label="入った量" className={`${field} nums w-16`} disabled={disabled} />
                mL
              </label>
              <label className="flex items-center gap-1">
                <input type="checkbox" checked={recheck} onChange={(e) => setRecheck(e.target.checked)} disabled={disabled} />
                終了後に患者名・血液型・製造番号を再確認した
              </label>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" disabled={disabled || (ending && !recheck) || (newReaction && !action.trim())} onClick={() => record(next)} className="rounded bg-ai px-3 py-0.5 font-bold text-white disabled:opacity-40">
              {next === "終了時" ? "終了を記録" : ending ? "中止を記録" : "記録"}
            </button>
            {next === "開始前" && <span className="text-ink-soft">開始前のバイタルを記録したあとで「開始」を押します（この架空の病院の取り決め）。</span>}
            {newReaction && !action.trim() && <span className="text-ink-soft">対応を書くと記録できます。</span>}
          </div>
        </div>
      )}
    </div>
  );
}
