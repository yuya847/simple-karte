// 障害時の参照 (BCP): when the chart cannot be used (システム障害・サイバー攻撃・災害), the ward works on paper from
// what was printed or saved beforehand. This gathers, by code, each patient's essentials as they stand now —
// 氏名・アレルギー・感染症・有効な指示・今日の与薬予定・直近のバイタル・検査 — into one HTML page that is
// printed, saved as a file, and kept in this browser so that /downtime/index.html can show it offline.
//
// The guideline asks for alternative means such as paper operation (紙での運用等の代替手段) and for BCP
// procedures; what this page holds and when it is made are the fictional hospital's rules (架空の病院の取り決め).

import { addDays, formatShort, type CalendarDate } from "./dates";
import { abs } from "./flowsheet";
import { orderLines } from "./format";
import { marState, type AdminRecord } from "./mar";
import { ANALYTES, rangeFor } from "./master";
import { ageSex } from "./person";
import type { OrderEntry, Patient } from "./types";
import { vitalLine } from "./vitals-text";
import { buildWorksheet, shiftWindow, type WorkPatient } from "./worksheet";

export const DOWNTIME_SOURCES = [
  {
    label: "厚生労働省「医療情報システムの安全管理に関するガイドライン 第7.0版 システム運用編」11 遵守事項①(4)（紙での運用等の代替手段）・11.2 非常時における対応・18.1",
    url: "https://www.mhlw.go.jp/content/10808000/001716295.pdf",
  },
  {
    label: "厚生労働省「医療情報システムの安全管理に関するガイドライン 第7.0版 企画管理編」11 非常時（災害、サイバー攻撃、システム障害）対応と BCP 策定（表11-1〜11-3）",
    url: "https://www.mhlw.go.jp/content/10808000/001716292.pdf",
  },
  {
    label: "厚生労働省「医療情報システム部門等におけるBCPのひな形」（令和6年6月）1.3.2 想定する事象・2.1.5 リスク評価・代替運用・3.4.1",
    url: "https://www.mhlw.go.jp/content/10808000/001261302.pdf",
  },
  {
    label: "厚生労働省「サイバー攻撃を想定した事業継続計画（BCP）策定の確認表」（令和6年6月）",
    url: "https://www.mhlw.go.jp/content/10808000/001261299.pdf",
  },
];

/** Where the snapshot is kept in this browser (read by /downtime/index.html). */
export const DOWNTIME_STORE = "simple-karte:downtime";
export const DOWNTIME_PAGE = "/downtime/index.html";

export interface DowntimeDose {
  /** "08:00", or "必要時" / "時刻の指定なし". */
  time: string;
  kind: string;
  main: string;
  detail: string;
  /** 実施・未実施・予定… from the 与薬 records. */
  state: string;
}

export interface DowntimePatient {
  id: string;
  room: string;
  name: string;
  kana: string;
  ageSex: string;
  department: string;
  attending: string;
  allergies: string[];
  infections: string[];
  cautions: string[];
  codeStatus?: string;
  diet?: string;
  blood?: string;
  /** 閲覧制限 and not on the care team: only the safety essentials are written. */
  limited: boolean;
  orders: { kind: string; main: string; detail: string }[];
  doses: DowntimeDose[];
  vitals: string | null;
  labs: { when: string; items: string[] } | null;
}

export interface DowntimeSnapshot {
  version: 1;
  /** "2026/11/4 10:32" (Japan). */
  madeAt: string;
  by: string;
  place: string;
  patients: DowntimePatient[];
}

const KIND: Record<string, string> = { injection: "注射", prescription: "内服", procedure: "処置", lab: "検体検査", imaging: "画像検査", physio: "生理検査", diet: "食事" };
const kindOf = (o: OrderEntry["order"]) => KIND[o.type] ?? "その他";

/** The latest blood draw: each value with its unit and H/L against the reference range. */
export function latestLabs(p: Patient, today: CalendarDate): DowntimePatient["labs"] {
  const last = [...p.labs].sort((a, b) => a.day - b.day || a.time.localeCompare(b.time)).at(-1);
  if (!last) return null;
  const items = Object.entries(last.values).map(([code, v]) => {
    const a = ANALYTES.find((x) => x.code === code);
    if (!a) return `${code} ${v}`;
    const r = rangeFor(a, p.sex === "女" ? "女" : "男");
    const flag = r.high !== undefined && v > r.high ? " H" : r.low !== undefined && v < r.low ? " L" : "";
    return `${a.code} ${v}${a.unit ? ` ${a.unit}` : ""}${flag}`;
  });
  return { when: `${formatShort(addDays(today, last.day))} ${last.time}`, items };
}

const hhmm = (min: number) => `${String(Math.floor((((min % 1440) + 1440) % 1440) / 60)).padStart(2, "0")}:${String((((min % 1440) + 1440) % 1440) % 60).padStart(2, "0")}`;

