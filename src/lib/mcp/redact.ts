// 文の中の氏名・患者番号・電話・日付・住所・部屋番号らしい表記を置き換える（MCP と、IC を声で記録の
// Claude に送る前の置き換えで使う）。node の機能を読まないので、画面からも使える。

import type { Patient } from "../types";
import { PATIENTS } from "../patients";
import { WARD_CHART_PATIENTS } from "../ward-charts";
import { INITIAL_CONTACTS } from "../patient-contacts";

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
