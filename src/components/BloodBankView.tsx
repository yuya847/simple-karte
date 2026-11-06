"use client";
import { TimeInput } from "@/components/TimeInput";

import { BookOpenText, ClipboardList, Droplet, FileClock, HelpCircle, Package, TestTubes, TriangleAlert, Undo2 } from "lucide-react";
import { useState } from "react";
import { auditLog } from "@/lib/audit";
import {
  BLOOD_RULES,
  BLOOD_SOURCES,
  bagLabel,
  candidates,
  computerConditions,
  issueBlocks,
  momentOf,
  momentText,
  bloodState,
  stillNeeded,
  txRequests,
  typeText,
  unitState,
  unitsOf,
  type BloodBank,
  type BloodState,
  type BloodUnit,
  type CrossmatchMethod,
  type Moment,
  type TxRequest,
} from "@/lib/blood-bank";
import type { CalendarDate } from "@/lib/dates";
import { abs } from "@/lib/flowsheet";
import { useHints } from "@/lib/hints";
import { txText } from "@/lib/procedures";
import type { Patient } from "@/lib/types";
import type { WorkPatient } from "@/lib/worksheet";
import { DenyNote, useDeny, useMe } from "./RoleContext";
import { BloodReturns, BloodStock, BloodTyping } from "./BloodBankDesk";
import { BloodReactions, BloodRecords } from "./BloodBankRecords";

export interface BloodBankProps {
  people: WorkPatient[];
  bank: BloodBank;
  onBank: (f: (b: BloodBank) => BloodBank) => void;
  /** The patient's blood type in the record before this session (the typings here are added to it). */
  recordBlood: (patientId: string) => Patient["blood"];
  nowTime: string;
  today: CalendarDate;
  /** The issue as the pharmacy's 血液製剤 tab and its 日報 read it (by order id); null when nothing is out. */
  onIssued: (orderId: string, rec: { lot: string; at: string; by: string } | null) => void;
}

type Tab = "orders" | "typing" | "stock" | "return" | "reactions" | "records";
const TABS: { key: Tab; label: string; icon: typeof Droplet }[] = [
  { key: "orders", label: "依頼・割付・払出", icon: ClipboardList },
  { key: "typing", label: "血液型・不規則抗体", icon: TestTubes },
  { key: "stock", label: "在庫（入庫・廃棄）", icon: Package },
  { key: "return", label: "返却", icon: Undo2 },
  { key: "reactions", label: "副反応", icon: TriangleAlert },
  { key: "records", label: "使用記録（20年）", icon: FileClock },
];

const GUIDE: Record<Tab, string> = {
  orders:
    "医師が確定した輸血のオーダ（カルテの「輸血」）が、輸血の時刻の順に並びます。患者の血液型（2回の確認）と不規則抗体をコードが確かめます。在庫から、患者と同じ型で輸血の時刻まで有効な製剤を、有効期限の近い順に出すので、選んで「割り付ける」。赤血球は交差適合試験（間接抗グロブリン試験、またはコンピュータクロスマッチ）の結果を入れます。血漿・血小板は省略できます。止まる理由がなくなったら、受け取りに来た人の名前を入れて1バッグずつ払い出します。",
  typing:
    "検体ごとに、ABO（オモテ・ウラ）と RhD、できれば不規則抗体スクリーニングの結果を入れます。同じ検体を2人目の技師が確かめた名前が要ります。異なる時刻に採った2つの検体で一致すると血液型が確定し、カルテの血液型（確認の回数）が増え、医師が輸血を出せるようになります。一致しないときは確定しません。",
  stock:
    "血液センターから届いた製剤を、納品伝票と製剤本体で照合して入庫します（製造番号・製剤・単位・血液型・有効期限・照射）。期限を過ぎた製剤はコードが印を付けるので、廃棄の記録をします。赤血球をコンピュータクロスマッチで使うときは、入庫後に製剤の ABO をオモテ検査で確かめて「確認した」を押します。",
  return:
    "払い出したが使わなかった製剤を、戻った時刻と外観で記録します。在庫に戻すか廃棄かは、払出からの時間と製剤の種類からコードが決めます（この架空の病院の取り決め）。",
  reactions:
    "病棟が記録した輸血の副反応が届きます。症状（学会の17項目）・始まった時刻・対応を確かめて「受けた」を押します。血液センターへの報告は模擬です（つながりません）。下の表は学会の報告書と同じく、バッグごとの件数です。",
  records:
    "輸血したバッグごとの記録です（氏名・住所・製剤の名称と製造番号・使用した日）。保存の期限（使用した日から20年）はコードが出します。足りない項目があれば印が付きます。",
};