/** One patient's essentials as they stand now (the orders, doses and records given). */
export function downtimePatient(w: WorkPatient, today: CalendarDate, nowAbs: number, mar: Record<string, AdminRecord>, sessionStart: number, limited: boolean): DowntimePatient {
  const p = w.patient;
  const base = {
    id: p.id,
    room: w.room,
    name: p.name,
    kana: p.kana,
    ageSex: ageSex(p),
    department: p.department,
    attending: p.attending,
    allergies: p.allergies,
    infections: p.infections,
    cautions: p.cautions,
    ...(p.codeStatus ? { codeStatus: p.codeStatus } : {}),
    ...(p.blood ? { blood: `${p.blood.abo}型 Rh${p.blood.rh === "+" ? "(+)" : "(−)"}` } : {}),
    ...(p.dietNow ? { diet: p.dietNow } : {}),
    limited,
  };
  if (limited) return { ...base, orders: [], doses: [], vitals: null, labs: null };
  const orders = w.entries
    .filter((e) => e.status === "有効")
    .map((e) => {
      const { main, detail } = orderLines(e.order, today);
      return { kind: kindOf(e.order), main, detail };
    });
  const { lo, hi } = shiftWindow("all", 0);
  const sheet = buildWorksheet([w], lo, hi, nowAbs);
  const doses: DowntimeDose[] = [
    ...sheet.timed.filter((i) => i.kind === "注射" || i.kind === "内服").map((i) => ({ time: hhmm(i.at!), kind: i.kind, main: i.main, detail: i.detail, state: marState(i, mar, sessionStart, nowAbs) })),
    ...sheet.untimed.filter((i) => i.kind === "注射" || i.kind === "内服").map((i) => ({ time: i.detail.startsWith("頓用") ? "必要時" : "時刻の指定なし", kind: i.kind, main: i.main, detail: i.detail, state: "—" })),
  ];
  const v = [...p.vitals].sort((a, b) => abs(a.day, a.time) - abs(b.day, b.time)).at(-1);
  return { ...base, orders, doses, vitals: v ? vitalLine(v, today) : null, labs: latestLabs(p, today) };
}

export function downtimeSnapshot(people: WorkPatient[], opts: { today: CalendarDate; nowAbs: number; mar: Record<string, AdminRecord>; sessionStart: number; limited: (id: string) => boolean; by: string; place: string; madeAt: string }): DowntimeSnapshot {
  const patients = [...people].sort((a, b) => a.room.localeCompare(b.room)).map((w) => downtimePatient(w, opts.today, opts.nowAbs, opts.mar, opts.sessionStart, opts.limited(w.patient.id)));
  return { version: 1, madeAt: opts.madeAt, by: opts.by, place: opts.place, patients };
}

// ---------------------------------------------------------------------------
// The page: every value is escaped; there is no script in it.
// ---------------------------------------------------------------------------

export const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const list = (xs: string[], none = "なし") => (xs.length ? xs.map(esc).join("、") : none);

function patientHtml(p: DowntimePatient): string {
  const head = `<h2>${esc(p.room)}　${esc(p.name)}<small>（${esc(p.kana)}）${esc(p.ageSex)}　ID ${esc(p.id)}　${esc(p.department)}　主治医 ${esc(p.attending)}</small></h2>`;
  const alert = [
    `<b>アレルギー</b>：${list(p.allergies)}`,
    `<b>感染症</b>：${list(p.infections)}`,
    ...(p.codeStatus ? [`<b>救命処置</b>：${esc(p.codeStatus)}`] : []),
    ...(p.blood ? [`<b>血液型</b>：${esc(p.blood)}`] : []),
    ...(p.diet ? [`<b>食事</b>：${esc(p.diet)}`] : []),
    ...(p.cautions.length ? [`<b>注意</b>：${list(p.cautions)}`] : []),
  ].join("　");
  if (p.limited) return `<section class="pt">${head}<p class="alert">${alert}</p><p class="note">閲覧制限のある患者です。ここには安全に関わることだけを載せています。指示と記録は担当のチームに確かめてください。</p></section>`;
  const orders = p.orders.length ? `<ul>${p.orders.map((o) => `<li><b>${esc(o.kind)}</b>　${esc(o.main)}${o.detail ? `<small>　${esc(o.detail)}</small>` : ""}</li>`).join("")}</ul>` : `<p class="none">有効な指示はありません。</p>`;
  const doses = p.doses.length
    ? `<table><thead><tr><th>時刻</th><th>種類</th><th>内容</th><th>記録</th><th>実施（手書き）</th></tr></thead><tbody>${p.doses.map((d) => `<tr><td>${esc(d.time)}</td><td>${esc(d.kind)}</td><td>${esc(d.main)}<small>　${esc(d.detail)}</small></td><td>${esc(d.state)}</td><td class="blank"></td></tr>`).join("")}</tbody></table>`
    : `<p class="none">今日の与薬の予定はありません。</p>`;
  const vitals = p.vitals ? `<p>${esc(p.vitals)}</p>` : `<p class="none">記録がありません。</p>`;
  const labs = p.labs ? `<p><b>${esc(p.labs.when)}</b>　${p.labs.items.map(esc).join("　")}</p>` : `<p class="none">記録がありません。</p>`;
  return `<section class="pt">${head}<p class="alert">${alert}</p><h3>有効な指示</h3>${orders}<h3>今日の与薬予定</h3>${doses}<h3>直近のバイタル</h3>${vitals}<h3>直近の検査</h3>${labs}</section>`;
}

