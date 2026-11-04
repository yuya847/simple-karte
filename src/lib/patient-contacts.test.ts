import { describe, expect, it } from "vitest";
import { PATIENTS } from "./patients";
import { INITIAL_ANAMNESIS } from "./anamnesis-initial";
import { ageAt, birthDateOf, contactsChanges, contactsProblems, emptyContactsFields, eraYear, familyLabel, formatAddress, formatBirth, INITIAL_CONTACTS, keyPersons, otherContacts, primaryContact, saveContacts } from "./patient-contacts";
import { WARD_CHART_PATIENTS } from "./ward-charts";

const today = { y: 2026, m: 11, d: 4 };

describe("患者基本情報：生年月日", () => {
  it("makes a birth date that gives the chart's age today, the same on every call", () => {
    for (const p of [...PATIENTS, ...WARD_CHART_PATIENTS]) {
      const b = birthDateOf(p, today);
      expect(ageAt(b, today)).toBe(p.age);
      expect(birthDateOf(p, today)).toEqual(b);
    }
  });

  it("uses the birth date 医事課 registered when there is one", () => {
    expect(birthDateOf({ id: "90010231", age: 72 }, today, "1954-04-12")).toEqual({ y: 1954, m: 4, d: 12 });
    expect(ageAt({ y: 1954, m: 4, d: 12 }, today)).toBe(72);
  });

  it("writes the era", () => {
    expect(eraYear({ y: 1954, m: 4, d: 12 })).toBe("昭和29年");
    expect(eraYear({ y: 1989, m: 1, d: 7 })).toBe("昭和64年");
    expect(eraYear({ y: 1989, m: 1, d: 8 })).toBe("平成元年");
    expect(eraYear({ y: 2019, m: 5, d: 1 })).toBe("令和元年");
    expect(eraYear({ y: 1940, m: 2, d: 20 })).toBe("昭和15年");
    expect(formatBirth({ y: 1940, m: 2, d: 20 })).toBe("1940年2月20日（昭和15年）");
  });
});

describe("患者基本情報：連絡先と家族", () => {
  const oura = INITIAL_CONTACTS["90010244"];

  it("picks the 第一連絡先 and the others", () => {
    expect(primaryContact(oura)?.name).toBe("田辺 幸子");
    expect(primaryContact(oura)?.relation).toBe("長女");
    expect(otherContacts(oura).map((c) => c.name)).toEqual(["大浦 一郎"]);
    expect(keyPersons(oura).map((f) => f.name)).toEqual(["田辺 幸子"]);
    expect(familyLabel(oura.family[0])).toBe("長女 田辺 幸子（60歳・別居・キーパーソン）");
    expect(formatAddress(oura.address)).toBe("〒000-0000　架空県架空市松が丘2-15-8");
  });

  it("falls back to the first named contact when none is marked", () => {
    const f = { contacts: [{ relation: "妻", name: "", phone: "", when: "", primary: true }, { relation: "長男", name: "架空 太郎", phone: "090-0000-0001", when: "", primary: false }] };
    expect(primaryContact(f)?.name).toBe("架空 太郎");
    expect(otherContacts(f)).toEqual([]);
  });

  it("the starting data is fictional: made-up addresses, dummy numbers, example.jp mail", () => {
    for (const c of Object.values(INITIAL_CONTACTS)) {
      expect(c.address.prefecture).toBe("架空県");
      expect(c.address.postal.startsWith("000-")).toBe(true);
      for (const n of [c.phones.home, c.phones.mobile, ...c.contacts.map((x) => x.phone), ...c.family.map((x) => x.phone)].filter(Boolean)) expect(n).toMatch(/^(000-000-|090-0000-)\d{4}$/);
      if (c.email) expect(c.email.endsWith("@example.jp")).toBe(true);
      expect(primaryContact(c)).toBeDefined();
    }
    // The four patients of the team and a few other beds.
    for (const p of PATIENTS) expect(INITIAL_CONTACTS[p.id]).toBeDefined();
    expect(Object.keys(INITIAL_CONTACTS).length).toBeGreaterThanOrEqual(8);
  });
});

