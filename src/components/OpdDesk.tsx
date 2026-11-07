"use client";

import { displayText } from "@/lib/display-text";
import { CalendarClock, CheckCircle2, IdCard, Keyboard, List, MonitorPlay, Printer, UserPlus } from "lucide-react";
import { useState } from "react";
import type { AdmissionRequest } from "@/lib/admission";
import { auditLog } from "@/lib/audit";
import { touchedBy, visibleChecks } from "@/lib/billing/check-visibility";
import { checkInsurance, currentRecord, EMPTY_FORM, insuranceSummary, normalizeForm, type InsuranceBook, type InsuranceForm, type InsuranceRecord } from "@/lib/billing/registration";
import { addDays, formatShort, type CalendarDate } from "@/lib/dates";
import { FACILITIES } from "@/lib/liaison";
import { formFromQualification, type CopiedForm } from "@/lib/national/onshi";
import type { OpdPatient, OpdStatus } from "@/lib/opd";
import { carriedInsurance, EMPTY_RECEPTION, insuranceStarted, receptionInsuranceRecord, receptionMissing, visitInsuranceKey, type ReceptionFields } from "@/lib/opd-reception";
import {
  arrive,
  bookToday,
  call,
  callToPay,
  CARDS,
  cardOf,
  clinicOf,
  CLINICS,
  deptsOf,
  displayBoard,
  isCardNo,
  kiosk,
  newCardNo,
  openOn,
  queueOf,
  receive,
  slotsFor,
  ticketLabel,
  tickets,
  type Booking,
  type Card,
} from "@/lib/opd-desk";
import { BigChoice } from "./BigChoice";
import { SubTabs, usePrintSheet } from "./DeskParts";
import { KioskScreen, WaitingDisplay } from "./OpdScreens";
import { OpdBoard } from "./OpdBoard";
import { ReceptionInsurance } from "./ReceptionInsurance";
import { useDeny, useMe } from "./RoleContext";
import { OnshiCheck } from "./national/OnshiCheck";
import { CardDesk } from "./portal/CardDesk";

/** What the 受付 keeps (in this browser): bookings on later days and the 診察券 issued today. */
export interface OpdDeskBook {
  bookings: Booking[];
  cards: Card[];
}
export const EMPTY_OPD_DESK: OpdDeskBook = { bookings: [], cards: [] };

type Tab = "list" | "reception" | "slots" | "cards";

const dow = (today: CalendarDate, d: number) => {
  const x = addDays(today, d);
  return new Date(Date.UTC(x.y, x.m - 1, x.d)).getUTCDay();
};

/**
 * 外来の受付一式: the 受付一覧 (受付番号・順番・呼出・会計の呼出・受付票), 受付（初診・予約外の再診）, 予約の枠
 * （診療科・医師ごと）, and two full-screen pages: the waiting-room display and the 再来受付機（模擬）.
 */