/** The body of the page (escaped HTML, no script). */
export function downtimeBody(s: DowntimeSnapshot): string {
  return [
    `<header class="dt-head"><h1>障害時の参照　${esc(s.place)}</h1>`,
    `<p><b>${esc(s.madeAt)} 現在</b>　${s.patients.length}人　作成 ${esc(s.by)}　架空総合病院</p>`,
    `<p class="note">電子カルテが使えないときの参照用です。作った時刻より後の指示・実施は載っていません。紙の運用に切り替えたら、指示と実施を紙に書き、使えるようになってから入力します。</p></header>`,
    ...s.patients.map(patientHtml),
  ].join("");
}

export const DOWNTIME_CSS = `
.dt-sheet{font-family:"BIZ UDPGothic","Hiragino Sans","Yu Gothic",sans-serif;color:#26221c;font-size:10.5pt;line-height:1.45}
.dt-sheet h1{font-size:15pt;margin:0 0 2px}
.dt-sheet h2{font-size:12pt;margin:0 0 3px;border-bottom:1px solid #26221c;padding-bottom:2px}
.dt-sheet h2 small{font-size:9.5pt;font-weight:normal}
.dt-sheet h3{font-size:10pt;margin:6px 0 2px;color:#5f584b}
.dt-sheet p{margin:2px 0}
.dt-sheet ul{margin:0;padding-left:1.2em}
.dt-sheet small{color:#5f584b}
.dt-sheet .alert{background:#f8e6e1;padding:2px 4px}
.dt-sheet .note{font-size:9pt;color:#5f584b}
.dt-sheet .none{color:#8c8473}
.dt-sheet table{border-collapse:collapse;width:100%;font-size:9.5pt}
.dt-sheet th,.dt-sheet td{border:1px solid #d9cfba;padding:1px 4px;text-align:left;vertical-align:top}
.dt-sheet td.blank{width:7em}
.dt-sheet .pt{break-inside:avoid;page-break-inside:avoid;margin:10px 0 14px}
.dt-sheet .dt-head{margin-bottom:6px}
@media print{.dt-sheet .pt{margin:6px 0 10px}}
`;

/** A whole HTML file of the snapshot (for 「HTML で保存」; it opens without the app or a network). */
export function downtimeDocument(s: DowntimeSnapshot): string {
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><title>障害時の参照 ${esc(s.place)} ${esc(s.madeAt)}</title><style>body{margin:16px;background:#fff}@page{size:A4 portrait;margin:10mm}${DOWNTIME_CSS}</style></head><body><div class="dt-sheet">${downtimeBody(s)}</div></body></html>`;
}

/** What is kept in this browser for /downtime/index.html. */
export interface StoredDowntime {
  version: 1;
  madeAt: string;
  by: string;
  place: string;
  count: number;
  body: string;
  css: string;
}

export const toStored = (s: DowntimeSnapshot): StoredDowntime => ({ version: 1, madeAt: s.madeAt, by: s.by, place: s.place, count: s.patients.length, body: downtimeBody(s), css: DOWNTIME_CSS });

/** Keep the snapshot in this browser. False when the browser does not let it (private mode, full). */
export function keepDowntime(s: DowntimeSnapshot, store: Pick<Storage, "setItem"> | null = typeof window === "undefined" ? null : window.localStorage): boolean {
  try {
    store?.setItem(DOWNTIME_STORE, JSON.stringify(toStored(s)));
    return !!store;
  } catch {
    return false;
  }
}

/** The snapshot kept in this browser, or null. */
export function keptDowntime(store: Pick<Storage, "getItem"> | null = typeof window === "undefined" ? null : window.localStorage): StoredDowntime | null {
  try {
    const raw = store?.getItem(DOWNTIME_STORE);
    if (!raw) return null;
    const v = JSON.parse(raw) as StoredDowntime;
    return v && v.version === 1 && typeof v.body === "string" && typeof v.madeAt === "string" ? v : null;
  } catch {
    return null;
  }
}

/** Remove the snapshot from this browser. */
export function forgetDowntime(store: Pick<Storage, "removeItem"> | null = typeof window === "undefined" ? null : window.localStorage): void {
  try {
    store?.removeItem(DOWNTIME_STORE);
  } catch {}
}

/** "2026/11/4 10:32" in Japan. */
export const madeAtNow = (d = new Date()) => d.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
