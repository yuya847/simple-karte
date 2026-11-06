// 患者基本情報: what the window opened by double-clicking the patient's name shows besides the chart —
// the address, the phones, the first and second person to call, the family (続柄・同居・キーパーソン), the
// 公費 and the 介護保険 (要介護度・ケアマネジャー), the family doctor and the pharmacy. The health insurance
// itself (保険の種類・負担割合・限度額) is what 医事課 registered in 保険の登録 (billing/registration.ts) and is
// read from there, not kept twice. Who may change these follows roles.ts ("profile.contacts"; the fictional
// hospital's rule). Each save keeps the earlier version with who and when.
//
// Every name, address, phone number and e-mail here is made up: addresses are in 「架空県架空市」, phone numbers
// are 000 / 090-0000-…, e-mail is at example.jp (a domain reserved for documentation). No real person's data
// is ever to be put in.

import { ANAMNESIS_SOURCES } from "./anamnesis";
import type { CalendarDate } from "./dates";
import type { DayOffset } from "./types";
import { WARD_CHART_PATIENTS } from "./ward-charts";

/** The documents whose item lists these follow (the form and who registers what are the fictional hospital's). */
export const CONTACTS_SOURCES = ANAMNESIS_SOURCES;

export interface PatientAddress {
  /** 郵便番号 "000-0000" (none starts with 000: made up on purpose). */
  postal: string;
  prefecture: string;
  city: string;
  street: string;
}

/** Someone to call: 第一連絡先 (primary) and the others, in order. */
export interface ContactPerson {
  relation: string;
  name: string;
  phone: string;
  /** When they can be reached (「日中は携帯」など). */
  when: string;
  primary: boolean;
}

export interface FamilyMember {
  relation: string;
  name: string;
  age: number | null;
  cohabiting: boolean;
  keyPerson: boolean;
  phone: string;
  note: string;
}

export const CARE_LEVELS = ["未登録", "なし（申請していない）", "申請中", "非該当", "要支援1", "要支援2", "要介護1", "要介護2", "要介護3", "要介護4", "要介護5"] as const;
export type CareLevel = (typeof CARE_LEVELS)[number];

export interface PatientCare {
  careLevel: CareLevel;
  /** 担当ケアマネジャー (名前) and 事業所. */
  careManager: string;
  careOffice: string;
  /** かかりつけ医 (院名) and かかりつけ薬局. */
  familyDoctor: string;
  pharmacy: string;
}

export interface PatientPublicAid {
  /** 公費 (制度名), e.g. 「指定難病」; empty when none. */
  publicAid: string[];
  /** 限度額適用認定証 etc. as seen at the desk (what 医事課 registered is the claim's source). */
  note: string;
}

export interface PatientContactsFields {
  address: PatientAddress;
  phones: { home: string; mobile: string };
  email: string;
  contacts: ContactPerson[];
  family: FamilyMember[];
  insurance: PatientPublicAid;
  care: PatientCare;
}

export interface ContactsVersion extends PatientContactsFields {
  registeredBy: string;
  registeredAt: { day: DayOffset; time: string };
  /** Why it was changed (none for the first registration). */
  reason?: string;
}

export interface PatientContacts extends ContactsVersion {
  patientId: string;
  /** Earlier versions, oldest first (the fields above are the version in force). */
  earlier?: ContactsVersion[];
}

/** What is kept per patient id. */
export type ContactsBook = Record<string, PatientContacts>;

export const emptyAddress = (): PatientAddress => ({ postal: "", prefecture: "", city: "", street: "" });
export const emptyContact = (primary = false): ContactPerson => ({ relation: "", name: "", phone: "", when: "", primary });
export const emptyFamily = (): FamilyMember => ({ relation: "", name: "", age: null, cohabiting: false, keyPerson: false, phone: "", note: "" });

