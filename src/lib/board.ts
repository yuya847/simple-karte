// 掲示板 of the fictional hospital: notices from the departments, and who has read each one.
// Sorting, counting and hiding expired notices are done by code. Nothing here is written by AI.
// In this prototype the notices and the read marks live in the browser's memory (the parent screen
// keeps them); a real system would keep them on the hospital's server.

import { addDays, formatShort, type CalendarDate } from "./dates";
import { MEAL_DEADLINE } from "./diet";
import { STAFF, type Role } from "./roles";
import type { DayOffset } from "./types";

export type Dept = "医療安全管理室" | "感染対策室" | "薬剤部" | "栄養科" | "看護部" | "総務課" | "医事課" | "情報システム室" | "医局" | "検査部" | "放射線部" | "リハビリテーション部" | "地域連携室";

export const DEPTS: Dept[] = ["医療安全管理室", "感染対策室", "看護部", "医局", "薬剤部", "検査部", "放射線部", "リハビリテーション部", "栄養科", "地域連携室", "医事課", "総務課", "情報システム室"];

/** Where a post comes from when someone in this role writes it. */
export const ROLE_DEPT: Record<Role, Dept> = {
  臨床工学技士: "医療安全管理室", ICT: "感染対策室", 歯科衛生士: "看護部",
  医師: "医局",
  看護師: "看護部",
  薬剤師: "薬剤部",
  臨床検査技師: "検査部",
  診療放射線技師: "放射線部",
  療法士: "リハビリテーション部",
  管理栄養士: "栄養科",
  MSW: "地域連携室",
  医事課: "医事課",
  デバッグ: "情報システム室",
};

export interface Notice {
  id: string;
  from: Dept;
  title: string;
  /** Plain text. "{+3}" / "{-1}" / "{0}" are dates as day offsets from today (shown as "11/6（金）"). */
  body: string;
  /** Who posted it (name as in the audit log). */
  by: string;
  posted: { day: DayOffset; time: string };
  important: boolean;
  /** Last day it is shown (day offset, that day included). null = no end. */
  until: DayOffset | null;
  /** The public source, when the notice cites a rule. */
  source?: string;
  /** DI（医薬品情報）: the master drugs the notice is about (薬剤部 posts; formulary.ts lists them by drug). */
  drugs?: string[];
}

/** Notice id → names of the staff who opened it. */
export type Reads = Record<string, string[]>;

export const isExpired = (n: Notice, day: DayOffset = 0): boolean => n.until !== null && n.until < day;

export const isRead = (reads: Reads, id: string, name: string): boolean => (reads[id] ?? []).includes(name);

/** Notices this person has not opened yet (expired ones are not counted). */
export function unreadCount(notices: Notice[], reads: Reads, name: string): number {
  return notices.filter((n) => !isExpired(n) && !isRead(reads, n.id, name)).length;
}

/** The reads with this person added to the notice (a new object; the old one is not changed). */
export function markRead(reads: Reads, id: string, name: string): Reads {
  if (isRead(reads, id, name)) return reads;
  return { ...reads, [id]: [...(reads[id] ?? []), name] };
}

const postedKey = (n: Notice) => n.posted.day * 1440 + Number(n.posted.time.slice(0, 2)) * 60 + Number(n.posted.time.slice(3, 5));

/** Important and unread first, then the other unread ones, then the read ones; newest first in each. */
export function sortNotices(notices: Notice[], reads: Reads, name: string): Notice[] {
  const rank = (n: Notice) => (isRead(reads, n.id, name) ? 2 : n.important ? 0 : 1);
  return [...notices].sort((a, b) => rank(a) - rank(b) || postedKey(b) - postedKey(a));
}

/** Words to search in: title, body, department and who posted it. */
export const searchText = (n: Notice): string => [n.title, n.body, n.from, n.by].join(" ");

