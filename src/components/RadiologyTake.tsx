"use client";
import { displayText } from "@/lib/display-text";
import { TimeInput } from "@/components/TimeInput";

// 放射線部の指示受け (診療放射線技師), in the ward's 指示受け form (OrderSheet.tsx): the date to move through, the
// kinds (X線・CT・MRI・エコー・ポータブル), 至急だけ, 「指示受け済みも表示する」, 全チェック・一括受け, a band per
// patient with the marks the technologist must see (infection, contrast allergy, pregnancy, metal), and one block
// per order with ○, the heading, the three 「日時／者」 pairs (指示・予定・指示受け) and 「項目名：値」 lines. Taking
// an order makes it 受付済み (ris.ts arrived) and opens the room/device/time controls under it; a contrast or MRI
// study then asks for 指示確認 (RisConfirmPanel). Also here: the day's worklist per room (Worklist) and the round
// of portable studies (PortableRound). What is listed and compared is code (ris-take.ts); people decide.

import { useState } from "react";
import { auditLog } from "@/lib/audit";
import type { ConsentRecord } from "@/lib/consent";
import { addDays, formatShort, type CalendarDate } from "@/lib/dates";
import { abs } from "@/lib/flowsheet";
import { findRoom, putWork, roomsFor, type RisRow, type RisWork, type RoomKey } from "@/lib/ris";
import {
  callHow,
  confirmPending,
  isTakenRis,
  kindOf,
  mustTakeOne,
  needsRisConfirm,
  nextStep,
  patientMarks,
  portableRound,
  RIS_STAMP_LABELS,
  RIS_TAKE_DAYS,
  RIS_TAKE_KINDS,
  RIS_TAKE_SOURCES,
  risConfirmItems,
  risStamps,
  risTakeFields,
  risTakeLate,
  risTakeOnDay,
  risTakeTitle,
  consentTextOf,
  rowFlags,
  usesContrast,
  worklist,
  worklistLate,
  type ConfirmItem,
  type RisFlag,
  type RisTakeKind,
} from "@/lib/ris-take";
import type { WorkPatient } from "@/lib/worksheet";
import { ConfirmCheck, WAITING_BUTTON, Waits } from "./ConfirmCheck";
import { Sources } from "./DeskParts";
import { PatientBand, SheetBand, SheetBlock, SheetNotes } from "./OrderSheet";
import { card, field, whenText, type OnDesk } from "./RisExam";
import { DenyNote, useDeny, useMe } from "./RoleContext";

interface Props {
  people: WorkPatient[];
  rows: RisRow[];
  onDesk: OnDesk;
  nowTime: string;
  today: CalendarDate;
  /** The consent forms of the ward (for 同意 of a contrast study). */
  consents?: ConsentRecord[];
}

const FLAG_CLASS: Record<RisFlag["tone"], string> = { shu: "bg-shu text-white", yamabuki: "bg-yamabuki-soft text-yamabuki", ink: "bg-tab text-ink" };
const KIND_TONE: Record<RisTakeKind, "ai" | "yamabuki" | "ink" | "wakatake" | "shu"> = { X線: "ai", CT: "yamabuki", MRI: "wakatake", エコー: "ink", ポータブル: "ink" };