export const bbCard = "rounded-lg border border-rule bg-sheet";
export const bbField = "rounded border border-rule bg-paper px-1.5 py-0.5 outline-none focus:border-ai";
export const SourceNote = ({ rules }: { rules: string[] }) => (
  <div className="hint mt-4 rounded-md border border-rule bg-sheet p-3 text-[11px] text-ink-soft">
    {rules.map((r) => (
      <p key={r} className="mb-1">
        {r}
      </p>
    ))}
    <p className="mt-1">
      出典：
      {[BLOOD_SOURCES.guide, BLOOD_SOURCES.notice].map((s, i) => (
        <span key={s.url}>
          {i > 0 && "／"}
          <a href={s.url} target="_blank" rel="noreferrer" className="text-ai underline">
            {s.label}
          </a>
        </span>
      ))}
    </p>
  </div>
);

/** 輸血部門: what the blood bank does between the doctor's order and the bag at the bedside. */
export function BloodBankView(p: BloodBankProps) {
  const [tab, setTab] = useState<Tab>("orders");
  const [hintsOn] = useHints();
  const [guideSet, setGuide] = useState<boolean | null>(null);
  const guide = guideSet ?? hintsOn;
  const nowAbs = abs(0, p.nowTime);
  const reqs = txRequests(p.people);
  const stateOf = (pid: string) => bloodState(p.recordBlood(pid), p.bank.typings.filter((t) => t.patientId === pid));
  const waiting = reqs.filter((r) => stillNeeded(r, unitsOf(p.bank, r.entry.id)).length > 0 || unitsOf(p.bank, r.entry.id).some((u) => !u.issued)).length;
  const toReturn = p.bank.units.filter((u) => unitState(u, p.bank.admins, nowAbs) === "払出済み").length;
  const reactions = Object.values(p.bank.admins).filter((a) => a.reaction && !a.reaction.received).length;
  const expired = p.bank.units.filter((u) => unitState(u, p.bank.admins, nowAbs) === "期限切れ").length;
  const badge: Partial<Record<Tab, number>> = { orders: waiting, stock: expired, return: toReturn, reactions };
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b border-rule bg-sheet px-5 py-2">
        <h1 className="flex items-center gap-1.5 text-base font-bold">
          <Droplet size={17} />
          輸血部門（検査室）
        </h1>
        <div role="tablist" className="flex flex-wrap rounded-md border border-rule p-0.5 text-sm">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={`flex items-center gap-1 rounded px-2.5 py-0.5 ${tab === key ? "bg-ink font-bold text-white" : "text-ink-soft hover:text-ink"}`}
            >
              <Icon size={14} />
              {label}
              {!!badge[key] && <span className={`nums rounded-full px-1.5 text-[11px] font-bold ${key === "reactions" || key === "stock" ? "bg-shu text-white" : "bg-ai-soft text-ai"}`}>{badge[key]}</span>}
            </button>
          ))}
        </div>
        <button type="button" onClick={() => setGuide(!guide)} aria-expanded={guide} className="ml-auto flex items-center gap-1 rounded border border-rule px-2 py-0.5 text-xs text-ink-soft hover:text-ai">
          <HelpCircle size={13} />
          使い方
        </button>
      </div>
      {guide && (
        <div className="border-b border-rule bg-ai-soft/40 px-5 py-2 text-[12px]">
          <p className="mb-1 flex items-center gap-1 font-bold text-ai">
            <BookOpenText size={14} />
            使い方：{TABS.find((t) => t.key === tab)?.label}
          </p>
          <p className="text-ink">{GUIDE[tab]}</p>
          <p className="mt-1 text-[11px] text-ink-soft">臨床検査技師として操作するには、右上の「自分」で「臨床検査技師」を選びます（デモではログインの代わり）。輸血のオーダは医師がカルテの「輸血」から、ベッドサイドの照合と観察は看護師がカルテの「輸血の実施」から行います。</p>
        </div>
      )}
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto bg-paper p-4 text-[13px]">
        <div className="mx-auto max-w-[1100px]">
          <DenyNote action="blood.bank" className="mb-2" />
          {tab === "orders" && <Orders {...p} reqs={reqs} stateOf={stateOf} nowAbs={nowAbs} />}
          {tab === "typing" && <BloodTyping {...p} stateOf={stateOf} nowAbs={nowAbs} />}
          {tab === "stock" && <BloodStock {...p} nowAbs={nowAbs} />}
          {tab === "return" && <BloodReturns {...p} nowAbs={nowAbs} />}
          {tab === "reactions" && <BloodReactions {...p} nowAbs={nowAbs} />}
          {tab === "records" && <BloodRecords {...p} />}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 依頼・割付・払出