export const emptyContactsFields = (): PatientContactsFields => ({
  address: emptyAddress(),
  phones: { home: "", mobile: "" },
  email: "",
  contacts: [emptyContact(true), emptyContact(false)],
  family: [],
  insurance: { publicAid: [], note: "" },
  care: { careLevel: "未登録", careManager: "", careOffice: "", familyDoctor: "", pharmacy: "" },
});

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

export const formatAddress = (a: PatientAddress): string => [a.postal && `〒${a.postal}`, `${a.prefecture}${a.city}${a.street}`].filter(Boolean).join("　").trim();

/** 第一連絡先: the one marked primary, else the first with a name. */
export const primaryContact = (c: Pick<PatientContactsFields, "contacts">): ContactPerson | undefined => c.contacts.find((x) => x.primary && x.name) ?? c.contacts.find((x) => x.name);

/** The others to call, in order (第二連絡先 first). */
export const otherContacts = (c: Pick<PatientContactsFields, "contacts">): ContactPerson[] => {
  const first = primaryContact(c);
  return c.contacts.filter((x) => x.name && x !== first);
};

export const keyPersons = (c: Pick<PatientContactsFields, "family">): FamilyMember[] => c.family.filter((f) => f.keyPerson);

/** 「長女 田辺 幸子（60歳・別居・キーパーソン）」 */
export const familyLabel = (f: FamilyMember): string => `${f.relation} ${f.name}（${[f.age !== null ? `${f.age}歳` : "", f.cohabiting ? "同居" : "別居", f.keyPerson ? "キーパーソン" : ""].filter(Boolean).join("・")}）`;

export const contactsVersions = (r: PatientContacts): ContactsVersion[] => [...(r.earlier ?? []), { ...fieldsOf(r), registeredBy: r.registeredBy, registeredAt: r.registeredAt, reason: r.reason }];

export const fieldsOf = (v: PatientContactsFields): PatientContactsFields => ({ address: v.address, phones: v.phones, email: v.email, contacts: v.contacts, family: v.family, insurance: v.insurance, care: v.care });

// ---------------------------------------------------------------------------
// Birth date and era (the chart keeps the age; a fictional birth date is made from it)
// ---------------------------------------------------------------------------

/** 元号 and its year for a date (明治 and later). */
export function eraYear(d: CalendarDate): string {
  const n = d.y * 10000 + d.m * 100 + d.d;
  const eras: [number, string, number][] = [
    [20190501, "令和", 2019],
    [19890108, "平成", 1989],
    [19261225, "昭和", 1926],
    [19120730, "大正", 1912],
    [18680125, "明治", 1868],
  ];
  const e = eras.find(([from]) => n >= from);
  if (!e) return "";
  const y = d.y - e[2] + 1;
  return `${e[1]}${y === 1 ? "元" : y}年`;
}

/** "1954年4月12日（昭和29年）" */
export const formatBirth = (d: CalendarDate): string => `${d.y}年${d.m}月${d.d}日${eraYear(d) ? `（${eraYear(d)}）` : ""}`;

export const parseIsoDate = (s: string): CalendarDate | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  return m ? { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) } : null;
};

/**
 * A fictional birth date that gives this age today. The month and day come from the patient id (the same on
 * every load); when 医事課 registered a birth date with the insurance, that one is used instead (`known`).
 */
export function birthDateOf(p: { id: string; age: number }, today: CalendarDate, known?: string): CalendarDate {
  const k = known ? parseIsoDate(known) : null;
  if (k) return k;
  let h = 0;
  for (const ch of p.id.replace(/^er:/, "")) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const m = (h % 12) + 1;
  const d = (Math.floor(h / 12) % 28) + 1;
  const notYet = m > today.m || (m === today.m && d > today.d);
  return { y: today.y - p.age - (notYet ? 1 : 0), m, d };
}

/** The age on a day (for checking a registered birth date against the chart's age). */
export function ageAt(birth: CalendarDate, on: CalendarDate): number {
  return on.y - birth.y - (on.m < birth.m || (on.m === birth.m && on.d < birth.d) ? 1 : 0);
}