/** 指示受け → 受付・割り当て → 指示確認, in one list. */
export function RadiologyTake({ people, rows, onDesk, nowTime, today, consents }: Props) {
  const me = useMe();
  const deny = useDeny()("ris.exam");
  const [day, setDay] = useState(0);
  const [kinds, setKinds] = useState<RisTakeKind[]>(RIS_TAKE_KINDS);
  const [urgentOnly, setUrgentOnly] = useState(false);
  const [showTaken, setShowTaken] = useState(false);
  const [checked, setChecked] = useState<Set<string>>(() => new Set());
  const [open, setOpen] = useState<{ id: string; what: "one" | "confirm" } | null>(null);
  const nowAbs = abs(0, nowTime);
  const at = { day: 0, time: nowTime };

  const onDay = rows.filter((r) => risTakeOnDay(r, day) && r.status !== "中止");
  const shown = onDay.filter((r) => kinds.includes(kindOf(r.order.modality)) && (!urgentOnly || r.order.when.priority === "至急"));
  const waiting = shown.filter((r) => !isTakenRis(r));
  const pending = shown.filter(confirmPending);
  const takenShown = shown.filter(isTakenRis);
  // Taken rows stay until assigned and (when needed) confirmed; the rest hide until 「指示受け済みも表示する」.
  const list = showTaken ? shown : shown.filter((r) => !isTakenRis(r) || !r.work?.room || confirmPending(r));
  const late = waiting.filter((r) => risTakeLate(r, nowAbs));
  const otherDays = rows.filter((r) => !isTakenRis(r) && r.status !== "中止" && !risTakeOnDay(r, day)).length;
  const bulkable = waiting.filter((r) => mustTakeOne(r).length === 0);
  const bulk = bulkable.filter((r) => checked.has(r.orderId));

  const log = (r: RisRow, what: string, detail = "") => auditLog({ role: me.role, actor: me.name, action: `確定（放射線部：${what}）`, patient: r.name, detail: `${r.label}${detail}` });
  const take = (r: RisRow) => {
    onDesk((d) => putWork(d, r, (w) => ({ ...w, arrived: { ...at, by: me.name } })));
    log(r, "指示受け（受付）");
    setChecked((s) => {
      const n = new Set(s);
      n.delete(r.orderId);
      return n;
    });
    setOpen(needsRisConfirm(r.order) ? { id: r.orderId, what: "confirm" } : null);
  };
  const takeBulk = () => {
    for (const r of bulk) {
      onDesk((d) => putWork(d, r, (w) => ({ ...w, arrived: { ...at, by: me.name } })));
      log(r, "指示受け（受付・一括）");
    }
    setChecked(new Set());
    setOpen(null);
  };

  const groups: { patientId: string; room: string; name: string; rows: RisRow[] }[] = [];
  for (const r of list) {
    const g = groups.find((x) => x.patientId === r.patientId);
    if (g) g.rows.push(r);
    else groups.push({ patientId: r.patientId, room: r.room, name: r.name, rows: [r] });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <SheetBand<RisTakeKind>
        day={day}
        range={RIS_TAKE_DAYS}
        onDay={(d) => {
          setDay(d);
          setChecked(new Set());
          setOpen(null);
        }}
        today={today}
        also={{ label: "指示受け済みも表示する", checked: showTaken, count: takenShown.length - pending.length, onChange: setShowTaken }}
        cats={kinds}
        onCats={setKinds}
        categories={RIS_TAKE_KINDS}
        check={{
          all: () => setChecked(new Set(bulkable.map((r) => r.orderId))),
          none: () => setChecked(new Set()),
          bulk: { label: "一括受け", count: bulk.length, disabled: !!deny, onClick: takeBulk, title: "チェックした指示をまとめて受けます。至急・造影・MRI はチェックできず、1件ずつ受けます" },
        }}
      >
        <label className="flex cursor-pointer items-center gap-1 text-xs">
          <input type="checkbox" className="accent-ai" checked={urgentOnly} onChange={(e) => setUrgentOnly(e.target.checked)} />
          至急だけ
        </label>
        <span className={`rounded px-2 py-0.5 text-xs font-bold ${waiting.length ? "bg-yamabuki-soft text-yamabuki" : "bg-wakatake-soft text-wakatake"}`}>未指示受け {waiting.length}件</span>
        {otherDays > 0 && <span className="text-xs text-yamabuki">ほかの日に {otherDays}件</span>}
        {late.length > 0 && <span className="rounded bg-shu px-2 py-0.5 text-xs font-bold text-white">遅れ {late.length}件</span>}
        {pending.length > 0 && <span className="rounded bg-yamabuki-soft px-2 py-0.5 text-xs font-bold text-yamabuki">受けたが確認がまだ {pending.length}件</span>}
      </SheetBand>
      <div className="space-y-4">
        <DenyNote action="ris.exam" />

        {groups.length === 0 ? (
          <p className="rounded-lg border border-rule bg-sheet px-4 py-3 text-[12px] text-ink-faint">{waiting.length === 0 && takenShown.length > 0 ? "この日の指示はすべて受けています。「指示受け済みも表示する」で見られます。" : "この日に受ける画像検査の指示はありません。"}</p>
        ) : (
          groups.map((g) => {
            const person = people.find((x) => x.patient.id === g.patientId);
            const w = g.rows.filter((r) => !isTakenRis(r));
            const marks = person ? patientMarks(person.patient, g.rows) : [];
            return (
              <section key={g.patientId} className="rounded-lg border border-rule bg-sheet">
                {person ? (
                  <PatientBand patient={person.patient} room={g.room}>
                    {marks.map((m) => (
                      <span key={m.text} className={`rounded px-1 text-[10px] font-bold ${FLAG_CLASS[m.tone]}`}>
                        {displayText(m.text)}
                      </span>
                    ))}
                    <span className="ml-auto text-ink-soft">{w.length ? `未指示受け ${w.length}件` : "受け済み"}</span>
                  </PatientBand>
                ) : (
                  <div className="border-b border-rule-soft bg-paper px-2 py-1 text-[12px] font-bold">
                    {g.room}　{g.name}
                  </div>
                )}
                <div className="px-2 pb-1">
                  {g.rows.map((r) => {
                    const ok = isTakenRis(r);
                    const one = mustTakeOne(r);
                    const mine = open?.id === r.orderId ? open.what : null;
                    const flags = rowFlags(r).map((f) => ({ text: f.text, className: FLAG_CLASS[f.tone] }));
                    if (!ok && risTakeLate(r, nowAbs)) flags.push({ text: "遅れ", className: "bg-shu text-white" });
                    const consent = consentTextOf(r.orderId, consents, today);
                    const kind = kindOf(r.order.modality);
                    return (
                      <SheetBlock
                        key={r.orderId}
                        check={
                          ok
                            ? null
                            : {
                                checked: checked.has(r.orderId),
                                disabled: !!deny || one.length > 0,
                                title: one.length ? `1件ずつ受けます：${one.join("・")}` : "一括受けの対象にする",
                                label: `${r.name} ${risTakeTitle(r)} をチェック`,
                                onChange: (v) =>
                                  setChecked((s) => {
                                    const n = new Set(s);
                                    if (v) n.add(r.orderId);
                                    else n.delete(r.orderId);
                                    return n;
                                  }),
                              }
                        }
                        title={`画像検査　${risTakeTitle(r)}`}
                        tag={{ text: kind, tone: KIND_TONE[kind] }}
                        when={whenText(r.at)}
                        flags={flags}
                        stamps={risStamps(r, today)}
                        labels={RIS_STAMP_LABELS}
                        fields={risTakeFields(r, today, consent)}
                        status={
                          ok ? (
                            confirmPending(r) ? (
                              <button type="button" onClick={() => setOpen(mine === "confirm" ? null : { id: r.orderId, what: "confirm" })} className="rounded border border-yamabuki px-1.5 py-0.5 text-[10px] font-bold text-yamabuki hover:bg-yamabuki hover:text-white">
                                確認する（まだ）
                              </button>
                            ) : r.work?.confirmed ? (
                              <span className="text-[10px] text-wakatake">確認 {r.work.confirmed.time} {displayText(r.work.confirmed.by)}</span>
                            ) : null
                          ) : null
                        }
                      >
                        {!ok && (
                          <div className="mt-1 flex flex-wrap items-center gap-2 pl-3">
                            {one.length === 0 ? (
                              <button type="button" disabled={!!deny} onClick={() => take(r)} className="rounded border border-yamabuki px-1.5 py-0.5 text-[11px] font-bold text-yamabuki hover:bg-yamabuki hover:text-white disabled:opacity-40">
                                指示を受ける
                              </button>
                            ) : (
                              <button type="button" disabled={!!deny} onClick={() => setOpen(mine === "one" ? null : { id: r.orderId, what: "one" })} className="rounded border border-shu px-1.5 py-0.5 text-[11px] font-bold text-shu hover:bg-shu hover:text-white disabled:opacity-40">
                                開いて受ける
                              </button>
                            )}
                          </div>
                        )}
                        {mine === "one" && !ok && <TakeOne r={r} reasons={one} onTake={() => take(r)} onClose={() => setOpen(null)} />}
                        {ok && (
                          <div className="mt-1 pl-3">
                            <AssignControls r={r} onDesk={onDesk} nowTime={nowTime} />
                          </div>
                        )}
                        {mine === "confirm" && ok && confirmPending(r) && person && (
                          <div className="mt-1 ml-3">
                            <RisConfirmPanel
                              r={r}
                              items={risConfirmItems(r, person.patient, person.entries, consents, today)}
                              onConfirm={(items) => {
                                onDesk((d) => putWork(d, r, (w) => ({ ...w, confirmed: { ...at, by: me.name, items } })));
                                log(r, "指示確認", `　${items.join("・")}`);
                                setOpen(null);
                              }}
                              onClose={() => setOpen(null)}
                            />
                          </div>
                        )}
                      </SheetBlock>
                    );
                  })}
                </div>
              </section>
            );
          })
        )}
        <SheetNotes>

          <Sources items={RIS_TAKE_SOURCES} />
        </SheetNotes>
      </div>
    </div>
  );
}

