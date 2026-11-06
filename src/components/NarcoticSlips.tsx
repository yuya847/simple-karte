"use client";

import { displayText } from "@/lib/display-text";
import { useState } from "react";
import { auditLog } from "@/lib/audit";
import { addDays, formatShort, type CalendarDate } from "@/lib/dates";
import { isNarcotic } from "@/lib/drug-class";
import { anyDrugName } from "@/lib/master";
import { doseOf, mlPerAmpoule, returnFromWard, slipProblems, slipsDue, unitOf, type NarcoticBook, type SlipDue } from "@/lib/narcotic-book";
import { LICENCES } from "@/lib/narcotics";
import type { AdminRecord } from "@/lib/mar";
import type { WorkPatient } from "@/lib/worksheet";
import { DrugMarks } from "./DrugMarks";
import { DenyNote, useDeny, useMe } from "./RoleContext";

interface Props {
  people: WorkPatient[];
  records: Record<string, AdminRecord>;
  book: NarcoticBook;
  onBook: (f: (b: NarcoticBook) => NarcoticBook) => void;
  today: CalendarDate;
  nowTime: string;
  newId: () => string;
}

const hhmm = (min: number) => `${String(Math.floor((((min % 1440) + 1440) % 1440) / 60)).padStart(2, "0")}:${String((((min % 1440) + 1440) % 1440) % 60).padStart(2, "0")}`;