export function OpdDesk({
  patients,
  onPatients,
  desk,
  onDesk,
  revisits,
  today,
  nowTime,
  requests,
  onOpen,
  onOpenChart,
  newId,
  insuranceBook,
  onInsurance,
  portalWs = null,
}: {
  patients: OpdPatient[];
  onPatients: (f: (list: OpdPatient[]) => OpdPatient[]) => void;
  desk: OpdDeskBook;
  onDesk: (f: (d: OpdDeskBook) => OpdDeskBook) => void;
  /** 再診予約 written in the outpatients' tabs. */
  revisits: { day: number; time: string; name: string; doctor: string }[];
  today: CalendarDate;
  nowTime: string;
  requests: Record<string, AdmissionRequest | undefined>;
  onOpen: (id: string) => void;
  onOpenChart: (patientId: string) => void;
  newId: () => string;
  /** 保険の登録 (iji.insurance, keyed "opd:" + id): read for a 再診, written when the window registers at reception. */
  insuranceBook?: InsuranceBook;
  onInsurance?: (key: string, r: InsuranceRecord) => void;
  /** The workspace the patient's page reads (null: the fictional records of the code). */
  portalWs?: string | null;
}) {
  const me = useMe();
  const deny = useDeny();
  const [tab, setTab] = useState<Tab>("list");
  const [dept, setDept] = useState("");
  const [screen, setScreen] = useState<"display" | "kiosk" | null>(null);
  // The patient just received at the window (its 受付番号 is shown; `n` starts a fresh form).
  const [received, setReceived] = useState<{ id: string; n: number } | null>(null);
  const [print, sheet] = usePrintSheet();
  const cards = [...CARDS, ...desk.cards];
  const t = tickets(patients);
  const order = new Map(CLINICS.flatMap((c) => queueOf(patients, c.doctor).map((p, i) => [p.id, i + 1] as [string, number])));
  const shown = dept ? patients.filter((p) => p.department === dept) : patients;
  const log = (action: string, p?: OpdPatient, detail?: string) => auditLog({ role: me.role, actor: me.name, action, patient: p?.name, detail });
  const byId = (id: string) => patients.find((p) => p.id === id);

  const slip = (id: string, list = patients) => {
    const p = list.find((x) => x.id === id);
    if (!p) return;
    const n = tickets(list).get(id);
    print(<Slip p={p} ticket={n} room={clinicOf(p.doctor)?.room} date={formatShort(today)} />, { portrait: true });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-paper">
      <div className="flex flex-wrap items-center gap-2 border-b border-rule bg-sheet px-5 py-2">
        <SubTabs
          label="外来の受付の画面"
          value={tab}
          onChange={setTab}
          tabs={[
            { key: "list", label: "受付一覧", icon: List },
            { key: "reception", label: "受付（初診・予約外）", icon: UserPlus },
            { key: "slots", label: "予約の枠", icon: CalendarClock },
            { key: "cards", label: "診察券", icon: IdCard },
          ]}
        />
        <button type="button" onClick={() => setScreen("display")} className="flex items-center gap-1 rounded-md border border-rule px-2 py-1 text-sm hover:border-ai hover:text-ai">
          <MonitorPlay size={14} />
          待合の番号表示を開く
        </button>
        <button type="button" onClick={() => setScreen("kiosk")} className="flex items-center gap-1 rounded-md border border-rule px-2 py-1 text-sm hover:border-ai hover:text-ai">
          <Keyboard size={14} />
          再来受付機（模擬）を開く
        </button>

      </div>
      {tab === "list" && (
        <OpdBoard
          title="外来"
          tools={
            <select value={dept} onChange={(e) => setDept(e.target.value)} aria-label="診療科" className="rounded border border-rule bg-sheet px-1.5 py-0.5 text-sm">
              <option value="">すべての診療科</option>
              {deptsOf().map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
          }
          showDoctor
          patients={shown}
          nowTime={nowTime}
          requests={requests}
          onOpen={onOpen}
          onOpenChart={onOpenChart}
          ticketOf={(id) => t.get(id)}
          orderOf={(id) => order.get(id)}
          deny={{ arrive: deny("reception"), call: deny("opd.call"), pay: deny("settle") }}
          onStatus={(id, st: OpdStatus) => {
            log(`外来の状態を「${st}」にした`, byId(id));
            onPatients((list) => list.map((x) => (x.id === id ? { ...x, status: st } : x)));
          }}
          onArrive={(id) => {
            log("外来の受付をした", byId(id), "窓口");
            onPatients((list) => arrive(list, id, nowTime));
          }}
          onCall={(id) => {
            log("診察に呼んだ", byId(id), `${clinicOf(byId(id)?.doctor ?? "")?.room ?? ""}・受付番号 ${ticketLabel(t.get(id))}`);
            onPatients((list) => call(list, id, nowTime, me.name));
          }}
          onPayCall={(id) => {
            log("会計に呼んだ", byId(id), `受付番号 ${ticketLabel(t.get(id))}`);
            onPatients((list) => callToPay(list, id, nowTime, me.name));
          }}
          onSlip={slip}
        />
      )}
      {tab === "reception" && (
        <Reception
          key={received?.n ?? 0}
          cards={cards}
          patients={patients}
          insuranceBook={insuranceBook}
          today={today}
          nowTime={nowTime}
          locked={deny("reception")}
          done={(() => {
            const p = received ? byId(received.id) : undefined;
            return p ? { name: p.name, ticket: t.get(p.id), onPrint: () => slip(p.id), onList: () => setTab("list") } : null;
          })()}
          onReceive={(x) => {
            const id = `opd-${newId()}`;
            const next = receive(patients, { ...x, id }, nowTime);
            onPatients(() => next);
            if (x.newCard) onDesk((d) => ({ ...d, cards: [...d.cards, x.card] }));
            // The insurance typed (or carried from an earlier visit) goes to the same 保険の登録 as 医事課's.
            if (x.insurance && onInsurance) {
              onInsurance(visitInsuranceKey(id), x.insurance);
              log(x.insurance.action === "確認" ? "前の受診の保険の登録を今日の受診に引き継いだ（受付）" : "保険を登録した（受付）", undefined, `${x.card.name}・${insuranceSummary(x.insurance.insurance)}`);
            }
            log(`外来の受付をした（${x.kind}）`, undefined, `${x.card.name}・${x.dept}・${x.doctor}${x.referral ? `・紹介状（${x.referral.facilityName}）` : ""}`);
            // The 受付番号 is shown on the form; the 受付票 is printed with its own button (no dialog by itself).
            setReceived((r) => ({ id, n: (r?.n ?? 0) + 1 }));
          }}
        />
      )}
      {tab === "slots" && (
        <Slots
          today={today}
          patients={patients}
          bookings={desk.bookings}
          revisits={revisits}
          cards={cards}
          locked={deny("reception")}
          onBook={(b) => {
            const booking: Booking = { ...b, id: `opd-${newId()}`, by: me.name, at: nowTime };
            log(`外来の予約を取った（${b.kind}）`, undefined, `${b.name}・${formatShort(addDays(today, b.day))} ${b.time}・${b.doctor}`);
            if (b.day === 0)
              onPatients((list) =>
                bookToday(
                  list,
                  booking,
                  cards.find((c) => c.cardNo === b.cardNo),
                ),
              );
            else onDesk((d) => ({ ...d, bookings: [...d.bookings, booking] }));
          }}
        />
      )}
      {tab === "cards" && <CardDesk cards={cards} patients={patients} ws={portalWs} book={insuranceBook ?? {}} today={today} />}
      {screen === "display" && <WaitingDisplay board={displayBoard(patients, dow(today, 0))} nowTime={nowTime} onClose={() => setScreen(null)} />}
      {screen === "kiosk" && (
        <KioskScreen
          samples={patients.filter((p) => cardOf(p) && p.status === "予約").map((p) => ({ cardNo: cardOf(p)!, label: `${p.department} ${p.slot}` }))}
          onRead={(no) => {
            const r = kiosk(patients, cards, no, nowTime);
            if (r.result.kind === "受付しました") {
              log("再来受付機（模擬）で受付した", r.result.patient, `受付番号 ${ticketLabel(r.result.ticket)}`);
              onPatients(() => r.list);
            }
            return r.result;
          }}
          onSlip={(id) => {
            setScreen(null);
            setTimeout(() => slip(id), 0);
          }}
          onClose={() => setScreen(null)}
        />
      )}
      {sheet}
    </div>
  );
}

/** 受付票 (A4 portrait; the top part is the slip). */
function Slip({ p, ticket, room, date }: { p: OpdPatient; ticket?: number; room?: string; date: string }) {
  return (
    <div className="w-[90mm] border border-ink p-[6mm] text-[10pt]">
      <p className="text-center text-[12pt] font-bold">受付票</p>
      <p className="text-center text-[9pt]">架空総合病院</p>
      <p className="mt-3 text-center text-[9pt]">受付番号</p>
      <p className="nums text-center text-[36pt] font-bold leading-none">{ticketLabel(ticket)}</p>
      <table className="mt-3 w-full text-[10pt]">
        <tbody>
          {(
            [
              ["日付", date],
              ["氏名", `${p.name} 様`],
              ["診察券", cardOf(p) ?? "（初診・発行中）"],
              ["診療科", p.department],
              ["医師", p.doctor],
              ["診察室", room ?? "—"],
              ["区分", p.kind],
              ["予約", p.slot ?? "予約外"],
              ["受付", p.arrived ?? "—"],
            ] as [string, string][]
          ).map(([k, v]) => (
            <tr key={k}>
              <th className="w-[22mm] py-0.5 text-left font-normal">{k}</th>
              <td className="py-0.5">{displayText(v)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 text-[8pt]">待合の表示に受付番号が出たら、診察室へお入りください。お名前ではお呼びしません。</p>
    </div>
  );
}

/** What the window hands over when it receives. */
export interface Received {
  card: Card;
  newCard: boolean;
  kind: "初診" | "再診";
  dept: string;
  doctor: string;
  reason: string;
  referral?: { facilityId: string; facilityName: string };
  /** The insurance to register with today's visit (typed, filled from the 資格確認, or carried from an earlier visit). */
  insurance?: InsuranceRecord;
}

/** The patient just received: shown on the form with the 受付票 button (exported for tests). */
export interface ReceptionDone {
  name: string;
  ticket: number | undefined;
  onPrint: () => void;
  onList: () => void;
}

export function Reception({
  cards,
  patients = [],
  insuranceBook,
  today,
  nowTime,
  locked,
  done = null,
  onReceive,
}: {
  cards: Card[];
  patients?: OpdPatient[];
  insuranceBook?: InsuranceBook;
  today: CalendarDate;
  nowTime: string;
  locked: string | null;
  done?: ReceptionDone | null;
  onReceive: (x: Received) => void;
}) {
  const me = useMe();
  const [kind, setKind] = useState<"初診" | "再診" | "">("");
  const [f, setF] = useState<ReceptionFields>(EMPTY_RECEPTION);
  const set = (x: Partial<ReceptionFields>) => setF((c) => ({ ...c, ...x }));
  // The insurance block (registration.ts form); its checks show for the fields touched, or all after the 資格確認 or a press on 受け付ける.
  const [ins, setIns] = useState<InsuranceForm>(EMPTY_FORM);
  const [touched, setTouched] = useState<ReadonlySet<string>>(() => new Set());
  const [revealAll, setRevealAll] = useState(false);
  const [derived, setDerived] = useState<CopiedForm["derived"]>([]);
  const setInsurance = (patch: Partial<InsuranceForm>) => {
    setIns((c) => ({ ...c, ...patch }));
    setTouched((t) => touchedBy(t, patch));
  };
  const card = kind === "再診" ? cards.find((c) => c.cardNo === f.cardNo || (f.cardNo.length >= 2 && (c.name.includes(f.cardNo) || c.kana.includes(f.cardNo)))) : undefined;
  const doctors = CLINICS.filter((c) => c.dept === f.dept);
  const age = kind === "初診" ? (f.age !== "" ? Number(f.age) : null) : (card?.age ?? null);
  // 再診: the registration of an earlier visit with the same 診察券 (shown; carried to today's visit).
  const existing = kind === "再診" && card && insuranceBook ? patients.filter((p) => cardOf(p) === card.cardNo).map((p) => currentRecord(insuranceBook, visitInsuranceKey(p.id))).find((r) => !!r) : undefined;
  const insChecks = !existing && insuranceStarted(ins) && age !== null ? checkInsurance(ins, { age, on: today }) : [];
  const insErrors = insChecks.filter((c) => c.level === "error").length;
  const shownChecks = visibleChecks(insChecks, { fresh: true, revealAll, touched });
  const missing = receptionMissing(kind, f, card, insErrors);
  // The hidden 「直す」 of the insurance are the only thing left: the button stays live so that pressing it shows them.
  const onlyInsurance = missing.length === 1 && missing[0].startsWith("保険の入力") && !revealAll;
  const canPress = !locked && (missing.length === 0 || onlyInsurance);
  const receiveNow = () => {
    if (locked) return;
    if (missing.length) {
      setRevealAll(true);
      return;
    }
    const fac = FACILITIES.find((x) => x.id === f.referral);
    const c: Card = kind === "初診" ? { cardNo: newCardNo(cards), name: f.name.trim(), kana: f.kana.trim(), sex: f.sex as "男" | "女", age: Number(f.age) } : card!;
    const insurance = existing ? carriedInsurance(existing, me.name, nowTime) : (receptionInsuranceRecord(ins, { age: c.age, today, by: me.name, time: nowTime }) ?? undefined);
    onReceive({ card: c, newCard: kind === "初診", kind: kind as "初診" | "再診", dept: f.dept, doctor: f.doctor, reason: f.reason.trim(), ...(kind === "初診" && fac ? { referral: { facilityId: fac.id, facilityName: fac.name } } : {}), ...(insurance ? { insurance } : {}) });
  };
  const input = "rounded border border-rule bg-sheet px-1.5 py-1";
  return (
    <div className="scroll-thin min-h-0 flex-1 overflow-auto px-5 py-4 text-[13px]">
      <h2 className="mb-1 text-lg font-bold">
        受付（初診・予約外の再診）

      </h2>

      {locked && <p className="mb-2 text-[12px] text-ink-soft">{locked}</p>}
      {done && (
        <div role="status" className="mb-3 flex max-w-3xl flex-wrap items-center gap-3 rounded-lg border border-wakatake/50 bg-wakatake-soft px-4 py-2">
          <CheckCircle2 size={16} className="shrink-0 text-wakatake" />
          <span>
            受け付けました：<b>{displayText(done.name)}</b>さん　受付番号 <b className="nums text-xl">{ticketLabel(done.ticket)}</b>
          </span>
          <button type="button" onClick={done.onPrint} className="inline-flex min-h-9 items-center gap-1 rounded-md border border-rule bg-sheet px-3 text-[13px] font-bold hover:border-ai hover:text-ai">
            <Printer size={14} />
            受付票を印刷
          </button>
          <button type="button" onClick={done.onList} className="inline-flex min-h-9 items-center rounded-md border border-rule bg-sheet px-3 text-[13px] hover:border-ai hover:text-ai">
            受付一覧へ
          </button>
        </div>
      )}
      <div className="grid max-w-3xl gap-2 rounded-lg border border-rule bg-sheet p-3 sm:grid-cols-2">
        <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
          区分
          <BigChoice
            label="区分（初診・再診）"
            name="kind"
            value={kind}
            onChange={setKind}
            options={[
              { value: "初診", label: "初診（診察券を作る）" },
              { value: "再診", label: "再診（予約外。診察券で探す）" },
            ]}
          />
        </div>
        {kind === "初診" && (
          <>
            <label className="flex items-center gap-2">
              氏名
              <input value={f.name} onChange={(e) => set({ name: e.target.value })} placeholder="名前" className={`${input} min-w-0 flex-1`} />
            </label>
            <label className="flex items-center gap-2">
              カナ
              <input value={f.kana} onChange={(e) => set({ kana: e.target.value })} className={`${input} min-w-0 flex-1`} />
            </label>
            <label className="flex items-center gap-2">
              性別
              <select value={f.sex} onChange={(e) => set({ sex: e.target.value as "男" | "女" })} className={input}>
                <option value="">選ぶ</option>
                <option>男</option>
                <option>女</option>
              </select>
              年齢
              <input value={f.age} onChange={(e) => set({ age: e.target.value.replace(/\D/g, "") })} inputMode="numeric" className={`${input} w-16`} />
            </label>
            <label className="flex items-center gap-2">
              紹介状
              <select value={f.referral} onChange={(e) => set({ referral: e.target.value })} className={`${input} min-w-0 flex-1`}>
                <option value="">なし</option>
                {FACILITIES.map((x) => (
                  <option key={x.id} value={x.id}>
                    {displayText(x.name)}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
        {kind === "再診" && (
          <label className="flex items-center gap-2 sm:col-span-2">
            診察券番号か氏名
            <input value={f.cardNo} onChange={(e) => set({ cardNo: e.target.value })} placeholder="例：1000111" className={`${input} w-40`} />
            {card ? (
              <span>
                <b>{displayText(card.name)}</b>（{card.kana}・{card.sex}・{card.age}歳・{card.cardNo}）
              </span>
            ) : (
              f.cardNo && <span className="text-shu">{isCardNo(f.cardNo) ? "この番号の診察券はありません" : "見つかりません"}</span>
            )}
          </label>
        )}
        {kind && (
          <>
            <label className="flex items-center gap-2">
              診療科
              <select value={f.dept} onChange={(e) => set({ dept: e.target.value, doctor: "" })} className={input}>
                <option value="">選ぶ</option>
                {deptsOf().map((d) => (
                  <option key={d}>{d}</option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2">
              医師
              <select value={f.doctor} onChange={(e) => set({ doctor: e.target.value })} className={input} disabled={!f.dept}>
                <option value="">選ぶ</option>
                {doctors.map((c) => (
                  <option key={c.doctor} value={c.doctor}>
                    {displayText(c.doctor)}（{c.room}）
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 sm:col-span-2">
              受診の理由
              <input value={f.reason} onChange={(e) => set({ reason: e.target.value })} className={`${input} min-w-0 flex-1`} />
            </label>
            <label className="flex items-center gap-1 sm:col-span-2">
              <input type="checkbox" checked={f.insured} onChange={(e) => set({ insured: e.target.checked })} />
              保険証（資格確認書）かマイナ保険証で資格を確かめた
            </label>
            <div className="sm:col-span-2">
              <OnshiCheck
                compact
                person={kind === "初診" ? (f.name.trim() && f.kana.trim() && f.sex && f.age !== "" ? { name: f.name.trim(), kana: f.kana.trim(), sex: f.sex, age: Number(f.age) } : null) : card ? { name: card.name, kana: card.kana, sex: card.sex, age: card.age } : null}
                today={today}
                nowTime={nowTime}
                locked={locked}
                card={{ insurerNumber: ins.insurerNumber, symbol: ins.symbol, number: ins.number, branch: ins.branch, birthDate: ins.birthDate }}
                current={ins}
                onChecked={(r) => {
                  if (r.status !== "有効") return;
                  set({ insured: true });
                  // A valid answer fills the insurance block below (the person checks it and receives).
                  if (r.info && !existing) {
                    const c = formFromQualification(r.info, today, ins);
                    setIns(normalizeForm(c.form));
                    setDerived(c.derived);
                    setRevealAll(true);
                  }
                }}
              />
            </div>
            <div className="sm:col-span-2">
              <ReceptionInsurance form={ins} onChange={setInsurance} today={today} checks={shownChecks} derived={derived} existing={existing} disabled={!!locked} />
            </div>
          </>
        )}
        <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
          <button type="button" disabled={!canPress} onClick={receiveNow} className="min-h-9 rounded-md bg-ai px-4 font-bold text-white disabled:opacity-40">
            受け付ける
          </button>
          {missing.length > 0 && (
            <span role="status" className="text-[12px] text-yamabuki">
              まだ入れるもの：{missing.join("・")}
            </span>
          )}

        </div>
      </div>
    </div>
  );
}

function Slots({
  today,
  patients,
  bookings,
  revisits,
  cards,
  locked,
  onBook,
}: {
  today: CalendarDate;
  patients: OpdPatient[];
  bookings: Booking[];
  revisits: { day: number; time: string; name: string; doctor: string }[];
  cards: Card[];
  locked: string | null;
  onBook: (b: Omit<Booking, "id" | "by" | "at">) => void;
}) {
  const [doctor, setDoctor] = useState(CLINICS[0].doctor);
  const [day, setDay] = useState(0);
  const [pick, setPick] = useState<string | null>(null);
  const [who, setWho] = useState({ cardNo: "", name: "", kana: "", kind: "" as "初診" | "再診" | "", purpose: "" });
  const c = clinicOf(doctor)!;
  const days = Array.from({ length: 14 }, (_, i) => i).filter((d) => openOn(c, dow(today, d)));
  const d = days.includes(day) ? day : (days[0] ?? 0);
  const slots = slotsFor(c, d, patients, bookings, revisits);
  const card = who.kind === "再診" ? cards.find((x) => x.cardNo === who.cardNo) : undefined;
  const ok = !locked && pick && who.kind && who.purpose.trim() && (who.kind === "初診" ? who.name.trim() : !!card);
  const input = "rounded border border-rule bg-sheet px-1.5 py-0.5";
  return (
    <div className="scroll-thin min-h-0 flex-1 overflow-auto px-5 py-4 text-[13px]">
      <h2 className="mb-1 text-lg font-bold">
        予約の枠

      </h2>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <select value={doctor} onChange={(e) => (setDoctor(e.target.value), setPick(null))} aria-label="診療科・医師" className={input}>
          {CLINICS.map((x) => (
            <option key={x.doctor} value={x.doctor}>
              {displayText(x.dept)}　{displayText(x.doctor)}（{x.room}）
            </option>
          ))}
        </select>
        <select value={d} onChange={(e) => (setDay(Number(e.target.value)), setPick(null))} aria-label="日" className={input}>
          {days.map((x) => (
            <option key={x} value={x}>
              {formatShort(addDays(today, x))}
              {x === 0 ? "（今日）" : ""}
            </option>
          ))}
        </select>
        <span className="text-[12px] text-ink-soft">
          {["日", "月", "火", "水", "木", "金", "土"].filter((_, i) => c.days.includes(i)).join("・")}曜　{c.sessions.map(([a, b]) => `${a}〜${b}`).join("、")}　1枠 {c.minutes}分・{c.capacity}人
        </span>
      </div>

      <div className="grid gap-1.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        {slots.map((s) => {
          const full = s.taken.length >= s.capacity;
          return (
            <button
              key={s.time}
              type="button"
              onClick={() => setPick(s.time)}
              disabled={full}
              aria-pressed={pick === s.time}
              className={`rounded-md border p-1.5 text-left text-[12px] ${pick === s.time ? "border-ai bg-ai-soft" : full ? "border-rule bg-paper text-ink-faint" : "border-rule bg-sheet hover:border-ai"}`}
            >
              <span className="nums font-bold">{s.time}</span>
              <span className={`nums ml-1 ${full ? "text-shu" : "text-ink-soft"}`}>
                {s.taken.length}/{s.capacity}
                {full ? " 満" : ""}
              </span>
              {s.taken.map((x, i) => (
                <span key={i} className="block truncate text-[11px] text-ink-soft" title={displayText(x.from)}>
                  {displayText(x.name)}（{x.kind}）
                </span>
              ))}
            </button>
          );
        })}
      </div>
      {pick && (
        <div className="mt-3 grid max-w-3xl gap-2 rounded-lg border border-ai/40 bg-sheet p-3 sm:grid-cols-2">
          <p className="font-bold sm:col-span-2">
            {formatShort(addDays(today, d))} {pick}　{displayText(c.dept)} {displayText(c.doctor)} に予約を取る
          </p>
          <label className="flex items-center gap-2 sm:col-span-2">
            区分
            {(["初診", "再診"] as const).map((k) => (
              <label key={k} className="flex items-center gap-1">
                <input type="radio" name="bkind" checked={who.kind === k} onChange={() => setWho((w) => ({ ...w, kind: k }))} />
                {k}
              </label>
            ))}
          </label>
          {who.kind === "再診" && (
            <label className="flex items-center gap-2 sm:col-span-2">
              診察券番号
              <input value={who.cardNo} onChange={(e) => setWho((w) => ({ ...w, cardNo: e.target.value.replace(/\D/g, "") }))} className={`${input} w-28`} placeholder="例：1000111" />
              {card ? <b>{displayText(card.name)}</b> : who.cardNo.length === 7 && <span className="text-shu">この番号の診察券はありません</span>}
            </label>
          )}
          {who.kind === "初診" && (
            <>
              <label className="flex items-center gap-2">
                氏名
                <input value={who.name} onChange={(e) => setWho((w) => ({ ...w, name: e.target.value }))} className={`${input} min-w-0 flex-1`} placeholder="名前" />
              </label>
              <label className="flex items-center gap-2">
                カナ
                <input value={who.kana} onChange={(e) => setWho((w) => ({ ...w, kana: e.target.value }))} className={`${input} min-w-0 flex-1`} />
              </label>
            </>
          )}
          <label className="flex items-center gap-2 sm:col-span-2">
            目的
            <input value={who.purpose} onChange={(e) => setWho((w) => ({ ...w, purpose: e.target.value }))} className={`${input} min-w-0 flex-1`} />
          </label>
          <div className="sm:col-span-2">
            <button
              type="button"
              disabled={!ok}
              onClick={() => {
                onBook({ day: d, time: pick!, dept: c.dept, doctor: c.doctor, kind: who.kind as "初診" | "再診", purpose: who.purpose.trim(), ...(card ? { cardNo: card.cardNo, name: card.name, kana: card.kana } : { name: who.name.trim(), kana: who.kana.trim() }) });
                setPick(null);
                setWho({ cardNo: "", name: "", kana: "", kind: "", purpose: "" });
              }}
              className="rounded-md bg-ai px-3 py-1 font-bold text-white disabled:opacity-40"
            >
              予約を取る
            </button>
            {locked && <span className="ml-2 text-[11px] text-ink-soft">{locked}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

/* Help migration source (references and dynamic wording):
<span >待合の表示と再来受付機は、モニタや iPad に全画面で出す画面です（この端末の中の模擬）。</span>
<span >最初から選ばれている項目はありません。紹介状のある初診は、地域医療連携の台帳に入ります。</span>
*/

/* ヘルプへ移動した説明:
予約のある患者は、受付一覧の「受付する」か再来受付機（模擬）で受け付けます。受け付けると受付番号が付き、「受付票を印刷」で印刷します。 受付。
*/
