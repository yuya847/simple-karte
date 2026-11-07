import { createHmac } from "node:crypto";
import type { Patient } from "../types";
import { PATIENTS } from "../patients";
import { WARD_CHART_PATIENTS } from "../ward-charts";
import { INITIAL_CONTACTS } from "../patient-contacts";

export function pseudonym(id: string) {
  return `P-${createHmac("sha256", process.env.MCP_PSEUDONYM_SECRET || "simple-karte-fictional-mcp-development-v1").update(id).digest("hex").slice(0, 12).toUpperCase()}`;
}
export const relativeDay = (day: number) => day === 0 ? "今日" : day < 0 ? `${-day}日前` : `${day}日後`;
const namesCache = new WeakMap<Patient[], RegExp>();
export function redact(text: string, patients: Patient[]) {
  let names: string[] | undefined;
  if (!namesCache.has(patients)) { names = [...patients, ...PATIENTS, ...WARD_CHART_PATIENTS].flatMap(p => {
    const contacts = INITIAL_CONTACTS[p.id];
    return [p.name, p.kana, p.attending, ...p.history.map(e => e.author), ...(contacts?.family.map(f => f.name) ?? []), ...(contacts?.contacts.map(c => c.name) ?? [])];
  }).flatMap(n => [n, ...n.split(/[\s　（(]/)]).filter(n => n.length >= 2 && !/(?:科|病棟|医師|看護師|薬剤師|技師|検査室|栄養士|医事課)$/.test(n));
    names = [...new Set(names)].sort((a,b) => b.length-a.length); namesCache.set(patients, new RegExp(names.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "g"));
  }
  let result = text.replace(namesCache.get(patients)!, "［氏名］");
  for (const p of patients) result = result.split(p.id).join("［患者番号］");
  return result.replace(/(?:\+81[- ]?)?(?:0\d{1,4}[-ー ]\d{1,4}[-ー ]\d{3,4}|0\d{9,10})/g, "［電話］")
    .replace(/(?:\d{4}[-/.年]\d{1,2}[-/.月]\d{1,2}日?|(?:令和|平成|昭和)\d+年\d+月\d+日|\d{1,2}月\d{1,2}日|(?<!\d)(?:0?[1-9]|1[0-2])\/(?:0?[1-9]|[12]\d|3[01])(?:（[月火水木金土日]）)?(?!\d))/g, "［日付］")
    .replace(/[^\s、。]*[都道府県][^\s、。]*[市区町村][^\s、。]*/g, "［住所］")
    .replace(/\d{3,4}(?:号室|病室)/g, "［部屋］");
}
/** Recursively scrub selected clinical fields; offset keys become relative labels. */
export function scrub(value: unknown, patients: Patient[]): unknown {
  if (typeof value === "string") return redact(value, patients);
  if (Array.isArray(value)) return value.map(v => scrub(v, patients));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([k]) => !["id", "author", "by", "reportedBy", "writtenAt", "versions", "figures", "corrected"].includes(k)).map(([k,v]) => [k, typeof v === "number" && ["day", "collectedOn", "reportedOn"].includes(k) ? relativeDay(v) : scrub(v, patients)]));
  return value;
}