// ---------------------------------------------------------------------------

function Orders(p: BloodBankProps & { reqs: TxRequest[]; stateOf: (pid: string) => BloodState; nowAbs: number }) {
  const { reqs, stateOf, nowAbs } = p;
  return (
    <section className="space-y-3">
      {reqs.length === 0 && <p className={`${bbCard} px-4 py-3 text-ink-soft`}>輸血のオーダはありません。<span className="hint">医師がカルテの右端「オーダ › その他 › 輸血」から出すと、ここに並びます。</span></p>}
      {reqs.map((r) => (
        <OrderCard key={r.entry.id} {...p} req={r} blood={stateOf(r.patientId)} nowAbs={nowAbs} />
      ))}
      <SourceNote rules={[BLOOD_RULES.typing, BLOOD_RULES.sample, BLOOD_RULES.crossmatch, BLOOD_RULES.computer, BLOOD_RULES.same, BLOOD_RULES.issue]} />
    </section>
  );
}

const DAYS_BACK = [0, -1, -2, -3];
const dayName = (d: number) => (d === 0 ? "今日" : d === -1 ? "昨日" : `${-d}日前`);

/** The day and time a sample was drawn. */
export function SampleInput({ value, onChange, label = "検体の採血" }: { value: Moment; onChange: (m: Moment) => void; label?: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      {label}
      <select value={value.day} onChange={(e) => onChange({ ...value, day: Number(e.target.value) })} aria-label={`${label}の日`} className={bbField}>
        {DAYS_BACK.map((d) => (
          <option key={d} value={d}>
            {dayName(d)}
          </option>
        ))}
      </select>
      <TimeInput value={value.time} onChange={(e) => onChange({ ...value, time: e.target.value })} aria-label={`${label}の時刻`} className={`${bbField} nums`} />
    </span>
  );
}