/** Replaces "{+3}" etc. in the body with the date. */
export function fillDates(text: string, today: CalendarDate): string {
  return text.replace(/\{([+-]?\d+)\}/g, (_, d: string) => formatShort(addDays(today, Number(d))));
}

/** "11/10（火）まで" or "期限なし". */
export function untilLabel(n: Notice, today: CalendarDate): string {
  if (n.until === null) return "期限なし";
  return `${formatShort(addDays(today, n.until))}まで${isExpired(n) ? "（期限切れ）" : ""}`;
}

/** What is still missing before a post can be put up. */
export function postProblems(p: { title: string; body: string }): string[] {
  return [!p.title.trim() && "題名", !p.body.trim() && "本文"].filter((x): x is string => !!x);
}

/** Lengths a poster can choose for 掲示期限 (days from today; null = no end). */
export const UNTIL_CHOICES: { value: string; label: string; days: number | null }[] = [
  { value: "3", label: "3日", days: 3 },
  { value: "7", label: "1週間", days: 7 },
  { value: "14", label: "2週間", days: 14 },
  { value: "30", label: "1か月", days: 30 },
  { value: "none", label: "期限なし", days: null },
];

const meal = (m: keyof typeof MEAL_DEADLINE) => `${m}食は${MEAL_DEADLINE[m].dayBefore ? "前日" : "当日"}の${MEAL_DEADLINE[m].time}`;