// ---------------------------------------------------------------------------
// Editing
// ---------------------------------------------------------------------------

const PHONE = /^[0-9０-９][0-9０-９-－()（）ー ]{5,}$/;
const POSTAL = /^\d{3}-?\d{4}$/;

/** Why the form cannot be saved yet (empty when it can). */
export function contactsProblems(f: PatientContactsFields, prev: PatientContacts | undefined, reason: string): string[] {
  const out: string[] = [];
  if (f.address.postal && !POSTAL.test(f.address.postal)) out.push("郵便番号は 000-0000 の形で書いてください。");
  for (const [label, v] of [
    ["自宅電話", f.phones.home],
    ["携帯", f.phones.mobile],
  ] as const)
    if (v && !PHONE.test(v)) out.push(`${label}は数字とハイフンで書いてください。`);
  if (f.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)) out.push("メールアドレスの形が違います。");
  f.contacts.forEach((c, i) => {
    const n = i === 0 ? "第一連絡先" : `第${i + 1}連絡先`;
    if (c.name && !c.phone) out.push(`${n}（${c.name}）の電話がありません。`);
    if (c.phone && !PHONE.test(c.phone)) out.push(`${n}の電話は数字とハイフンで書いてください。`);
    if (c.name && !c.relation) out.push(`${n}（${c.name}）の続柄がありません。`);
  });
  if (f.contacts.filter((c) => c.name && c.primary).length > 1) out.push("第一連絡先は1人にしてください。");
  f.family.forEach((m) => {
    if (m.name && !m.relation) out.push(`家族（${m.name}）の続柄がありません。`);
    if (m.phone && !PHONE.test(m.phone)) out.push(`家族（${m.name || "名前なし"}）の電話は数字とハイフンで書いてください。`);
  });
  if (prev) {
    if (JSON.stringify(fieldsOf(prev)) === JSON.stringify(cleanFields(f))) out.push("直したところがまだありません。");
    if (!reason.trim()) out.push("変更の理由を書いてください（例：家族から申し出）。");
  }
  return out;
}

/** The form as it is kept: names trimmed, empty family rows and contacts without a name dropped, one 第一連絡先. */
export function cleanFields(f: PatientContactsFields): PatientContactsFields {
  const clean: PatientContactsFields = {
    ...fieldsOf(f),
    contacts: f.contacts.filter((c) => c.name.trim()).map((c) => ({ ...c, name: c.name.trim() })),
    family: f.family.filter((m) => m.name.trim() || m.relation.trim()),
    insurance: { ...f.insurance, publicAid: f.insurance.publicAid.map((x) => x.trim()).filter(Boolean) },
  };
  // One 第一連絡先: the marked one, else the first.
  if (clean.contacts.length && !clean.contacts.some((c) => c.primary)) clean.contacts = clean.contacts.map((c, i) => ({ ...c, primary: i === 0 }));
  return clean;
}

/** A new version; the one in force becomes the latest earlier one. */
export function saveContacts(prev: PatientContacts | undefined, patientId: string, f: PatientContactsFields, by: string, at: { day: DayOffset; time: string }, reason: string): PatientContacts {
  const clean = cleanFields(f);
  if (!prev) return { patientId, ...clean, registeredBy: by, registeredAt: at };
  const cur: ContactsVersion = { ...fieldsOf(prev), registeredBy: prev.registeredBy, registeredAt: prev.registeredAt, ...(prev.reason ? { reason: prev.reason } : {}) };
  return { patientId, ...clean, registeredBy: by, registeredAt: at, reason: reason.trim(), earlier: [...(prev.earlier ?? []), cur] };
}