/** Taking one order at a time: the reasons, a check that the technologist read it, and the button. */
function TakeOne({ r, reasons, onTake, onClose }: { r: RisRow; reasons: string[]; onTake: () => void; onClose: () => void }) {
  const [read, setRead] = useState(false);
  return (
    <div className="mt-1 ml-3 rounded bg-paper px-3 py-2 text-[12px]">
      <p className="font-bold">1件ずつ受ける：{reasons.join("・")}</p>
      <p className="text-ink-soft">
        {r.label}　{r.order.views?.join("＋")}　目的：{r.order.purpose}　{displayText(r.orderedBy)}
      </p>
      <div className="mt-1 flex flex-wrap items-center gap-3">
        <ConfirmCheck checked={read} onChange={setRead}>
          部位・造影・予定・目的を自分の目で確かめた
        </ConfirmCheck>
        <button type="button" disabled={!read} onClick={onTake} className={WAITING_BUTTON}>
          指示を受ける
        </button>
        <Waits on={!read} />
        <button type="button" onClick={onClose} className="text-ink-soft underline">
          あとで
        </button>
      </div>
    </div>
  );
}

/** 撮影室・装置と予定の時刻 of a taken study, and 撮影できなかった. One place for the 指示受け list and the worklist. */
export function AssignControls({ r, onDesk, nowTime }: { r: RisRow; onDesk: OnDesk; nowTime: string }) {
  const me = useMe();
  const deny = useDeny()("ris.exam");
  const [slot, setSlot] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const rooms = roomsFor(r.order.modality);
  const roomKey: RoomKey = r.work?.room ?? rooms[0].key;
  const time = slot ?? r.work?.slot?.time ?? (r.order.when.time || nowTime);
  const at = { day: 0, time: nowTime };
  const log = (what: string, detail = "") => auditLog({ role: me.role, actor: me.name, action: `確定（放射線部：${what}）`, patient: r.name, detail: `${r.label}${detail}` });
  const assign = (key: RoomKey) => {
    onDesk((d) => putWork(d, r, (w) => ({ ...w, room: key, slot: { day: r.order.when.day, time }, assignedBy: me.name })));
    log("装置を割り当て", `　${findRoom(key)?.room} ${time}`);
  };
  if (r.work?.notDone) return <p className="text-[11px] text-shu">撮影できなかった：{displayText(r.work.notDone.reason)}</p>;
  return (
    <div className="flex flex-wrap items-center gap-2 text-[12px]">
      <span className="text-ink-soft">
        受付 {r.work?.arrived?.time} {displayText(r.work?.arrived?.by)}
      </span>
      <span className="text-ink-soft">撮影室・装置</span>
      <select value={roomKey} disabled={!!deny} aria-label="撮影室・装置" onChange={(e) => assign(e.target.value as RoomKey)} className={field}>
        {rooms.map((x) => (
          <option key={x.key} value={x.key}>
            {x.room}（{x.ae}）
          </option>
        ))}
      </select>
      <TimeInput value={time} onChange={(e) => setSlot(e.target.value)} aria-label="撮影の予定時刻" disabled={!!deny} className={`${field} nums`} />
      <button type="button" disabled={!!deny} onClick={() => assign(roomKey)} className="rounded border border-ai px-2 py-0.5 text-ai disabled:opacity-40">
        {r.work?.room ? "予定を変える" : "割り当てる"}
      </button>
      {r.work?.room && (
        <span className="text-wakatake">
          {findRoom(r.work.room)?.room} {r.work.slot?.time}（{r.work.assignedBy}）
        </span>
      )}
      {!r.work?.done && (
        <>
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="撮影できない理由（例：検査を延期）" aria-label="撮影できない理由" disabled={!!deny} className={`${field} ml-auto w-56`} />
          <button
            type="button"
            disabled={!!deny || !reason.trim()}
            onClick={() => {
              onDesk((d) => putWork(d, r, (w) => ({ ...w, notDone: { ...at, by: me.name, via: "手入力", reason: reason.trim() } })));
              log("中止（撮影できなかった）", `　${reason.trim()}`);
            }}
            className="rounded border border-shu px-2 py-0.5 text-shu disabled:opacity-40"
          >
            撮影できなかった
          </button>
        </>
      )}
    </div>
  );
}