function OrderCard({ req, blood, bank, onBank, nowAbs, nowTime, onIssued }: BloodBankProps & { req: TxRequest; blood: BloodState; nowAbs: number }) {
  const me = useMe();
  const deny = useDeny()("blood.bank");
  const assigned = unitsOf(bank, req.entry.id);
  const need = stillNeeded(req, assigned);
  const pool = blood.abo ? candidates(bank, req, blood, nowAbs) : [];
  const [pick, setPick] = useState<Record<number, string>>({});
  const at = momentOf(nowAbs);
  const set = (lot: string, f: (u: BloodUnit) => BloodUnit) => onBank((b) => ({ ...b, units: b.units.map((u) => (u.lot === lot ? f(u) : u)) }));
  const assign = (lot: string) => {
    set(lot, (u) => ({ ...u, assigned: { ...at, orderId: req.entry.id, patientId: req.patientId, by: me.name } }));
    auditLog({ role: me.role, actor: me.name, action: "確定（製剤の割付）", patient: req.name, detail: `${txText(req.tx)}　製造番号 ${lot}` });
  };
  const bloodLine = blood.abo ? `${typeText(blood.abo, blood.rh!)}（確認 ${blood.samples}回）` : "未検査";
  return (
    <article className={`${bbCard} p-3`}>
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <b>
          {req.room}　{req.name}
        </b>
        <span>{txText(req.tx)}</span>
        <span className="nums text-xs text-ink-soft">
          輸血 {momentText(momentOf(req.at))}　{req.entry.author}　理由：{req.tx.reason}
        </span>
      </header>
      <p className={`mt-1 text-[12px] ${blood.confirmed && !blood.conflict ? "text-ink" : "font-bold text-shu"}`}>
        血液型：{bloodLine}　不規則抗体：{blood.antibody ?? "未検査"}
        {blood.antibodies.length > 0 && `（${blood.antibodies.join("・")}）`}
        {blood.conflict && <span className="block">{blood.conflict}</span>}
        {!blood.conflict && !blood.confirmed && <span className="ml-1">— 異なる時点の検体で2回確かめるまで払い出せません（「血液型・不規則抗体」のタブ）</span>}
      </p>

      {assigned.length > 0 && (
        <ul className="mt-2 space-y-2">
          {assigned.map((u) => (
            <BagRow key={u.lot} unit={u} req={req} blood={blood} bank={bank} nowAbs={nowAbs} nowTime={nowTime} set={set} onIssued={onIssued} />
          ))}
        </ul>
      )}

      {need.length > 0 && (
        <div className="mt-2 rounded-md border border-dashed border-rule p-2 text-[12px]">
          <p className="mb-1 font-bold">割付（あと {need.map((n) => bagLabel({ product: req.tx.product, units: n })).join("・")}）</p>
          {!blood.abo || blood.conflict ? (
            <p className="text-shu">血液型が決まるまで割り付けられません。</p>
          ) : (
            [...new Set(need)].map((n) => {
              const opts = pool.filter((u) => u.units === n);
              return (
                <div key={n} className="flex flex-wrap items-center gap-2">
                  <span className="w-28">{bagLabel({ product: req.tx.product, units: n })}</span>
                  {opts.length === 0 ? (
                    <span className="text-shu">在庫に合う製剤がありません（{typeText(blood.abo!, blood.rh!)}・{bagLabel({ product: req.tx.product, units: n })}）。血液センターに発注して入庫してください。</span>
                  ) : (
                    <>
                      <select value={pick[n] ?? opts[0].lot} onChange={(e) => setPick({ ...pick, [n]: e.target.value })} aria-label="割り付ける製剤" className={bbField} disabled={!!deny}>
                        {opts.map((u) => (
                          <option key={u.lot} value={u.lot}>
                            {u.lot}　{typeText(u.abo, u.rh)}　期限 {momentText(u.expires)}
                          </option>
                        ))}
                      </select>
                      <button type="button" disabled={!!deny} onClick={() => assign(pick[n] && opts.some((u) => u.lot === pick[n]) ? pick[n] : opts[0].lot)} className="rounded bg-ai px-2 py-0.5 font-bold text-white disabled:opacity-40">
                        割り付ける
                      </button>
                      <span className="text-ink-faint">期限の近い順</span>
                    </>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </article>
  );
}

function BagRow({ unit, req, blood, bank, nowAbs, nowTime, set, onIssued }: { unit: BloodUnit; req: TxRequest; blood: BloodState; bank: BloodBank; nowAbs: number; nowTime: string; set: (lot: string, f: (u: BloodUnit) => BloodUnit) => void; onIssued: BloodBankProps["onIssued"] }) {
  const me = useMe();
  const deny = useDeny()("blood.bank");
  const [method, setMethod] = useState<CrossmatchMethod>("間接抗グロブリン試験");
  const [sample, setSample] = useState<Moment>({ day: 0, time: "" });
  const [major, setMajor] = useState<"適合" | "不適合">("適合");
  const [antigenNeg, setAntigenNeg] = useState(false);
  const [checker, setChecker] = useState("");
  const [to, setTo] = useState("");
  const state = unitState(unit, bank.admins, nowAbs);
  const admin = bank.admins[unit.lot];
  const at = momentOf(nowAbs);
  const blocks = issueBlocks(unit, req, blood, nowAbs);
  const conds = computerConditions(blood, unit, sample.time ? sample : null, req.at);
  const canComputer = conds.every((c) => c.ok);
  const recordCm = () => {
    const cm = { method, sample, major: method === "コンピュータクロスマッチ" ? ("適合" as const) : major, ...(blood.antibodies.length ? { antigenNegative: antigenNeg } : {}), by: me.name, ...(checker.trim() ? { checkedBy: checker.trim() } : {}), at };
    set(unit.lot, (u) => ({ ...u, crossmatch: cm }));
    auditLog({ role: me.role, actor: me.name, action: "確定（交差適合試験）", patient: req.name, detail: `製造番号 ${unit.lot}　${method}　${cm.major}　検体 ${momentText(sample)}` });
  };
  const issue = () => {
    set(unit.lot, (u) => ({ ...u, issued: { ...at, by: me.name, to: to.trim() } }));
    const out = [...bank.units.filter((u) => u.assigned?.orderId === req.entry.id && u.issued && !u.discarded).map((u) => u.lot), unit.lot];
    onIssued(req.entry.id, { lot: out.join("・"), at: nowTime, by: me.name });
    auditLog({ role: me.role, actor: me.name, action: "確定（血液製剤の払出）", patient: req.name, detail: `${txText(req.tx)}　製造番号 ${unit.lot}　受け取り ${to.trim()}` });
  };
  const unassign = () => {
    set(unit.lot, (u) => {
      const rest = { ...u };
      delete rest.assigned;
      delete rest.crossmatch;
      return rest;
    });
    auditLog({ role: me.role, actor: me.name, action: "製剤の割付を外した", patient: req.name, detail: `製造番号 ${unit.lot}` });
  };
  return (
    <li className="rounded-md border border-rule bg-paper p-2 text-[12px]">
      <div className="flex flex-wrap items-baseline gap-x-3">
        <span className="font-mono font-bold">{unit.lot}</span>
        <span>
          {bagLabel(unit)}　{typeText(unit.abo, unit.rh)}
        </span>
        <span className="nums text-ink-soft">期限 {momentText(unit.expires)}</span>
        <span className={`font-bold ${state === "払出済み" || state === "輸血中" ? "text-ai" : state === "輸血済み" ? "text-wakatake" : state === "期限切れ" ? "text-shu" : "text-ink"}`}>{state}</span>
        {unit.issued && (
          <span className="nums text-ink-soft">
            払出 {unit.issued.time} {unit.issued.by} → {unit.issued.to}
          </span>
        )}
        {admin && (
          <span className="text-ink-soft">
            病棟：照合 {admin.check.time}（{admin.check.by}・{admin.check.second}）{admin.start ? `　開始 ${admin.start.time}` : ""}
            {admin.end ? `　${admin.end.stopped ? "中止" : "終了"} ${admin.end.time}` : ""}
            {admin.reaction && <b className="ml-1 text-shu">副反応あり</b>}
          </span>
        )}
        {!unit.issued && !deny && (
          <button type="button" onClick={unassign} className="ml-auto text-ink-faint underline">
            割付を外す
          </button>
        )}
      </div>

      {unit.product === "RBC" && !unit.issued && (
        <div className="mt-1 rounded border border-rule bg-sheet p-1.5">
          {unit.crossmatch ? (
            <p className={unit.crossmatch.major === "適合" ? "text-wakatake" : "font-bold text-shu"}>
              交差適合試験：{unit.crossmatch.major}（{unit.crossmatch.method}・検体 {momentText(unit.crossmatch.sample)}採血）{unit.crossmatch.at.time} {unit.crossmatch.by}
              {unit.crossmatch.checkedBy ? `・確認 ${unit.crossmatch.checkedBy}` : ""}
              {!deny && (
                <button
                  type="button"
                  onClick={() =>
                    set(unit.lot, (u) => {
                      const rest = { ...u };
                      delete rest.crossmatch;
                      return rest;
                    })
                  }
                  className="ml-2 text-ink-faint underline"
                >
                  入れ直す
                </button>
              )}
            </p>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <b>交差適合試験</b>
              {(["間接抗グロブリン試験", "コンピュータクロスマッチ"] as CrossmatchMethod[]).map((m) => (
                <label key={m} className="flex items-center gap-0.5">
                  <input type="radio" checked={method === m} onChange={() => setMethod(m)} disabled={!!deny} />
                  {m}
                </label>
              ))}
              <SampleInput value={sample} onChange={setSample} />
              {method === "間接抗グロブリン試験" ? (
                <label className="flex items-center gap-1">
                  主試験
                  <select value={major} onChange={(e) => setMajor(e.target.value as "適合" | "不適合")} className={bbField} disabled={!!deny}>
                    <option>適合</option>
                    <option>不適合</option>
                  </select>
                </label>
              ) : (
                <span className="w-full">
                  条件：
                  {conds.map((c) => (
                    <span key={c.text} className={`mr-2 ${c.ok ? "text-wakatake" : "text-shu"}`}>
                      {c.ok ? "✓" : "×"} {c.text}
                    </span>
                  ))}
                </span>
              )}
              {blood.antibodies.length > 0 && (
                <label className="flex items-center gap-1 font-bold text-shu">
                  <input type="checkbox" checked={antigenNeg} onChange={(e) => setAntigenNeg(e.target.checked)} disabled={!!deny} />
                  対応抗原陰性を確かめた（{blood.antibodies.join("・")}）
                </label>
              )}
              <input value={checker} onChange={(e) => setChecker(e.target.value)} placeholder="確認した技師（任意）" aria-label="確認した技師" className={`${bbField} w-36`} disabled={!!deny} />
              <button type="button" disabled={!!deny || !sample.time || (method === "コンピュータクロスマッチ" && !canComputer)} onClick={recordCm} className="rounded bg-ai px-2 py-0.5 font-bold text-white disabled:opacity-40">
                結果を記録
              </button>
            </div>
          )}
        </div>
      )}
      {unit.product !== "RBC" && !unit.issued && <p className="mt-1 text-ink-soft">交差適合試験：省略（血漿・血小板）</p>}

      {!unit.issued && (
        <div className="mt-1 flex flex-wrap items-center gap-2">
          {blocks.length > 0 ? (
            <ul className="w-full list-disc pl-5 text-shu">
              {blocks.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          ) : (
            <span className="font-bold text-wakatake">払い出せます</span>
          )}
          <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="受け取りに来た人" aria-label="受け取りに来た人" className={`${bbField} w-40`} disabled={!!deny || blocks.length > 0} />
          <button type="button" disabled={!!deny || blocks.length > 0 || !to.trim()} onClick={issue} className="rounded bg-ai px-2 py-0.5 font-bold text-white disabled:opacity-40">
            払い出した（1バッグ）
          </button>
        </div>
      )}
    </li>
  );
}