/** What changed from one version to the next, in words (for the history). */
export function contactsChanges(before: PatientContactsFields, after: PatientContactsFields): string[] {
  const out: string[] = [];
  const cmp = (label: string, a: string, b: string) => {
    if (a !== b) out.push(`${label}：${a || "（なし）"} → ${b || "（なし）"}`);
  };
  cmp("住所", formatAddress(before.address), formatAddress(after.address));
  cmp("自宅電話", before.phones.home, after.phones.home);
  cmp("携帯", before.phones.mobile, after.phones.mobile);
  cmp("メール", before.email, after.email);
  const contactText = (cs: ContactPerson[]) => cs.map((c) => `${c.primary ? "第一 " : ""}${c.relation} ${c.name} ${c.phone}`).join("／");
  cmp("連絡先", contactText(before.contacts), contactText(after.contacts));
  cmp("家族", before.family.map(familyLabel).join("／"), after.family.map(familyLabel).join("／"));
  cmp("公費", before.insurance.publicAid.join("・"), after.insurance.publicAid.join("・"));
  cmp("保険の備考", before.insurance.note, after.insurance.note);
  cmp("要介護度", before.care.careLevel, after.care.careLevel);
  cmp("ケアマネジャー", `${before.care.careManager} ${before.care.careOffice}`.trim(), `${after.care.careManager} ${after.care.careOffice}`.trim());
  cmp("かかりつけ医", before.care.familyDoctor, after.care.familyDoctor);
  cmp("かかりつけ薬局", before.care.pharmacy, after.care.pharmacy);
  return out;
}

// ---------------------------------------------------------------------------
// Fictional starting data (架空): the four patients of the 山本チーム and a few other beds of 5階東
// ---------------------------------------------------------------------------

const PREF = "架空県";
const CITY = "架空市";
const addr = (street: string, postal = "000-0000", city = CITY): PatientAddress => ({ postal, prefecture: PREF, city, street });
const mobile = (n: string) => `090-0000-${n}`;
const home = (n: string) => `000-000-${n}`;
const admittedOf = (id: string): DayOffset => WARD_CHART_PATIENTS.find((p) => p.id === id)?.admittedOn ?? 0;
const byDesk = "医事課 渡辺";

const record = (patientId: string, day: DayOffset, time: string, f: PatientContactsFields, by = byDesk): PatientContacts => ({ patientId, ...f, registeredBy: by, registeredAt: { day, time } });