/** Notices already on the board when the screen opens (all fictional). */
export const INITIAL_NOTICES: Notice[] = [
  {
    id: "n-fall",
    from: "看護部",
    title: "夜間の転倒・転落が続いています",
    body: "この1週間に、夜間のトイレ歩行での転倒・転落が3件ありました。\n入院・転棟のときと、治療で状態が変わったときは、転倒・転落の危険を評価し直して、夜勤に伝えてください。\n手順は院内マニュアル「転倒・転落」にあります。",
    by: "看護部長",
    posted: { day: 0, time: "07:45" },
    important: true,
    until: 7,
    source: "日本医療安全調査機構「医療事故の再発防止に向けた提言 第9号」（2019年、提言7：入院・転棟・状態の変化のときは情報を共有し、危険を評価し直す） https://www.medsafe.or.jp/teigen/teigen-09.pdf",
  },
  {
    id: "n-infection",
    from: "感染対策室",
    title: "インフルエンザの患者が増えています：面会と手指衛生",
    body: "院内でインフルエンザの患者が増えています。\n{0}から当面、面会は1回2人まで・15分までにします。\n発熱や咳のある人は面会を控えてもらうよう、受付と病棟で伝えてください。\n手指衛生の5つのタイミングは、院内マニュアル「標準予防策と手指衛生」を見てください。",
    by: "感染管理認定看護師",
    posted: { day: -1, time: "09:00" },
    important: true,
    until: 30,
  },
  {
    id: "n-ehr",
    from: "情報システム室",
    title: "電子カルテの定期メンテナンス（止まる時間があります）",
    body: "{+2} 2:00〜4:00 に電子カルテが止まります。\nその間は、各病棟の災害用ボックスにある紙の記録用紙を使い、再開後に入力してください。\n止まる前に、夜間の指示と与薬予定を印刷しておいてください（ワークシートの「印刷」）。",
    by: "情報システム室",
    posted: { day: -2, time: "15:00" },
    important: true,
    until: 2,
  },
  {
    id: "n-training",
    from: "医療安全管理室",
    title: "医療安全研修（第2回）のご案内",
    body: "{+10} 17:30〜18:30、講堂で行います。テーマは「患者確認と照合」です。\n全職員が対象です。出られない人は、後日の録画を見て確認テストを出してください。",
    by: "医療安全管理者",
    posted: { day: -3, time: "08:30" },
    important: false,
    until: 10,
  },
  {
    id: "n-di-narcotic",
    from: "薬剤部",
    title: "【DI】麻薬2品目を採用しました：麻薬の注射は施用票を書いて残液・空アンプルを返納",
    body: "{-1} から、モルヒネ塩酸塩注射液10mg「シオノギ」とオキシコンチンTR錠5mg を採用しました。\n麻薬は、麻薬施用者の免許のある医師だけがオーダできます（麻薬及び向精神薬取締法 第27条）。\n麻薬の注射を実施したら、病棟の「麻薬の施用票」で施用量と残量（mL）を書き、残液の入ったアンプルと空アンプルを薬剤部へ返してください。\nオキシコンチンTR錠は、割ったり、砕いたり、かみ砕いたりせずに服用する薬です（電子添文 8.1）。",
    by: "薬剤師 小林",
    posted: { day: -1, time: "15:30" },
    important: true,
    until: 14,
    drugs: ["INJ-MOR10", "ORAL-OXC5"],
    source: "PMDA 電子添文：モルヒネ塩酸塩注射液10mg「シオノギ」（2024年11月改訂 第3版） https://www.pmda.go.jp/PmdaSearch/iyakuDetail/343018_8114401A1112_2_06 ／オキシコンチンTR錠（2026年3月改訂 第4版） https://www.pmda.go.jp/PmdaSearch/iyakuDetail/343018_8119002G5020_2_09",
  },
  {
    id: "n-drug",
    from: "薬剤部",
    title: "採用薬の切り替え：酸化マグネシウム錠の包装が変わります",
    body: "{+7} から、酸化マグネシウム錠の包装（シートの色と印字）が変わります。薬の成分と量は同じです。\n病棟の在庫は薬剤部が入れ替えます。見た目が違うので、配薬のときに注意してください。",
    by: "薬剤師 小林",
    posted: { day: -3, time: "16:00" },
    important: false,
    until: 14,
  },
  {
    id: "n-meal",
    from: "栄養科",
    title: "行事食の日と食事オーダーの締切",
    body: `{+5} の昼食は季節の行事食です。絶食・治療食の患者には、指示に合わせた献立で出します。\n食事オーダーの締切は、${meal("朝")}、${meal("昼")}、${meal("夕")}です。過ぎたら栄養科に電話してください。`,
    by: "管理栄養士 高橋",
    posted: { day: -4, time: "10:00" },
    important: false,
    until: 5,
  },
  {
    id: "n-fire",
    from: "総務課",
    title: "消防訓練（夜間の想定）を行います",
    body: "{+3} 14:00〜15:00 に消防訓練を行います。火災報知器が鳴り、館内放送が流れますが訓練です。\n患者と家族には、前日までに病棟から伝えてください。",
    by: "総務課",
    posted: { day: -5, time: "13:00" },
    important: false,
    until: 3,
  },
  {
    id: "n-claim",
    from: "医事課",
    title: "月末の病名もれの確認のお願い",
    body: "月末の請求の前に、検査や処方に合う病名がついているかを確認してください。\n医事課から各科へ一覧を送ります。",
    by: "医事課 渡辺",
    posted: { day: -9, time: "09:30" },
    important: false,
    until: -2,
  },
  {
    id: "n-form",
    from: "医療安全管理室",
    title: "インシデントレポートの入力画面が新しくなりました",
    body: "インシデントレポートは、電子カルテのメニューの「インシデントレポート」から書けるようになりました。\n報告は、仕組みを良くするためのものです。報告した人を責めるためのものではありません。",
    by: "医療安全管理者",
    posted: { day: -14, time: "11:00" },
    important: false,
    until: -4,
  },
];

/** Who had already opened which notice before this session (fictional staff). */
export const INITIAL_READS: Reads = {
  "n-drug": [STAFF.薬剤師.name, STAFF.医師.name],
  "n-di-narcotic": [STAFF.薬剤師.name],
  "n-meal": [STAFF.管理栄養士.name, STAFF.看護師.name],
  "n-fire": [STAFF.看護師.name, STAFF.医事課.name],
  "n-training": [STAFF.看護師.name],
  "n-claim": [STAFF.医事課.name],
};
