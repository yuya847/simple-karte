"use client";

import { ClipboardCheck, CookingPot, NotebookPen, Printer, Scale, ShoppingCart, Tag, UtensilsCrossed } from "lucide-react";
import { useState } from "react";
import { auditLog } from "@/lib/audit";
import { addDays, formatShort, type CalendarDate } from "@/lib/dates";
import { MEALS, MEAL_TIMES, TUBE_PRODUCTS, holdTitle, type DietOrder, type Meal } from "@/lib/diet";
import { examAt, type ImagingOrder, type PhysioOrder } from "@/lib/exams";
import { abs } from "@/lib/flowsheet";
import {
  KITCHEN_HOUSE_RULES,
  KITCHEN_RULES,
  KITCHEN_SOURCES,
  LINES,
  conflictsOf,
  dayTotal,
  kenshokuMissing,
  lineOf,
  mealMenu,
  needsOf,
  nutritionCheck,
  specialOf,
  stockMap,
  stockOf,
  subKey,
  ticketType,
  type CheckState,
  type KitchenDesk,
  type LineKey,
  type MealMenu,
} from "@/lib/kitchen";
import type { OrderEntry, Patient } from "@/lib/types";
import { FLOORS, floorOf } from "@/lib/ward";
import { mealCell, mealForm, type MealCell } from "@/lib/ward-meals";
import { Fictional, Sources, SubTabs, usePrintSheet } from "./DeskParts";
import { DenyNote, useDeny, useMe } from "./RoleContext";

type Person = { patient: Patient; room: string; entries: OrderEntry[] };
type Tab = "count" | "menu" | "tickets" | "check" | "order" | "kenshoku";

interface Props {
  /** Every inpatient (all wards). */
  people: Person[];
  diets: DietOrder[];
  desk: KitchenDesk;
  onDesk: (f: (d: KitchenDesk) => KitchenDesk) => void;
  today: CalendarDate;
  nowTime: string;
  /** The tab shown first (for tests). */
  start?: Tab;
}

const examTime = (e: OrderEntry) => examAt(e.order as ImagingOrder | PhysioOrder, abs(e.day, e.time));
const card = "rounded-lg border border-rule bg-sheet";
const field = "rounded border border-rule bg-paper px-1.5 py-0.5 outline-none focus:border-ai";
const TONE: Record<CheckState, string> = { ok: "text-wakatake", over: "font-bold text-shu", under: "font-bold text-yamabuki", info: "text-ink-soft" };
const MARK: Record<CheckState, string> = { ok: "○", over: "▲", under: "▼", info: "・" };
const kg = (g: number) => `${(g / 1000).toFixed(g % 1000 === 0 ? 0 : 1)}kg`;
const floorOfRoom = (room: string) => floorOf(room.replace(/[A-Z]$/, ""));

/**
 * 栄養部門（給食）: the 食数 counted from the diet orders, the week's 献立 of each 食種, the 食札 of each meal
 * (printable), the check of each patient's menu against the doctor's order, the ingredients to order
 * (a mock), and the 検食簿. The 管理栄養士 records; the diet is the doctor's order. No AI.
 */
export function KitchenView(p: Props) {
  const [tab, setTab] = useState<Tab>(p.start ?? "count");
  const nowAbs = abs(0, p.nowTime);
  const dowOf = (d: number) => {
    const c = addDays(p.today, d);
    return new Date(Date.UTC(c.y, c.m - 1, c.d)).getUTCDay();
  };
  const cellsOf = (day: number, meal: Meal) => p.people.map((x) => ({ x, cell: mealCell(x, p.diets, day, meal, nowAbs, examTime) }));
  const missing = kenshokuMissing(p.desk, MEAL_TIMES, nowAbs);
  return (
    <section aria-label="栄養部門（給食）" className="scroll-thin min-h-0 flex-1 overflow-auto bg-paper">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-rule bg-sheet px-5 py-3">
        <h1 className="flex items-center gap-1.5 text-lg font-bold">
          <CookingPot size={18} className="text-ai" />
          栄養部門（給食）
          <Fictional />
        </h1>
        <SubTabs
          label="給食の画面"
          value={tab}
          onChange={setTab}
          tabs={[
            { key: "count", label: "食数", icon: UtensilsCrossed },
            { key: "menu", label: "献立", icon: NotebookPen },
            { key: "tickets", label: "食札", icon: Tag },
            { key: "check", label: "栄養量の確かめ", icon: Scale },
            { key: "order", label: "発注・在庫", icon: ShoppingCart },
            { key: "kenshoku", label: "検食簿", icon: ClipboardCheck, badge: missing.length },
          ]}
        />
      </header>
      <div className="space-y-4 px-5 py-4 text-[13px]">
        {tab === "count" && <Counts {...p} cellsOf={cellsOf} dowOf={dowOf} />}
        {tab === "menu" && <Menus today={p.today} dowOf={dowOf} />}
        {tab === "tickets" && <Tickets {...p} cellsOf={cellsOf} dowOf={dowOf} />}
        {tab === "check" && <Checks {...p} cellsOf={cellsOf} dowOf={dowOf} />}
        {tab === "order" && <Orders {...p} cellsOf={cellsOf} dowOf={dowOf} />}
        {tab === "kenshoku" && <KenshokuBook {...p} missing={missing} />}
        <p className="text-[11px] text-ink-faint">
          {KITCHEN_HOUSE_RULES.values}
          {KITCHEN_HOUSE_RULES.lines}患者・食材・在庫・業者は架空です。食事の内容は医師の食事の指示（食事箋）で決まり、この画面は指示を変えません。
        </p>
        <Sources items={Object.values(KITCHEN_SOURCES)} />
      </div>
    </section>
  );
}