/** 病棟の麻薬：施用票を書いて残液・空アンプルを薬剤部へ返納し、残った内服の麻薬を返納する. */
export function NarcoticSlips({ people, records, book, onBook, today, nowTime, newId }: Props) {
  const deny = useDeny()("mar");
  const due = slipsDue(people, records, book);
  const mine = book.slips.filter((s) => people.some((x) => x.patient.id === s.patientId)).sort((a, b) => b.returnedAt.time.localeCompare(a.returnedAt.time));
  const oral = people.flatMap((x) => x.entries.filter((e) => e.order.type === "prescription" && isNarcotic(e.order.drugCode)).map((e) => ({ x, e })));
  return (
    <section className="scroll-thin min-h-0 flex-1 overflow-auto bg-paper p-5 text-[13px]">
      <div className="mx-auto max-w-[1000px] space-y-4">
        <h1 className="text-base font-bold">麻薬の施用票と返納（病棟）</h1>

        <DenyNote action="mar" />

        <div className="rounded-lg border border-rule bg-sheet p-4">
          <h2 className="mb-2 font-bold">施用票を書く（麻薬の注射）</h2>
          {due.length === 0 && <p className="text-ink-faint">施用票を書く麻薬の注射はありません。</p>}
          {due.map((d) => (
            <SlipForm key={d.key} d={d} people={people} disabled={!!deny} onReturn={(s) => onBook((b) => ({ ...b, slips: [...b.slips, { ...s, id: newId() }] }))} nowTime={nowTime} />
          ))}
        </div>

        <div className="rounded-lg border border-rule bg-sheet p-4">
          <h2 className="mb-2 font-bold">返納した施用票</h2>
          {mine.length === 0 && <p className="text-ink-faint">まだありません。</p>}
          <ul className="space-y-1 text-[12px]">
            {mine.map((s) => (
              <li key={s.id}>
                {formatShort(addDays(today, s.usedAt.day))} {s.usedAt.time}　{people.find((x) => x.patient.id === s.patientId)?.patient.name}　{anyDrugName(s.code)}　施用 {s.usedMl}mL・残 {s.leftMl}mL・未使用 {s.unusedA}A　返納 {s.returnedAt.time} {displayText(s.by)}
                <b className={s.received ? "text-wakatake" : "text-yamabuki"}>{s.received ? `薬剤部が受領 ${s.received.at.time}` : "薬剤部の受領待ち"}</b>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-lg border border-rule bg-sheet p-4">
          <h2 className="mb-2 font-bold">内服の麻薬の返納</h2>
          {oral.length === 0 && <p className="text-ink-faint">内服の麻薬のオーダはありません。</p>}
          {oral.map(({ x, e }) => (
            <OralReturn
              key={e.id}
              label={`${x.room}　${x.patient.name}　${anyDrugName(e.order.type === "prescription" ? e.order.drugCode : "")}（${e.status}）`}
              code={e.order.type === "prescription" ? e.order.drugCode : ""}
              returned={book.ledger.filter((l) => l.kind === "返納" && l.orderId === e.id).reduce((s, l) => s + (l.paren ?? 0), 0)}
              disabled={!!deny}
              onReturn={(qty, by) => onBook((b) => returnFromWard(b, e.order.type === "prescription" ? e.order.drugCode : "", qty, by, { day: 0, time: nowTime }, `${x.patient.name}（ID ${x.patient.id}）`, e.id, newId))}
            />
          ))}
        </div>


      </div>
    </section>
  );
}

function SlipForm({ d, people, disabled, onReturn, nowTime }: { d: SlipDue; people: WorkPatient[]; disabled: boolean; onReturn: (s: Omit<NarcoticBook["slips"][number], "id">) => void; nowTime: string }) {
  const me = useMe();
  const plan = doseOf(d.item);
  const per = mlPerAmpoule(d.item.drugCode) ?? 1;
  const [issuedA, setIssuedA] = useState(plan?.ampoules ?? 1);
  const [usedMl, setUsedMl] = useState(String(plan?.ml ?? ""));
  const [unusedA, setUnusedA] = useState(0);
  const used = Number(usedMl);
  const leftMl = Math.round(((issuedA - unusedA) * per - (Number.isFinite(used) ? used : 0)) * 100) / 100;
  const slip = { code: d.item.drugCode, issuedA, usedMl: used, leftMl, unusedA };
  const problems = usedMl === "" ? ["施用量（mL）"] : slipProblems(slip);
  const x = people.find((p) => p.patient.id === d.patientId);
  const prescriber = d.entry.verbal?.doctor ?? d.entry.author;
  const lic = (LICENCES[prescriber] ?? []).find((l) => l.kind === "麻薬施用者");
  return (
    <div className="mb-2 rounded-md border border-rule-soft p-3">
      <div className="flex flex-wrap items-baseline gap-2">
        <b>
          {x?.room}　{x?.patient.name}
        </b>
        <span>
          {anyDrugName(d.item.drugCode)} {d.item.amount}
          {d.item.unit}
          <DrugMarks codes={[d.item.drugCode]} />
        </span>
        <span className="text-xs text-ink-soft">
          実施 {hhmm(d.at)}（記録 {d.doneAt} {displayText(d.by)}）　施用者 {prescriber}（{displayText(lic?.no ?? "免許番号なし")}）
        </span>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs">
        <label className="flex items-center gap-1">
          払い出した数
          <input type="number" min={1} value={issuedA} onChange={(e) => setIssuedA(Math.max(0, Math.floor(Number(e.target.value))))} className="w-14 rounded border border-rule bg-paper px-1 py-0.5" />A
        </label>
        <label className="flex items-center gap-1">
          施用量
          <input value={usedMl} onChange={(e) => setUsedMl(e.target.value.replace(/[^\d.]/g, ""))} inputMode="decimal" className="w-16 rounded border border-rule bg-paper px-1 py-0.5" />mL
        </label>
        <label className="flex items-center gap-1">
          未使用のアンプル
          <input type="number" min={0} value={unusedA} onChange={(e) => setUnusedA(Math.max(0, Math.floor(Number(e.target.value))))} className="w-14 rounded border border-rule bg-paper px-1 py-0.5" />A
        </label>
        <span className="nums">
          施用残量 <b>{leftMl}mL</b>（開けた {issuedA - unusedA}A × {per}mL − 施用量）
        </span>
        <button
          type="button"
          disabled={disabled || problems.length > 0}
          onClick={() => {
            onReturn({ orderId: d.entry.id, patientId: d.patientId, code: d.item.drugCode, marKey: d.key, usedAt: { day: Math.floor(d.at / 1440), time: hhmm(d.at) }, issuedA, usedMl: used, leftMl, unusedA, prescriber, by: me.name, returnedAt: { day: 0, time: nowTime } });
            auditLog({ role: me.role, actor: me.name, action: "麻薬施用票を書いて薬剤部へ返納した", patient: x?.patient.name, detail: `${anyDrugName(d.item.drugCode)} 施用 ${used}mL 残 ${leftMl}mL 未使用 ${unusedA}A` });
          }}
          className="ml-auto rounded bg-ai px-2.5 py-0.5 font-bold text-white disabled:opacity-40"
        >
          施用票を書いて薬剤部へ返納（残液・空アンプルを添える）
        </button>
      </div>
      {problems.length > 0 && usedMl !== "" && <p className="mt-1 text-xs font-bold text-shu">{problems.join("。")}</p>}
    </div>
  );
}

function OralReturn({ label, code, returned, disabled, onReturn }: { label: string; code: string; returned: number; disabled: boolean; onReturn: (qty: number, by: string) => void }) {
  const me = useMe();
  const [qty, setQty] = useState("");
  return (
    <div className="mb-1 flex flex-wrap items-center gap-2 text-xs">
      <span>
        {label}
        <DrugMarks codes={[code]} />
      </span>
      {returned > 0 && (
        <span className="text-ink-soft">
          返納済み {returned}
          {unitOf(code)}
        </span>
      )}
      <input value={qty} onChange={(e) => setQty(e.target.value.replace(/[^\d]/g, ""))} inputMode="numeric" placeholder="残った数" className="ml-auto w-20 rounded border border-rule bg-paper px-1.5 py-0.5" aria-label="返納する数" />
      <button
        type="button"
        disabled={disabled || !Number(qty)}
        onClick={() => {
          onReturn(Number(qty), me.name);
          auditLog({ role: me.role, actor: me.name, action: "内服の麻薬を薬剤部へ返納した", detail: `${anyDrugName(code)} ${qty}${unitOf(code)}` });
          setQty("");
        }}
        className="rounded border border-ai px-2 py-0.5 text-ai hover:bg-ai-soft disabled:opacity-40"
      >
        薬剤部へ返納
      </button>
    </div>
  );
}

/* Help migration source (references and dynamic wording):
<p >
          麻薬の注射を与薬の欄で「実施」にすると、ここに施用票の行が出ます。施用した量と残った量（mL）を入れ、残液の入ったアンプルと空アンプルを添えて薬剤部へ返します。量の足し算が払い出した数に合うかはコードが確かめます。使わなかった内服の麻薬は、数を入れて返納します。
        </p>
<p >
          出典：
          <a href={NARCOTIC_SOURCES.manual.url} target="_blank" rel="noreferrer" >
            {NARCOTIC_SOURCES.manual.label}
          </a>
          （第4(6)：施用残液のあるアンプルと空アンプルは麻薬管理者に返納。第5(6)：施用量を確かめられる複写式の施用票）。診療録には実際に施用した量を mL で書きます（第6 1(2)①）。
        </p>
*/