export const INITIAL_CONTACTS: ContactsBook = {
  // 佐倉 修（72歳男性、総合診療科）: 妻と二人暮らし。長男は市外。
  "90010231": record("90010231", -3, "10:40", {
    address: addr("桜町1-2-3"),
    phones: { home: home("0231"), mobile: mobile("0231") },
    email: "sakura.osamu@example.jp",
    contacts: [
      { relation: "妻", name: "佐倉 春江", phone: mobile("0232"), when: "いつでも（同居）", primary: true },
      { relation: "長男", name: "佐倉 健", phone: mobile("0233"), when: "平日の夜・休日（市外在住）", primary: false },
    ],
    family: [
      { relation: "妻", name: "佐倉 春江", age: 70, cohabiting: true, keyPerson: true, phone: mobile("0232"), note: "本人の薬の管理を手伝っている" },
      { relation: "長男", name: "佐倉 健", age: 45, cohabiting: false, keyPerson: false, phone: mobile("0233"), note: "架空県架空市の隣の市に住む" },
    ],
    insurance: { publicAid: [], note: "高齢受給者証（2割）を受付で確認" },
    care: { careLevel: "なし（申請していない）", careManager: "", careOffice: "", familyDoctor: "架空町クリニック（内科）", pharmacy: "架空薬局 桜町店" },
  }),
  // 大浦 トメ（86歳女性）: 独居。長女が市内に住みキーパーソン。要介護2。
  "90010244": record("90010244", -1, "15:20", {
    address: addr("松が丘2-15-8"),
    phones: { home: home("0244"), mobile: "" },
    email: "",
    contacts: [
      { relation: "長女", name: "田辺 幸子", phone: mobile("0245"), when: "日中は携帯に。夜は自宅 " + home("0245"), primary: true },
      { relation: "長男", name: "大浦 一郎", phone: mobile("0246"), when: "遠方のため急ぎのときだけ", primary: false },
    ],
    family: [
      { relation: "長女", name: "田辺 幸子", age: 60, cohabiting: false, keyPerson: true, phone: mobile("0245"), note: "市内在住。週2回様子を見に来ている" },
      { relation: "長男", name: "大浦 一郎", age: 63, cohabiting: false, keyPerson: false, phone: mobile("0246"), note: "遠方に住む" },
    ],
    insurance: { publicAid: [], note: "限度額適用・標準負担額減額認定証（低所得Ⅱ）を受付で確認" },
    care: { careLevel: "要介護2", careManager: "鈴木", careOffice: "架空市ケアプランセンター松が丘", familyDoctor: "架空市立松が丘診療所", pharmacy: "松が丘薬局" },
  }),
  // 北村 博（79歳男性）: 妻と二人暮らし。要支援1。循環器のかかりつけがある。
  "90010198": record("90010198", -5, "11:05", {
    address: addr("川向3-4-12", "000-0001"),
    phones: { home: home("0198"), mobile: mobile("0198") },
    email: "",
    contacts: [
      { relation: "妻", name: "北村 節子", phone: home("0198"), when: "いつでも（同居）。携帯は持っていない", primary: true },
      { relation: "次女", name: "山下 恵", phone: mobile("0199"), when: "平日 18 時以降", primary: false },
    ],
    family: [
      { relation: "妻", name: "北村 節子", age: 77, cohabiting: true, keyPerson: true, phone: home("0198"), note: "" },
      { relation: "次女", name: "山下 恵", age: 48, cohabiting: false, keyPerson: false, phone: mobile("0199"), note: "市内在住。説明の場には同席を希望" },
    ],
    insurance: { publicAid: [], note: "" },
    care: { careLevel: "要支援1", careManager: "高木", careOffice: "架空市地域包括支援センター川向", familyDoctor: "架空ハートクリニック（循環器内科）", pharmacy: "川向調剤薬局" },
  }),
  // 森 久美子（64歳女性）: 夫と二人暮らし。息子は別居。
  "90010260": record("90010260", -2, "09:50", {
    address: addr("緑が丘5-7-21"),
    phones: { home: home("0260"), mobile: mobile("0260") },
    email: "mori.kumiko@example.jp",
    contacts: [
      { relation: "夫", name: "森 高志", phone: mobile("0261"), when: "日中は職場のため携帯に留守電", primary: true },
      { relation: "長男", name: "森 大輔", phone: mobile("0262"), when: "夜間・休日", primary: false },
    ],
    family: [
      { relation: "夫", name: "森 高志", age: 66, cohabiting: true, keyPerson: true, phone: mobile("0261"), note: "" },
      { relation: "長男", name: "森 大輔", age: 35, cohabiting: false, keyPerson: false, phone: mobile("0262"), note: "都市部に単身で住む" },
    ],
    insurance: { publicAid: [], note: "被扶養者（夫の協会けんぽ）。マイナ保険証で適用区分の情報あり" },
    care: { careLevel: "なし（申請していない）", careManager: "", careOffice: "", familyDoctor: "緑が丘内科クリニック", pharmacy: "" },
  }),
  // 505-D 小池 隆（73歳男性、循環器内科）
  "90035054": record("90035054", admittedOf("90035054"), "14:10", {
    address: addr("南町8-1-5"),
    phones: { home: home("5054"), mobile: mobile("5054") },
    email: "",
    contacts: [{ relation: "妻", name: "小池 良子", phone: mobile("5055"), when: "いつでも", primary: true }],
    family: [{ relation: "妻", name: "小池 良子", age: 71, cohabiting: true, keyPerson: true, phone: mobile("5055"), note: "" }],
    insurance: { publicAid: [], note: "" },
    care: { careLevel: "なし（申請していない）", careManager: "", careOffice: "", familyDoctor: "南町クリニック", pharmacy: "" },
  }),
  // 503 村井 和子（77歳女性、消化器内科）
  "90035030": record("90035030", admittedOf("90035030"), "10:15", {
    address: addr("北町2-9-4"),
    phones: { home: home("5030"), mobile: "" },
    email: "",
    contacts: [
      { relation: "長男", name: "村井 達也", phone: mobile("5031"), when: "日中は携帯に", primary: true },
      { relation: "長男の妻", name: "村井 由紀", phone: mobile("5032"), when: "長男につながらないとき", primary: false },
    ],
    family: [
      { relation: "長男", name: "村井 達也", age: 50, cohabiting: true, keyPerson: true, phone: mobile("5031"), note: "" },
      { relation: "長男の妻", name: "村井 由紀", age: 48, cohabiting: true, keyPerson: false, phone: mobile("5032"), note: "日中は家にいることが多い" },
    ],
    insurance: { publicAid: [], note: "" },
    care: { careLevel: "要支援2", careManager: "佐々木", careOffice: "架空市地域包括支援センター北町", familyDoctor: "北町医院", pharmacy: "北町薬局" },
  }),
  // 501 岡部 正二（81歳男性、呼吸器内科、酸素投与中）
  "90035010": record("90035010", admittedOf("90035010"), "16:30", {
    address: addr("山手1-1-1", "000-0002"),
    phones: { home: home("5010"), mobile: "" },
    email: "",
    contacts: [{ relation: "妻", name: "岡部 文子", phone: home("5010"), when: "自宅（夜 21 時まで）", primary: true }],
    family: [
      { relation: "妻", name: "岡部 文子", age: 79, cohabiting: true, keyPerson: true, phone: home("5010"), note: "" },
      { relation: "長女", name: "岡部 真理", age: 52, cohabiting: false, keyPerson: false, phone: mobile("5011"), note: "県外在住" },
    ],
    insurance: { publicAid: [], note: "" },
    care: { careLevel: "要介護1", careManager: "中島", careOffice: "架空ケアサポート山手", familyDoctor: "山手呼吸器クリニック", pharmacy: "山手薬局" },
  }),
  // 506-B 吉川 ミツ（90歳女性、総合診療科 B チーム、転倒注意）: 施設から入院。
  "90035062": record("90035062", admittedOf("90035062"), "13:45", {
    address: addr("花見台4-2（特別養護老人ホーム 架空の家）"),
    phones: { home: home("5062"), mobile: "" },
    email: "",
    contacts: [
      { relation: "施設の相談員", name: "架空の家 生活相談員 小野", phone: home("5062"), when: "施設の日中（8:30〜17:30）", primary: true },
      { relation: "長男", name: "吉川 正男", phone: mobile("5063"), when: "夜間・休日", primary: false },
    ],
    family: [{ relation: "長男", name: "吉川 正男", age: 65, cohabiting: false, keyPerson: true, phone: mobile("5063"), note: "施設と連絡を取り合っている" }],
    insurance: { publicAid: [], note: "" },
    care: { careLevel: "要介護4", careManager: "施設のケアマネジャー 林", careOffice: "特別養護老人ホーム 架空の家", familyDoctor: "架空の家 嘱託医", pharmacy: "" },
  }),
  // 505-A 堀 誠（68歳男性、消化器内科、明日退院）
  "90035051": record("90035051", admittedOf("90035051"), "09:30", {
    address: addr("東町6-3-9"),
    phones: { home: "", mobile: mobile("5051") },
    email: "hori.makoto@example.jp",
    contacts: [{ relation: "妻", name: "堀 美佐", phone: mobile("5052"), when: "日中は携帯に", primary: true }],
    family: [{ relation: "妻", name: "堀 美佐", age: 66, cohabiting: true, keyPerson: true, phone: mobile("5052"), note: "" }],
    insurance: { publicAid: [], note: "" },
    care: { careLevel: "なし（申請していない）", careManager: "", careOffice: "", familyDoctor: "", pharmacy: "東町薬局" },
  }),
};