type CellsOf = (day: number, meal: Meal) => { x: Person; cell: MealCell }[];

function DayPick({ value, onChange, today }: { value: number; onChange: (d: number) => void; today: CalendarDate }) {
  return (
    <span className="inline-flex rounded border border-rule text-[12px]">
      {[0, 1].map((d) => (
        <button key={d} type="button" onClick={() => onChange(d)} aria-pressed={value === d} className={`px-2 py-0.5 ${value === d ? "bg-ai text-white" : "text-ink-soft"}`}>
          {d === 0 ? "今日" : "明日"} {formatShort(addDays(today, d))}
        </button>
      ))}
    </span>
  );
}

/** What the kitchen counts a served meal as: the menu line (and staple), or the tube feed. */
function countKey(o: DietOrder | undefined): string {
  if (!o) return "指示なし";
  if (o.kind === "経管栄養") return `経管栄養（${TUBE_PRODUCTS.find((t) => t.code === o.tube?.product)?.name ?? "製品？"}）`;
  return lineOf(o) ?? o.kind;
}

// ---------------------------------------------------------------------------
// 食数
// ---------------------------------------------------------------------------

function Counts({ cellsOf, today, dowOf }: Props & { cellsOf: CellsOf; dowOf: (d: number) => number }) {
  const [day, setDay] = useState(0);
  const [print, sheet] = usePrintSheet();
  const slots = MEALS.map((meal) => {
    const all = cellsOf(day, meal);
    const served = all.filter((c) => c.cell.serve);
    const byKey = new Map<string, { n: number; staples: Map<string, number> }>();
    for (const { cell } of served) {
      const k = countKey(cell.order);
      const e = byKey.get(k) ?? { n: 0, staples: new Map() };
      e.n++;
      // The staple the kitchen serves (低たんぱくご飯・ゼリー粥 for those 食種), not only the one ordered.
      const st = mealMenu(cell.order, dowOf(day), meal)?.staple.kind ?? "";
      if (st) e.staples.set(st, (e.staples.get(st) ?? 0) + 1);
      byKey.set(k, e);
    }
    return {
      meal,
      byKey,
      total: served.length,
      special: served.filter((c) => specialOf(c.cell.order).special).length,
      npo: all.filter((c) => c.cell.order?.kind === "絶食").length,
      held: all.filter((c) => c.cell.order && c.cell.order.kind !== "絶食" && c.cell.holds.length > 0).length,
      none: all.filter((c) => !c.cell.order).length,
      floors: FLOORS.map((f) => served.filter((c) => floorOfRoom(c.x.room) === f.name).length),
    };
  });
  const keys = [...new Set(slots.flatMap((s) => [...s.byKey.keys()]))].sort((a, b) => {
    const i = (k: string) => {
      const j = LINES.findIndex((l) => l.key === k);
      return j < 0 ? 99 : j;
    };
    return i(a) - i(b) || a.localeCompare(b, "ja");
  });
  const table = (
    <table className="nums w-full border-collapse text-[12px]">
      <thead>
        <tr className="border-b border-rule text-left text-ink-soft">
          <th className="px-2 py-1 font-normal">食種（献立の系）</th>
          {slots.map((s) => (
            <th key={s.meal} className="px-2 py-1 font-bold text-ink">
              {s.meal}（{MEAL_TIMES[s.meal]}）
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {keys.map((k) => (
          <tr key={k} className="border-b border-rule-soft align-top">
            <th className="px-2 py-1 text-left font-normal">{k}</th>
            {slots.map((s) => {
              const e = s.byKey.get(k);
              return (
                <td key={s.meal} className="px-2 py-1">
                  {e ? (
                    <>
                      <b>{e.n}</b>
                      {e.staples.size > 0 && <span className="block text-[10px] text-ink-soft">{[...e.staples.entries()].map(([st, n]) => `${st} ${n}`).join("、")}</span>}
                    </>
                  ) : (
                    <span className="text-ink-faint">—</span>
                  )}
                </td>
              );
            })}
          </tr>
        ))}
        {(
          [
            ["配膳する食数（合計）", (s) => s.total, "font-bold"],
            ["うち特別食（特別食加算の対象）", (s) => s.special, "text-ai"],
            ["絶食", (s) => s.npo, "text-yamabuki"],
            ["食止め（検査・外泊・外出・退院）", (s) => s.held, "text-yamabuki"],
            ["指示なし", (s) => s.none, "text-shu"],
          ] as [string, (s: (typeof slots)[number]) => number, string][]
        ).map(([label, n, tone]) => (
          <tr key={label} className="border-t border-rule">
            <th className="px-2 py-1 text-left font-normal text-ink-soft">{label}</th>
            {slots.map((s) => (
              <td key={s.meal} className={`px-2 py-1 ${n(s) ? tone : "text-ink-faint"}`}>
                {n(s)}
              </td>
            ))}
          </tr>
        ))}
        {FLOORS.map((f, i) => (
          <tr key={f.name} className="text-ink-soft">
            <th className="px-2 py-0.5 text-left font-normal">　{f.name}</th>
            {slots.map((s) => (
              <td key={s.meal} className="px-2 py-0.5">
                {s.floors[i]}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <DayPick value={day} onChange={setDay} today={today} />
        <button type="button" onClick={() => print(<div className="p-4"><h1 className="mb-2 text-base font-bold">食数表 {formatShort(addDays(today, day))}（全病棟）</h1>{table}</div>)} className="flex items-center gap-1 rounded border border-rule px-2 py-0.5 text-[12px] text-ink-soft hover:text-ai">
          <Printer size={13} />
          食数表を印刷
        </button>
        <span className="hint text-[11px] text-ink-soft">全病棟の入院患者の食事の指示と、検査・外泊・退院の食止めから、食種ごとにコードで数えます。病棟ごとの患者の一覧は「病棟 › 病棟の食事」にあります。</span>
      </div>
      <div className={`${card} scroll-thin overflow-x-auto`}>{table}</div>
      <p className="text-[11px] text-ink-soft">配膳の前の数です（食事の指示と食止めから数えた予定）。{KITCHEN_RULES.count}</p>
      {sheet}
    </section>
  );
}

// ---------------------------------------------------------------------------
// 献立
// ---------------------------------------------------------------------------

/** A sample order for showing a line's menu (the usual staple; 嚥下調整食 at code 3). */
const SAMPLE: Record<LineKey, Partial<DietOrder>> = {
  常食: { kind: "常食", staple: "米飯" },
  エネルギー調整食: { kind: "治療食", therapeutic: "TD-ENERGY", staple: "米飯" },
  減塩食: { kind: "治療食", therapeutic: "TD-SALT-HEART", saltG: 6, staple: "米飯" },
  腎臓食: { kind: "治療食", therapeutic: "TD-KIDNEY" },
  肝臓食: { kind: "治療食", therapeutic: "TD-LIVER", staple: "米飯" },
  膵臓食: { kind: "治療食", therapeutic: "TD-PANCREAS", staple: "米飯" },
  脂質異常症食: { kind: "治療食", therapeutic: "TD-LIPID", staple: "米飯" },
  胃潰瘍食: { kind: "治療食", therapeutic: "TD-ULCER", staple: "全粥" },
  低残渣食: { kind: "治療食", therapeutic: "TD-LOWRESIDUE", staple: "全粥" },
  嚥下調整食: { kind: "嚥下調整食", dysphagia: "3" },
  流動食: { kind: "流動食" },
};
const sampleOrder = (k: LineKey): DietOrder => ({ id: "sample", patientId: "", from: { day: 0, meal: "朝" }, by: "", at: { day: 0, time: "00:00" }, ...SAMPLE[k] }) as DietOrder;

function Menus({ today, dowOf }: { today: CalendarDate; dowOf: (d: number) => number }) {
  const [line, setLine] = useState<LineKey>("常食");
  const o = sampleOrder(line);
  const rule = LINES.find((l) => l.key === line)!;
  const sp = specialOf(o);
  const days = [0, 1, 2, 3, 4, 5, 6];
  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-center gap-1 text-[12px]">
        {LINES.map((l) => (
          <button key={l.key} type="button" onClick={() => setLine(l.key)} aria-pressed={line === l.key} className={`rounded border px-2 py-0.5 ${line === l.key ? "border-ai bg-ai-soft font-bold text-ai" : "border-rule text-ink-soft"}`}>
            {l.key}
          </button>
        ))}
      </div>
      <p className="text-[12px]">
        <b>{line}</b>：{rule.how}
        {sp.special && <span className="ml-2 rounded bg-ai-soft px-1.5 text-[11px] font-bold text-ai">特別食の献立表（{sp.note}）</span>}
        {rule.fitEnergy && <span className="ml-2 text-ink-soft">主食は通常量で表示。患者ごとの量は指示のエネルギーで変わります（{KITCHEN_HOUSE_RULES.staple}）</span>}
      </p>
      <div className={`${card} scroll-thin overflow-x-auto`}>
        <table className="w-full border-collapse text-[11px]">
          <thead>
            <tr className="border-b border-rule text-left text-ink-soft">
              <th className="px-2 py-1 font-normal" />
              {days.map((d) => (
                <th key={d} className={`min-w-36 px-2 py-1 ${d === 0 ? "text-ai" : ""}`}>
                  {formatShort(addDays(today, d))}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {MEALS.map((m) => (
              <tr key={m} className="border-b border-rule-soft align-top">
                <th className="px-2 py-1 text-left">{m}</th>
                {days.map((d) => {
                  const menu = mealMenu(o, dowOf(d), m)!;
                  return (
                    <td key={d} className="px-2 py-1">
                      {menu.dishes.map((x) => (
                        <span key={x.id} className="block">
                          {x.name}
                        </span>
                      ))}
                      <span className="nums block text-[10px] text-ink-soft">
                        {menu.total.kcal}kcal・たんぱく質{menu.total.protein}g・食塩{menu.total.salt}g
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
            <tr className="nums">
              <th className="px-2 py-1 text-left">1日</th>
              {days.map((d) => {
                const t = dayTotal(o, dowOf(d))!;
                return (
                  <td key={d} className="px-2 py-1 font-bold">
                    {t.kcal}kcal
                    <span className="block font-normal text-ink-soft">
                      たんぱく質{t.protein}g・食塩{t.salt}g
                    </span>
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-ink-soft">{KITCHEN_RULES.menuNeeded}</p>
    </section>
  );
}

// ---------------------------------------------------------------------------
// 食札
// ---------------------------------------------------------------------------

interface Ticket {
  x: Person;
  cell: MealCell;
  menu: MealMenu | null;
}

function Tickets(p: Props & { cellsOf: CellsOf; dowOf: (d: number) => number }) {
  const { desk, onDesk, today, nowTime } = p;
  const me = useMe();
  const locked = useDeny()("kitchen");
  const [day, setDay] = useState(1);
  const [meal, setMeal] = useState<Meal>("朝");
  const [floor, setFloor] = useState<string>(FLOORS[0].name);
  const [onlyFlags, setOnlyFlags] = useState(false);
  const [print, sheet] = usePrintSheet();
  const tickets: Ticket[] = p
    .cellsOf(day, meal)
    .filter(({ x }) => floor === "全病棟" || floorOfRoom(x.room) === floor)
    .map(({ x, cell }) => ({ x, cell, menu: cell.serve ? mealMenu(cell.order, p.dowOf(day), meal) : null }))
    .sort((a, b) => a.x.room.localeCompare(b.x.room, "ja"));
  const flagged = (t: Ticket) => conflictsOf(t.menu, t.x.patient.allergies, desk.bans[t.x.patient.id] ?? []).length > 0;
  const shown = onlyFlags ? tickets.filter(flagged) : tickets;
  const log = (t: Ticket, action: string, detail: string) => auditLog({ role: me.role, actor: me.name, action, patient: t.x.patient.name, detail });
  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-[12px]">
        <DayPick value={day} onChange={setDay} today={today} />
        <span className="inline-flex rounded border border-rule">
          {MEALS.map((m) => (
            <button key={m} type="button" onClick={() => setMeal(m)} aria-pressed={meal === m} className={`px-2 py-0.5 ${meal === m ? "bg-ai text-white" : "text-ink-soft"}`}>
              {m}
            </button>
          ))}
        </span>
        <select value={floor} onChange={(e) => setFloor(e.target.value)} aria-label="病棟" className={field}>
          {[...FLOORS.map((f) => f.name), "全病棟"].map((f) => (
            <option key={f}>{f}</option>
          ))}
        </select>
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={onlyFlags} onChange={(e) => setOnlyFlags(e.target.checked)} />
          アレルギー・禁止食品に当たる料理がある食札だけ（{tickets.filter(flagged).length}）
        </label>
        <button
          type="button"
          onClick={() =>
            print(
              <div className="grid grid-cols-2 gap-2 p-2">
                {shown.map((t) => (
                  <TicketCard key={t.x.patient.id} t={t} day={day} meal={meal} desk={desk} printing />
                ))}
              </div>,
            )
          }
          className="ml-auto flex items-center gap-1 rounded border border-rule px-2 py-0.5 text-ink-soft hover:text-ai"
        >
          <Printer size={13} />
          食札を印刷（{shown.length}枚）
        </button>
      </div>
      <p className="hint text-[11px] text-ink-soft">食札は食事の指示からコードで作ります。献立にアレルギー（カルテのプロファイル）や禁止食品に当たる料理があれば印が付きます。代わりの料理と禁止食品は管理栄養士が記録します。</p>
      <DenyNote action="kitchen" />
      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {shown.map((t) => (
          <TicketCard
            key={t.x.patient.id}
            t={t}
            day={day}
            meal={meal}
            desk={desk}
            locked={!!locked}
            onSub={(dishId, dish, text) => {
              log(t, "確定（食札：代わりの料理）", `${dish} → ${text}`);
              onDesk((d) => ({ ...d, subs: { ...d.subs, [subKey(t.x.patient.id, day, meal, dishId)]: { text, by: me.name, time: nowTime } } }));
            }}
            onBan={(food, why) => {
              log(t, "確定（禁止食品を登録）", `${food}（${why}）`);
              onDesk((d) => ({ ...d, bans: { ...d.bans, [t.x.patient.id]: [...(d.bans[t.x.patient.id] ?? []), { food, why, by: me.name, at: { day: 0, time: nowTime } }] } }));
            }}
            onUnban={(i) => {
              const b = (desk.bans[t.x.patient.id] ?? [])[i];
              log(t, "確定（禁止食品を外す）", b?.food ?? "");
              onDesk((d) => ({ ...d, bans: { ...d.bans, [t.x.patient.id]: (d.bans[t.x.patient.id] ?? []).filter((_, j) => j !== i) } }));
            }}
          />
        ))}
        {shown.length === 0 && <p className="text-ink-faint">この病棟・食事の食札はありません。</p>}
      </div>
      {sheet}
    </section>
  );
}

function TicketCard({
  t,
  day,
  meal,
  desk,
  printing,
  locked,
  onSub,
  onBan,
  onUnban,
}: {
  t: Ticket;
  day: number;
  meal: Meal;
  desk: KitchenDesk;
  printing?: boolean;
  locked?: boolean;
  onSub?: (dishId: string, dish: string, text: string) => void;
  onBan?: (food: string, why: string) => void;
  onUnban?: (i: number) => void;
}) {
  const [sub, setSub] = useState<Record<string, string>>({});
  const [ban, setBan] = useState({ food: "", why: "" });
  const o = t.cell.order;
  const bans = desk.bans[t.x.patient.id] ?? [];
  const conflicts = conflictsOf(t.menu, t.x.patient.allergies, bans);
  const sp = specialOf(o);
  const head = !o ? "指示なし" : o.kind === "絶食" ? `絶食${o.npoReason ? `（${o.npoReason}）` : ""}` : t.cell.holds.length ? `${holdTitle(t.cell.holds)}：${t.cell.holds.map((h) => h.label).join("、")}` : ticketType(o);
  const off = !t.cell.serve;
  return (
    <article className={`${printing ? "break-inside-avoid border border-ink p-2" : `${card} p-2`} text-[12px]`}>
      <header className="flex flex-wrap items-baseline gap-x-2">
        <b className="nums">{t.x.room}</b>
        <b className="text-[14px]">{t.x.patient.name}</b>
        <span className="text-[10px] text-ink-soft">{t.x.patient.kana}</span>
        <span className="ml-auto text-[11px] text-ink-soft">
          {day === 0 ? "今日" : "明日"}の{meal}
        </span>
      </header>
      <p className={`mt-0.5 text-[13px] font-bold ${off ? "text-yamabuki" : ""}`}>
        {head}
        {sp.special && !off && <span className="ml-1 rounded border border-ai px-1 text-[10px] text-ai">特別食</span>}
      </p>
      {!off && o && <p className="text-ink-soft">{[mealForm(o), o.kind === "嚥下調整食" ? `嚥下調整食 コード${o.dysphagia ?? "?"}` : ""].filter(Boolean).join("・") || "—"}</p>}
      {o?.comment && <p>指示のコメント：{o.comment}</p>}
      <p className={t.x.patient.allergies.length ? "font-bold text-shu" : "text-ink-soft"}>アレルギー（カルテ）：{t.x.patient.allergies.join("、") || "なし"}</p>
      <div className={bans.length ? "font-bold text-shu" : "text-ink-soft"}>
        禁止食品：
        {bans.length === 0 && "なし"}
        {bans.map((b, i) => (
          <span key={i} className="mr-2 inline-block">
            {b.food}
            <span className="font-normal text-ink-soft">（{b.why}）</span>
            {!printing && onUnban && (
              <button type="button" disabled={locked} onClick={() => onUnban(i)} className="ml-1 text-[10px] font-normal text-ink-faint underline disabled:opacity-40">
                外す
              </button>
            )}
          </span>
        ))}
      </div>
      {t.menu && (
        <ul className="mt-1 border-t border-rule-soft pt-1">
          {t.menu.dishes.map((x) => {
            const c = conflicts.filter((y) => y.dishId === x.id);
            const s = desk.subs[subKey(t.x.patient.id, day, meal, x.id)];
            return (
              <li key={x.id} className={c.length ? "text-shu" : ""}>
                {s ? <s className="text-ink-faint">{x.name}</s> : x.name}
                {s && <b className="ml-1 text-ink">→ {s.text}</b>}
                {c.length > 0 && <span className="ml-1 text-[10px] font-bold">（{c.map((y) => `${y.kind}「${y.against}」：${y.what.join("・")}`).join("、")}）</span>}
                {c.length > 0 && !s && !printing && onSub && (
                  <span className="ml-1 inline-flex gap-1">
                    <input value={sub[x.id] ?? ""} onChange={(e) => setSub({ ...sub, [x.id]: e.target.value })} placeholder="代わりの料理" aria-label={`${x.name}の代わり`} className={`${field} w-28 text-[11px]`} disabled={locked} />
                    <button type="button" disabled={locked || !(sub[x.id] ?? "").trim()} onClick={() => onSub(x.id, x.name, sub[x.id].trim())} className="rounded bg-ai px-1.5 text-[11px] text-white disabled:opacity-40">
                      記録
                    </button>
                  </span>
                )}
              </li>
            );
          })}
          <li className="nums text-[10px] text-ink-soft">
            {t.menu.total.kcal}kcal・たんぱく質{t.menu.total.protein}g・食塩{t.menu.total.salt}g
          </li>
        </ul>
      )}
      {!printing && onBan && (
        <p className="mt-1 flex flex-wrap items-center gap-1 border-t border-rule-soft pt-1">
          <input value={ban.food} onChange={(e) => setBan({ ...ban, food: e.target.value })} placeholder="禁止食品（例：納豆）" aria-label="禁止食品" className={`${field} w-28 text-[11px]`} disabled={locked} />
          <input value={ban.why} onChange={(e) => setBan({ ...ban, why: e.target.value })} placeholder="理由・誰から（例：本人の申告）" aria-label="禁止食品の理由" className={`${field} min-w-0 flex-1 text-[11px]`} disabled={locked} />
          <button
            type="button"
            disabled={locked || !ban.food.trim() || !ban.why.trim()}
            onClick={() => {
              onBan(ban.food.trim(), ban.why.trim());
              setBan({ food: "", why: "" });
            }}
            className="rounded border border-ai px-1.5 text-[11px] text-ai disabled:opacity-40"
          >
            禁止食品を足す
          </button>
        </p>
      )}
    </article>
  );
}

// ---------------------------------------------------------------------------
// 栄養量の確かめ
// ---------------------------------------------------------------------------

function Checks(p: Props & { cellsOf: CellsOf; dowOf: (d: number) => number }) {
  const [day, setDay] = useState(0);
  const [onlyOff, setOnlyOff] = useState(false);
  // The order of the patient at 昼 of the day (the order's values are for the day).
  const rows = p
    .cellsOf(day, "昼")
    .filter(({ cell }) => cell.order && cell.order.kind !== "絶食")
    .map(({ x, cell }) => {
      const o = cell.order!;
      const tube = o.kind === "経管栄養" ? TUBE_PRODUCTS.find((t) => t.code === o.tube?.product) : undefined;
      return { x, o, check: nutritionCheck(o, x.patient, p.dowOf(day)), tubeKcal: tube && o.tube ? Math.round(tube.kcalPerMl * o.tube.mlPerMeal * 3) : null };
    })
    .sort((a, b) => a.x.room.localeCompare(b.x.room, "ja"));
  const off = (r: (typeof rows)[number]) => r.check.rows.some((x) => x.state === "over" || x.state === "under");
  const shown = onlyOff ? rows.filter(off) : rows;
  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-[12px]">
        <DayPick value={day} onChange={setDay} today={p.today} />
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={onlyOff} onChange={(e) => setOnlyOff(e.target.checked)} />
          合わないものだけ（{rows.filter(off).length}人）
        </label>
      </div>
      <p className="hint text-[11px] text-ink-soft">患者ごとに、その日の3食の献立（食種の約束食事箋で展開し、主食の量を合わせたもの）の合計を、医師の食事の指示と比べます。常食の患者は日本人の食事摂取基準（2025年版）の値と比べます。合わないときに献立を直すかは管理栄養士が、指示を変えるかは医師が決めます。</p>
      <ul className="space-y-0.5 text-[11px] text-ink-soft">
        <li>{KITCHEN_HOUSE_RULES.tolerance}</li>
        <li>{KITCHEN_RULES.saltSpecial}</li>
        <li>{KITCHEN_RULES.general}食事摂取基準の推定エネルギー必要量は体位と身体活動レベルで変わるため、ここでは比べません。</li>
      </ul>
      <table className={`${card} w-full border-collapse text-[12px]`}>
        <thead>
          <tr className="border-b border-rule text-left text-ink-soft">
            <th className="px-2 py-1 font-normal">患者</th>
            <th className="px-2 py-1 font-normal">食事の指示</th>
            <th className="px-2 py-1 font-normal">献立の1日量</th>
            <th className="px-2 py-1 font-normal">比べたもの</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((r) => (
            <tr key={r.x.patient.id} className="border-b border-rule-soft align-top">
              <td className="px-2 py-1">
                <span className="nums">{r.x.room}</span>　{r.x.patient.name}
                <span className="block text-[10px] text-ink-soft">
                  {r.x.patient.sex}・{r.x.patient.age}歳
                </span>
              </td>
              <td className="px-2 py-1">{r.o.kind === "経管栄養" ? "経管栄養" : ticketType(r.o)}</td>
              <td className="nums px-2 py-1">{r.check.total ? `${r.check.total.kcal}kcal・たんぱく質${r.check.total.protein}g・食塩${r.check.total.salt}g` : r.tubeKcal !== null ? `${r.tubeKcal}kcal（製品の濃度×1回量×3回）` : "献立なし"}</td>
              <td className="px-2 py-1">
                {r.check.rows.length === 0 && <span className="text-ink-faint">比べる指示の値がありません</span>}
                {r.check.rows.map((c, i) => (
                  <span key={i} className={`block ${TONE[c.state]}`}>
                    {MARK[c.state]} {c.label} {c.menu}
                    {c.unit}／{c.ref}：{c.text}
                    <span className="ml-1 text-[10px] font-normal text-ink-faint">{c.from === "order" ? "（食事の指示）" : c.from === "special" ? "（特別食の条件）" : "（食事摂取基準）"}</span>
                  </span>
                ))}
              </td>
            </tr>
          ))}
          {shown.length === 0 && (
            <tr>
              <td colSpan={4} className="px-2 py-3 text-center text-ink-faint">
                該当する患者はいません。
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );
}

// ---------------------------------------------------------------------------
// 発注・在庫
// ---------------------------------------------------------------------------

function Orders(p: Props & { cellsOf: CellsOf; dowOf: (d: number) => number }) {
  const { desk, onDesk, nowTime } = p;
  const me = useMe();
  const locked = useDeny()("kitchen");
  const [edit, setEdit] = useState<Record<string, string>>({});
  const DAY = 1;
  const menus = MEALS.flatMap((m) => p.cellsOf(DAY, m).flatMap(({ cell }) => (cell.serve ? [mealMenu(cell.order, p.dowOf(DAY), m)] : []))).filter((m): m is MealMenu => !!m);
  const needs = needsOf(menus, stockMap(desk));
  const pending = (item: string) => desk.orders.filter((o) => !o.received).reduce((n, o) => n + (o.lines.find((l) => l.item === item)?.g ?? 0), 0);
  const toOrder = needs.map((n) => ({ ...n, pending: pending(n.item), qty: n.short > pending(n.item) ? Math.ceil((n.short - pending(n.item)) / n.pack) * n.pack : 0 }));
  const lines = toOrder.filter((n) => n.qty > 0);
  const place = () => {
    const id = `po-${desk.orders.length + 1}-${nowTime.replace(":", "")}`;
    auditLog({ role: me.role, actor: me.name, action: "確定（食材の発注・模擬）", detail: lines.map((l) => `${l.item} ${kg(l.qty)}`).join("、") });
    onDesk((d) => ({ ...d, orders: [...d.orders, { id, forDay: DAY, lines: lines.map((l) => ({ item: l.item, g: l.qty })), by: me.name, at: { day: 0, time: nowTime } }] }));
  };
  const receive = (id: string) => {
    const po = desk.orders.find((o) => o.id === id);
    if (!po) return;
    auditLog({ role: me.role, actor: me.name, action: "確定（食材の入庫・模擬）", detail: po.lines.map((l) => `${l.item} ${kg(l.g)}`).join("、") });
    onDesk((d) => ({
      ...d,
      stock: { ...d.stock, ...Object.fromEntries(po.lines.map((l) => [l.item, stockOf(d, l.item) + l.g])) },
      orders: d.orders.map((o) => (o.id === id ? { ...o, received: { day: 0, time: nowTime, by: me.name } } : o)),
    }));
  };
  const setStock = (item: string) => {
    const v = Number(edit[item]);
    if (!Number.isFinite(v) || v < 0) return;
    auditLog({ role: me.role, actor: me.name, action: "確定（在庫を直す）", detail: `${item} ${kg(stockOf(desk, item))} → ${v}kg` });
    onDesk((d) => ({ ...d, stock: { ...d.stock, [item]: Math.round(v * 1000) } }));
    setEdit({ ...edit, [item]: "" });
  };
  return (
    <section className="space-y-2">
      <p className="text-[12px]">
        <b>明日（{formatShort(addDays(p.today, DAY))}）の3食</b>に要る食材（{menus.length}食分）。献立の材料×配膳する食数から、在庫と発注済み（入庫待ち）を引いた不足を、業者の荷姿（パック）の単位に切り上げます。
      </p>
      <p className="text-[11px] font-bold text-yamabuki">模擬：業者にはつながっていません。発注の記録と入庫は、この画面の中だけで動きます。</p>
      <DenyNote action="kitchen" />
      <div className={`${card} scroll-thin overflow-x-auto`}>
        <table className="nums w-full border-collapse text-[12px]">
          <thead>
            <tr className="border-b border-rule text-left text-ink-soft">
              <th className="px-2 py-1 font-normal">食材</th>
              <th className="px-2 py-1 font-normal">必要量</th>
              <th className="px-2 py-1 font-normal">在庫</th>
              <th className="px-2 py-1 font-normal">発注済み（入庫待ち）</th>
              <th className="px-2 py-1 font-normal">発注する量</th>
              <th className="px-2 py-1 font-normal">在庫を直す（棚卸し）</th>
            </tr>
          </thead>
          <tbody>
            {toOrder.map((n) => (
              <tr key={n.item} className={`border-b border-rule-soft ${n.qty > 0 ? "text-shu" : ""}`}>
                <td className="px-2 py-1">{n.item}</td>
                <td className="px-2 py-1">{kg(n.need)}</td>
                <td className="px-2 py-1">{kg(n.stock)}</td>
                <td className="px-2 py-1">{n.pending ? kg(n.pending) : "—"}</td>
                <td className="px-2 py-1 font-bold">{n.qty ? `${kg(n.qty)}（${n.qty / n.pack}パック × ${kg(n.pack)}）` : "—"}</td>
                <td className="px-2 py-1">
                  <input inputMode="decimal" value={edit[n.item] ?? ""} onChange={(e) => setEdit({ ...edit, [n.item]: e.target.value })} placeholder="kg" aria-label={`${n.item}の在庫（kg）`} className={`${field} w-16 text-right`} disabled={!!locked} />
                  <button type="button" disabled={!!locked || !(edit[n.item] ?? "").trim()} onClick={() => setStock(n.item)} className="ml-1 rounded border border-rule px-1.5 text-[11px] disabled:opacity-40">
                    直す
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button type="button" disabled={!!locked || lines.length === 0} onClick={place} className="rounded bg-ai px-3 py-0.5 font-bold text-white disabled:opacity-40">
        不足の {lines.length} 品目を発注する（模擬）
      </button>
      <h2 className="pt-2 text-xs font-bold text-ink-soft">発注の記録</h2>
      {desk.orders.length === 0 && <p className="text-ink-faint">まだありません。</p>}
      <ul className="space-y-1">
        {desk.orders.map((o) => (
          <li key={o.id} className={`${card} px-3 py-1.5 text-[12px]`}>
            <span className="nums">{o.at.time}</span> {o.by}：{o.lines.map((l) => `${l.item} ${kg(l.g)}`).join("、")}
            {o.received ? (
              <span className="ml-2 text-wakatake">
                入庫 {o.received.time} {o.received.by}
              </span>
            ) : (
              <button type="button" disabled={!!locked} onClick={() => receive(o.id)} className="ml-2 rounded border border-wakatake px-1.5 text-[11px] text-wakatake disabled:opacity-40">
                入庫した（在庫に足す）
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------------------
// 検食簿
// ---------------------------------------------------------------------------

function KenshokuBook({ desk, onDesk, nowTime, today, missing }: Props & { missing: Meal[] }) {
  const me = useMe();
  const locked = useDeny()("kitchen.kenshoku");
  const [text, setText] = useState<Record<string, string>>({});
  return (
    <section className="space-y-2">
      <p className="text-[12px]">今日（{formatShort(today)}）の検食簿。{KITCHEN_RULES.kenshoku}</p>
      <DenyNote action="kitchen.kenshoku" />
      {MEALS.map((m) => {
        const k = `0|${m}`;
        const rec = desk.kenshoku[k];
        return (
          <article key={m} className={`${card} p-3 text-[12px] ${missing.includes(m) ? "border-shu" : ""}`}>
            <header className="flex items-baseline gap-2">
              <b>{m}</b>
              <span className="nums text-ink-soft">配膳 {MEAL_TIMES[m]}</span>
              {missing.includes(m) && <span className="font-bold text-shu">配膳の時刻を過ぎて、検食の記録がありません</span>}
            </header>
            {rec ? (
              <p>
                {rec.text}
                <span className="ml-2 text-ink-soft">
                  {rec.time} {rec.by}（{rec.role}）
                </span>
              </p>
            ) : (
              <p className="mt-1 flex gap-1">
                <input value={text[k] ?? ""} onChange={(e) => setText({ ...text, [k]: e.target.value })} placeholder="所見（味・温度・量・盛り付け・異物の有無など）" aria-label={`${m}の検食の所見`} className={`${field} min-w-0 flex-1`} disabled={!!locked} />
                <button
                  type="button"
                  disabled={!!locked || !(text[k] ?? "").trim()}
                  onClick={() => {
                    auditLog({ role: me.role, actor: me.name, action: "確定（検食簿）", detail: `${m}：${text[k].trim()}` });
                    onDesk((d) => ({ ...d, kenshoku: { ...d.kenshoku, [k]: { by: me.name, role: me.role, time: nowTime, text: text[k].trim() } } }));
                  }}
                  className="rounded bg-ai px-2 font-bold text-white disabled:opacity-40"
                >
                  記録
                </button>
              </p>
            )}
          </article>
        );
      })}
    </section>
  );
}