describe("患者基本情報：編集", () => {
  const at = { day: 0, time: "10:00" };

  it("a first registration needs no reason; an update needs a change and a reason", () => {
    const f = { ...emptyContactsFields(), phones: { home: "", mobile: "090-0000-9999" } };
    expect(contactsProblems(f, undefined, "")).toEqual([]);
    const r1 = saveContacts(undefined, "X1", f, "医事課 渡辺", at, "");
    expect(r1.registeredBy).toBe("医事課 渡辺");
    expect(r1.earlier).toBeUndefined();
    expect(contactsProblems(f, r1, "")).toEqual(["直したところがまだありません。", "変更の理由を書いてください（例：家族から申し出）。"]);
    const f2 = { ...f, email: "x@example.jp" };
    expect(contactsProblems(f2, r1, "")).toEqual(["変更の理由を書いてください（例：家族から申し出）。"]);
    expect(contactsProblems(f2, r1, "本人から")).toEqual([]);
    const r2 = saveContacts(r1, "X1", f2, "看護師 佐藤", { day: 0, time: "11:00" }, "本人から");
    expect(r2.earlier).toHaveLength(1);
    expect(r2.earlier![0].registeredBy).toBe("医事課 渡辺");
    expect(r2.reason).toBe("本人から");
    expect(contactsChanges(r1, r2)).toEqual(["メール：（なし） → x@example.jp"]);
  });

  it("checks the form: postal code, phones, a contact's phone and relation, one 第一連絡先", () => {
    const f = emptyContactsFields();
    f.address.postal = "12345";
    f.phones.home = "abc";
    f.email = "nope";
    f.contacts = [
      { relation: "", name: "架空 花子", phone: "", when: "", primary: true },
      { relation: "長男", name: "架空 太郎", phone: "090-0000-0001", when: "", primary: true },
    ];
    f.family = [{ relation: "", name: "架空 次郎", age: null, cohabiting: false, keyPerson: false, phone: "", note: "" }];
    expect(contactsProblems(f, undefined, "")).toEqual([
      "郵便番号は 000-0000 の形で書いてください。",
      "自宅電話は数字とハイフンで書いてください。",
      "メールアドレスの形が違います。",
      "第一連絡先（架空 花子）の電話がありません。",
      "第一連絡先（架空 花子）の続柄がありません。",
      "第一連絡先は1人にしてください。",
      "家族（架空 次郎）の続柄がありません。",
    ]);
  });

  it("saving drops empty rows and makes the first contact primary when none is marked", () => {
    const f = emptyContactsFields();
    f.contacts = [
      { relation: "妻", name: "", phone: "", when: "", primary: true },
      { relation: "長男", name: " 架空 太郎 ", phone: "090-0000-0001", when: "", primary: false },
    ];
    f.family = [{ relation: "", name: "", age: null, cohabiting: false, keyPerson: false, phone: "", note: "" }];
    f.insurance.publicAid = [" 指定難病 ", ""];
    const r = saveContacts(undefined, "X1", f, "医事課 渡辺", at, "");
    expect(r.contacts).toEqual([{ relation: "長男", name: "架空 太郎", phone: "090-0000-0001", when: "", primary: true }]);
    expect(r.family).toEqual([]);
    expect(r.insurance.publicAid).toEqual(["指定難病"]);
  });
});

describe("入院前の情報収集の初期データ（架空）", () => {
  it("agrees with the contacts: the key person and the care level", () => {
    const oura = INITIAL_ANAMNESIS["90010244"];
    expect(oura.fields.keyPerson).toContain(primaryContact(INITIAL_CONTACTS["90010244"])!.name);
    expect(oura.fields.careInsurance).toBe(INITIAL_CONTACTS["90010244"].care.careLevel);
    expect(oura.earlier).toBeUndefined();
    expect(INITIAL_ANAMNESIS["90010231"].fields.keyPerson).toContain("佐倉 春江");
  });
});