const ITEM_CLASS: Record<ConfirmItem["tone"], string> = { ok: "text-ink", warn: "font-bold text-shu", ask: "font-bold text-yamabuki" };

/** 指示確認 of a contrast or MRI study: the items in a list, a check that the technologist looked, and 「確認した」. */
export function RisConfirmPanel({ r, items, onConfirm, onClose }: { r: RisRow; items: ConfirmItem[]; onConfirm: (items: string[]) => void; onClose: () => void }) {
  const [looked, setLooked] = useState(false);
  const deny = useDeny()("ris.exam");
  return (
    <div className="rounded-md border border-ai/40 bg-sheet px-3 py-2 text-[12px]">
      <p className="font-bold">
        指示確認：{r.label}
        <span className="ml-2 font-normal text-ink-soft">{r.order.purpose}</span>
      </p>
      <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
        {items.map((i) => (
          <div key={i.label} className="contents">
            <dt className="text-ink-soft">{i.label}</dt>
            <dd className={ITEM_CLASS[i.tone]}>
              {i.value}
              {i.tone === "ask" && <span className="ml-1 font-normal text-ink-faint">（記録になし）</span>}
            </dd>
          </div>
        ))}
      </dl>
      <div className="mt-2 flex flex-wrap items-center gap-3 border-t border-rule-soft pt-1.5">
        <ConfirmCheck checked={looked} onChange={setLooked} disabled={!!deny}>
          {r.order.modality === "MRI" && !usesContrast(r.order) ? "体内金属・ペースメーカー・閉所を自分の目で確かめた（本人にも聞く）" : "同意・腎機能・アレルギー・内服を自分の目で確かめた"}
        </ConfirmCheck>
        <button type="button" disabled={!looked || !!deny} onClick={() => onConfirm(items.map((i) => `${i.label}：${i.value}`))} className={WAITING_BUTTON}>
          確認した
        </button>
        <Waits on={!looked && !deny} text="確かめたにチェックすると「確認した」を押せます" />
        <button type="button" onClick={onClose} className="text-ink-soft underline">
          あとで
        </button>
      </div>

    </div>
  );
}

const STEP_LABEL: Record<string, string> = { 呼出: "呼出", 来室: "来室", 撮影開始: "撮影開始", 撮影終了: "撮影終了", 画像送信: "画像送信" };

/** The day's worklist: the taken studies per room and device in time order, each with its next step to record. */
export function Worklist({ rows, onDesk, nowTime, today }: { rows: RisRow[]; onDesk: OnDesk; nowTime: string; today: CalendarDate }) {
  const me = useMe();
  const deny = useDeny()("ris.exam");
  const [day, setDay] = useState(0);
  const nowAbs = abs(0, nowTime);
  const { lanes, unassigned } = worklist(rows, day);
  const at = { day: 0, time: nowTime };
  const dayName = day === 0 ? "今日" : day === 1 ? "明日" : "昨日";
  const log = (r: RisRow, what: string, detail = "") => auditLog({ role: me.role, actor: me.name, action: `確定（放射線部：${what}）`, patient: r.name, detail: `${r.label}${detail}` });
  const step = (r: RisRow) => {
    const s = nextStep(r);
    const put = (f: (w: RisWork) => RisWork) => onDesk((d) => putWork(d, r, f));
    if (s === "呼出") {
      const how = callHow(r.room);
      put((w) => ({ ...w, called: { ...at, by: me.name, how } }));
      log(r, `呼出（${how}）`);
    } else if (s === "来室") {
      put((w) => ({ ...w, inRoom: { ...at, by: me.name } }));
      log(r, r.order.modality === "ポータブルX線" ? "病室に着いた" : "来室");
    } else if (s === "撮影開始") {
      put((w) => ({ ...w, started: { ...at, by: me.name, via: "手入力" } }));
      log(r, "撮影開始（手入力）");
    } else if (s === "撮影終了") {
      put((w) => ({ ...w, done: { ...at, by: me.name, via: "手入力" } }));
      log(r, "撮影済み（手入力）");
    } else if (s === "画像送信") {
      put((w) => ({ ...w, images: { ...at, by: me.name, count: w.exposure?.films ?? 1, series: 1, via: "手入力" } }));
      log(r, "画像を PACS へ送った（手入力）");
    }
  };
  const times = (r: RisRow) => {
    const w = r.work;
    return [w?.called && `呼出 ${w.called.time}（${w.called.how}）`, w?.inRoom && `${r.order.modality === "ポータブルX線" ? "病室" : "来室"} ${w.inRoom.time}`, w?.started && `開始 ${w.started.time}`, w?.done && `終了 ${w.done.time}`, w?.images && `画像送信 ${w.images.time}`].filter(Boolean).join("　");
  };
  const lane = (title: string, items: RisRow[], note?: string) => (
    <section key={title} className={`${card} p-3 text-[12px]`}>
      <h3 className="mb-1 flex items-center gap-2 font-bold">
        {title}
        <span className="nums font-normal text-ink-soft">{items.length}件</span>
        {note && <span className="font-normal text-ink-faint">{displayText(note)}</span>}
      </h3>
      {items.length === 0 ? (
        <p className="text-ink-faint">予定はありません。</p>
      ) : (
        <ol className="space-y-1">
          {items.map((r) => {
            const s = nextStep(r);
            const lateNow = day === 0 && worklistLate(r, nowAbs);
            const pend = confirmPending(r);
            return (
              <li key={r.orderId} className={`flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-rule-soft py-1 ${lateNow ? "bg-shu-soft/40" : ""}`}>
                <b className="nums w-12">{displayText(r.work?.slot?.time ?? whenText(r.at).split(" ")[1])}</b>
                <span>
                  {r.room}　<b>{r.name}</b>
                </span>
                <span>{r.label}</span>
                {r.order.when.priority === "至急" && <span className="rounded bg-shu px-1 text-[10px] font-bold text-white">至急</span>}
                {lateNow && <span className="rounded bg-shu px-1 text-[10px] font-bold text-white">遅れ（予定から{nowAbs - r.at}分）</span>}
                {pend && <span className="rounded bg-yamabuki-soft px-1 text-[10px] font-bold text-yamabuki">確認がまだ</span>}
                {r.work?.notDone && <span className="text-shu">中止：{displayText(r.work.notDone.reason)}</span>}
                <span className="text-ink-soft">{times(r)}</span>
                {s !== "済" && !r.work?.notDone && (
                  <button type="button" disabled={!!deny || (s === "撮影開始" && pend)} title={s === "撮影開始" && pend ? "指示確認がまだです（指示受けの画面で「確認する」）" : s === "呼出" ? `呼出：${callHow(r.room)}を記録します` : undefined} onClick={() => step(r)} className={`ml-auto rounded px-2 py-0.5 font-bold text-white disabled:opacity-40 ${s === "撮影終了" ? "bg-wakatake" : "bg-ai"}`}>
                    {STEP_LABEL[s]}
                  </button>
                )}
                {s === "済" && <span className="ml-auto text-wakatake">済</span>}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
  return (
    <section className="space-y-3">
      <DenyNote action="ris.exam" />
      <div className="flex flex-wrap items-center gap-2 text-[12px]">
        {[-1, 0, 1].map((d) => (
          <button key={d} type="button" onClick={() => setDay(d)} aria-pressed={day === d} className={`rounded border px-2 py-0.5 ${day === d ? "border-ai bg-ai-soft font-bold text-ai" : "border-rule"}`}>
            {d === 0 ? "今日" : d === 1 ? "明日" : "昨日"}
          </button>
        ))}
        <span className="text-ink-soft">
          {dayName}（{formatShort(addDays(today, day))}）の受付済みの検査を、装置ごとに予定の時刻の順に並べます。
        </span>
      </div>

      {lanes.map((l) => lane(`${l.room.room}　${l.room.device}`, l.rows))}
      {unassigned.length > 0 && lane("装置がまだ決まっていない", unassigned, "指示受けの画面で撮影室・装置を割り当てます")}

    </section>
  );
}

/** The round of portable studies: the ward's rooms in order, one list to walk. */
export function PortableRound({ rows, onDesk, nowTime }: { rows: RisRow[]; onDesk: OnDesk; nowTime: string }) {
  const me = useMe();
  const deny = useDeny()("ris.exam");
  const round = portableRound(rows);
  const at = { day: 0, time: nowTime };
  const log = (r: RisRow, what: string) => auditLog({ role: me.role, actor: me.name, action: `確定（放射線部：${what}）`, patient: r.name, detail: r.label });
  return (
    <section className="space-y-3 text-[12px]">
      <DenyNote action="ris.exam" />
      <div className={`${card} p-3`}>
        <h3 className="mb-1 font-bold">
          病棟のポータブル回り <span className="nums font-normal text-ink-soft">{round.length}件</span>
        </h3>

        {round.length === 0 ? (
          <p className="text-ink-faint">回るポータブルの指示はありません（受けていないポータブルは指示受けの画面に出ます）。</p>
        ) : (
          <ol className="mt-1 space-y-1">
            {round.map((r, i) => {
              const s = nextStep(r);
              return (
                <li key={r.orderId} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-rule-soft py-1">
                  <b className="nums w-6">{i + 1}</b>
                  <b className="nums w-14">{r.room}</b>
                  <span>{r.name}</span>
                  <span>
                    {r.label}　{r.order.views?.join("＋")}
                  </span>
                  {r.order.when.priority === "至急" && <span className="rounded bg-shu px-1 text-[10px] font-bold text-white">至急</span>}
                  <span className="text-ink-soft">
                    予定 {displayText(r.work?.slot?.time ?? whenText(r.at))}　目的：{r.order.purpose}
                  </span>
                  {r.work?.inRoom && <span className="text-ink-soft">病室 {r.work.inRoom.time}</span>}
                  {r.work?.started && <span className="text-ink-soft">開始 {r.work.started.time}</span>}
                  {(s === "来室" || s === "撮影開始" || s === "撮影終了") && (
                    <button
                      type="button"
                      disabled={!!deny}
                      onClick={() => {
                        if (s === "来室") {
                          onDesk((d) => putWork(d, r, (w) => ({ ...w, inRoom: { ...at, by: me.name } })));
                          log(r, "病室に着いた");
                        } else if (s === "撮影開始") {
                          onDesk((d) => putWork(d, r, (w) => ({ ...w, started: { ...at, by: me.name, via: "手入力" } })));
                          log(r, "撮影開始（手入力）");
                        } else {
                          onDesk((d) => putWork(d, r, (w) => ({ ...w, done: { ...at, by: me.name, via: "手入力" } })));
                          log(r, "撮影済み（手入力）");
                        }
                      }}
                      className={`ml-auto rounded px-2 py-0.5 font-bold text-white disabled:opacity-40 ${s === "撮影終了" ? "bg-wakatake" : "bg-ai"}`}
                    >
                      {s === "来室" ? "病室に着いた" : s}
                    </button>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </section>
  );
}

/* Help migration source (references and dynamic wording):
<p >
          医師が出した画像検査の指示は、まずここで「指示を受ける」（誰が・いつ）。受けると受付済みになり、撮影室・装置と予定の時刻を決める欄が下に開きます。左の○にチェックして「一括受け」でまとめて受けられます（「全チェック」で受けられるものを全部）。{RIS_TAKE_RULES.one}造影・MRI は受けたあと「確認する」で同意・腎機能・アレルギー・内服（造影）や体内金属・ペースメーカー・閉所（MRI）を一覧で見て「確認した」を押します。◀ ▶ で前後の日の指示（その日に出た指示と、その日に予定の指示）を見られます。
        </p>
<p >指示受けのあと、撮影の前に確かめます（指示受け → 指示確認 → 撮影）。値はカルテの記録とオーダから並べるだけで、判断は技師と医師がします。赤はカルテに気になる記録があるもの、黄は記録がなく本人か医師に聞くものです。</p>
<p >「呼出」は外来・救急の患者なら待合の表示に、病棟の患者なら病棟へ搬送を依頼した記録です。来室・撮影開始・撮影終了・画像送信を押した時刻で記録します（撮影条件と線量は「撮影・照射録」か「撮影装置（模擬）」で入れます。模擬装置で始めた検査もここに出ます）。予定から 15分を過ぎて始まっていないものを遅れとします。</p>
<p >{RIS_TAKE_RULES.rooms}</p>
<p >受けたポータブルX線を病室の番号の順に並べます。この順に回り、病室に着いたら「病室に着いた」、撮ったら「撮影終了」を押します。撮影条件は「撮影・照射録」で入れます。</p>
*/

/* ヘルプへ移動した説明:
    造影の確認の項目（同意・腎機能 eGFR 30・ヨードのアレルギー・ビグアナイド系の休薬）は、医師のオーダの確認と同じ指針に基づきます。これらは院内の取り決めで、コードが並べるだけです（AI は使っていません）。
*/
