"use client";

// 患者基本情報: the window opened by double-clicking the patient's name (iPad: a long press). Everything
// known about the person in one place — ID・氏名・生年月日・性別・血液型・体格・科と医師・病棟・入院, the
// address and phones, 第一／第二連絡先, the family with 続柄, the insurance 医事課 registered, 公費 and 介護保険,
// the admission interview (入院時の情報収集) as the nurse wrote it, and the allergies・感染症・注意・事前指示 —
// each item with who registered it and when. The desk, a nurse or a doctor changes the contacts here
// (roles.ts "profile.contacts"); the insurance is changed in 保険の登録, the interview in 情報収集.
// Nothing is suggested: the window shows what was registered.

import { ExternalLink, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { ANAMNESIS_SECTIONS, type AnamnesisFields, type AnamnesisRecord } from "@/lib/anamnesis";
import type { InsuranceRecord } from "@/lib/billing/registration";
import { type CalendarDate, hospitalDay } from "@/lib/dates";
import { bandLabel, type AdvanceDirective } from "@/lib/directives";
import {
  CARE_LEVELS,
  CONTACTS_SOURCES,
  birthDateOf,
  contactsChanges,
  contactsProblems,
  contactsVersions,
  emptyContact,
  emptyContactsFields,
  emptyFamily,
  fieldsOf,
  formatAddress,
  formatBirth,
  otherContacts,
  primaryContact,
  saveContacts,
  type CareLevel,
  type ContactPerson,
  type FamilyMember,
  type PatientContacts,
  type PatientContactsFields,
} from "@/lib/patient-contacts";
import { doctorLabel, type PatientDoctors } from "@/lib/patient-doctors";
import { ageSex } from "@/lib/person";
import { bloodText, CARE_KEYS } from "@/lib/profile";
import type { Patient } from "@/lib/types";
import { DenyNote, useDeny, useMe } from "../RoleContext";

/** The other drawers this window opens (the records themselves live there). */
export type InfoLink = "anamnesis" | "profile" | "directive" | "doctors" | "billing";

interface Props {
  patient: Patient;
  today: CalendarDate;
  fmtDay: (d: number) => string;
  nowTime: string;
  contacts?: PatientContacts;
  /** 保険の登録 by 医事課, the version in force (billing/registration.ts). */
  insurance?: InsuranceRecord;
  doctors?: PatientDoctors;
  anamnesis?: AnamnesisRecord;
  directive?: AdvanceDirective;
  onOpen?: (where: InfoLink) => void;
  onSave?: (r: PatientContacts) => void;
}

const SECTIONS = [
  { id: "pi-basic", title: "基本" },
  { id: "pi-contacts", title: "連絡先・家族" },
  { id: "pi-insurance", title: "保険・制度" },
  { id: "pi-anamnesis", title: "入院前の情報収集" },
  { id: "pi-alerts", title: "アレルギー・感染症・注意・事前指示" },
  { id: "pi-history", title: "登録の履歴" },
] as const;

const input = "w-full rounded border border-rule bg-sheet px-1.5 py-0.5 text-[13px] outline-none focus:border-ai";
const linkBtn = "inline-flex items-center gap-1 rounded border border-rule bg-sheet px-2 py-0.5 text-xs text-ink-soft hover:text-ink pointer-coarse:py-1.5";

/** One item: label, value, and who registered it (gray, right). */
function Row({ label, children, by }: { label: string; children: React.ReactNode; by?: string }) {
  return (
    <div className="grid grid-cols-[8.5rem_1fr] items-start gap-x-2 gap-y-0.5 border-b border-rule-soft py-1 last:border-b-0 sm:grid-cols-[8.5rem_1fr_auto]">
      <dt className="pt-px text-[12px] text-ink-soft">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
      {by && <dd className="nums col-start-2 text-[11px] text-ink-faint sm:col-start-3 sm:max-w-56 sm:text-right">{by}</dd>}
    </div>
  );
}

const none = <span className="text-ink-faint">—</span>;
const text = (s: string | undefined | null) => (s && s.trim() ? s : none);

/** An answer of the admission interview, as text. */
function answerText(f: AnamnesisFields, key: keyof AnamnesisFields): string {
  const v = f[key];
  if (Array.isArray(v)) return v.join("・");
  if (typeof v === "object") return CARE_KEYS.filter((k) => v[k]).map((k) => `${k} ${v[k]}`).join("・");
  return v;
}

export function PatientInfoPanel({ patient: p, today, fmtDay, nowTime, contacts, insurance, doctors, anamnesis, directive, onOpen, onSave }: Props) {
  const me = useMe();
  const denied = useDeny()("profile.contacts");
  const [edit, setEdit] = useState(false);
  const [draft, setDraft] = useState<PatientContactsFields>(() => (contacts ? fieldsOf(contacts) : emptyContactsFields()));
  const [reason, setReason] = useState("");
  const when = (at: { day: number; time: string }) => `${at.day === 0 ? "今日" : fmtDay(at.day)} ${at.time}`;
  const visit = /^(er|opd):/.test(p.id);
  const birth = birthDateOf(p, today, insurance?.insurance.birthDate);
  const base = `${fmtDay(p.admittedOn)} 入院受付（架空の初期データ）`;
  const first = contacts ? primaryContact(contacts) : undefined;
  const others = contacts ? otherContacts(contacts) : [];
  const regBy = contacts ? `${when(contacts.registeredAt)} ${contacts.registeredBy}` : undefined;
  const problems = edit ? contactsProblems(draft, contacts, reason) : [];
  const versions = contacts ? contactsVersions(contacts).reverse() : [];

  const startEdit = () => {
    setDraft(contacts ? fieldsOf(contacts) : emptyContactsFields());
    setReason("");
    setEdit(true);
  };
  const save = () => {
    if (problems.length || !onSave) return;
    onSave(saveContacts(contacts, p.id, draft, me.name, { day: 0, time: nowTime }, reason));
    setEdit(false);
  };
  const jump = (id: string) => document.getElementById(id)?.scrollIntoView({ block: "start", behavior: "smooth" });
  const open = (where: InfoLink, label: string) =>
    onOpen && (
      <button type="button" onClick={() => onOpen(where)} className={linkBtn}>
        <ExternalLink size={12} />
        {label}
      </button>
    );

  const setContact = (i: number, c: Partial<ContactPerson>) => setDraft({ ...draft, contacts: draft.contacts.map((x, j) => (j === i ? { ...x, ...c } : c.primary ? { ...x, primary: false } : x)) });
  const setFamily = (i: number, m: Partial<FamilyMember>) => setDraft({ ...draft, family: draft.family.map((x, j) => (j === i ? { ...x, ...m } : x)) });

  return (
    <div className="space-y-3 text-[13px]">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-lg font-bold">{p.name}</span>
        <span className="text-xs text-ink-faint">{p.kana}</span>
        <span className="nums text-sm text-ink-soft">{ageSex(p)}</span>
        <span className="rounded border border-dashed border-ink-faint px-1.5 py-0.5 text-[10px] text-ink-soft">架空の患者</span>
        <nav aria-label="節へ移動" className="ml-auto flex flex-wrap gap-1">
          {SECTIONS.map((s) => (
            <button key={s.id} type="button" onClick={() => jump(s.id)} className="rounded px-1.5 py-0.5 text-[11px] text-ink-soft hover:bg-paper hover:text-ink">
              {s.title}
            </button>
          ))}
        </nav>
      </div>
      <p className="hint text-xs text-ink-soft">患者バーの名前をダブルクリック（iPad は長押し）で開きます。ここは登録された情報を並べて見るところです。連絡先・家族・公費・介護保険・かかりつけはこの窓の「編集」で、保険は医事課の「保険の登録」で、入院前の情報収集は看護師の「情報収集」で、アレルギー・感染症・禁忌は「プロファイル」で変えます。</p>
      <p className="text-xs text-shu">架空のデータです。実在の患者の情報は入れないでください。</p>

      {/* 基本 */}
      <section id="pi-basic" aria-labelledby="pi-basic-h" className="rounded-lg border border-rule bg-paper/50 p-3">
        <h3 id="pi-basic-h" className="mb-1 text-sm font-bold">
          基本
        </h3>
        <dl>
          <Row label="患者 ID" by={base}>
            <span className="nums">{visit ? p.id.replace(/^(er|opd):/, "") : p.id}</span>
          </Row>
          <Row label="氏名" by={base}>
            <b>{p.name}</b>
            <span className="ml-2 text-xs text-ink-faint">{p.kana}</span>
          </Row>
          <Row label="生年月日" by={insurance ? `${when(insurance.at)} ${insurance.by}（保険の登録）` : "年齢から作った架空の日付"}>
            <span className="nums">{formatBirth(birth)}</span>
            <span className="ml-2 text-ink-soft">{ageSex(p)}</span>
          </Row>
          <Row label="性別" by={base}>
            {p.sex}性
          </Row>
          <Row label="血液型" by={p.blood ? "プロファイル（医師・臨床検査技師）" : undefined}>
            {bloodText(p.blood)}
          </Row>
          <Row label="身長・体重" by="プロファイル（医師・看護師・管理栄養士）">
            <span className="nums">
              {p.heightCm} cm　{p.weightKg} kg
            </span>
          </Row>
          <Row label="診療科" by={base}>
            {p.department}
          </Row>
          <Row label="医師" by={doctors?.others.length ? doctors.others.map((d) => `${d.role} ${d.name}：${when(d.since)} ${d.by}`).join("／") : base}>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span>主治医 {doctors?.attending ?? p.attending}</span>
              {(doctors?.others ?? []).map((d) => (
                <span key={`${d.role}:${d.name}`} className={d.pending ? "text-yamabuki" : d.role === "担当医" ? "text-ink-soft" : "text-fuji"}>
                  {doctorLabel(d)}
                </span>
              ))}
              {open("doctors", "医師の一覧")}
            </div>
          </Row>
          <Row label={visit ? "場所" : "病棟・部屋"} by={base}>
            {visit ? p.ward : `${p.ward} ${p.room}号室`}
          </Row>
          <Row label={visit ? "受診日" : "入院日"} by={base}>
            <span className="nums">
              {fmtDay(p.admittedOn)}
              {!visit && `　入院${hospitalDay(p.admittedOn, 0)}日目`}
            </span>
          </Row>
          <Row label="入院時診断" by={base}>
            {p.admissionDiagnosis}
          </Row>
        </dl>
      </section>

      {/* 連絡先・家族 */}
      <section id="pi-contacts" aria-labelledby="pi-contacts-h" className="rounded-lg border border-rule bg-paper/50 p-3">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <h3 id="pi-contacts-h" className="text-sm font-bold">
            連絡先・家族
          </h3>
          {regBy && <span className="nums text-[11px] text-ink-faint">登録：{regBy}</span>}
          {!denied && !edit && onSave && (
            <button type="button" onClick={startEdit} className={`${linkBtn} ml-auto`}>
              <Pencil size={12} />
              {contacts ? "編集" : "登録する"}
            </button>
          )}
        </div>
        <DenyNote action="profile.contacts" className="mb-1" />
        {!edit &&
          (contacts ? (
            <dl>
              <Row label="住所" by={regBy}>
                {text(formatAddress(contacts.address))}
              </Row>
              <Row label="自宅電話" by={regBy}>
                <span className="nums">{text(contacts.phones.home)}</span>
              </Row>
              <Row label="携帯" by={regBy}>
                <span className="nums">{text(contacts.phones.mobile)}</span>
              </Row>
              <Row label="メール" by={regBy}>
                {text(contacts.email)}
              </Row>
              <Row label="第一連絡先" by={regBy}>
                {first ? (
                  <span>
                    <b>{first.relation}</b> {first.name}　<span className="nums">{first.phone}</span>
                    {first.when && <span className="ml-2 text-ink-soft">連絡できる時間帯：{first.when}</span>}
                  </span>
                ) : (
                  none
                )}
              </Row>
              {others.map((c, i) => (
                <Row key={`${c.relation}-${c.name}`} label={`第${i + 2}連絡先`} by={regBy}>
                  <b>{c.relation}</b> {c.name}　<span className="nums">{c.phone}</span>
                  {c.when && <span className="ml-2 text-ink-soft">連絡できる時間帯：{c.when}</span>}
                </Row>
              ))}
              <Row label="家族" by={regBy}>
                {contacts.family.length ? (
                  <table className="w-full text-left text-[12px]">
                    <thead className="text-[11px] text-ink-faint">
                      <tr>
                        <th className="pr-2 font-normal">続柄</th>
                        <th className="pr-2 font-normal">名前</th>
                        <th className="pr-2 font-normal">年齢</th>
                        <th className="pr-2 font-normal">同居</th>
                        <th className="pr-2 font-normal">キーパーソン</th>
                        <th className="pr-2 font-normal">電話</th>
                        <th className="font-normal">備考</th>
                      </tr>
                    </thead>
                    <tbody>
                      {contacts.family.map((m) => (
                        <tr key={`${m.relation}-${m.name}`} className="border-t border-rule-soft">
                          <td className="pr-2 font-bold">{m.relation}</td>
                          <td className="pr-2">{m.name}</td>
                          <td className="nums pr-2">{m.age !== null ? `${m.age}歳` : "—"}</td>
                          <td className="pr-2">{m.cohabiting ? "同居" : "別居"}</td>
                          <td className="pr-2">{m.keyPerson ? <b className="text-ai">キーパーソン</b> : ""}</td>
                          <td className="nums pr-2">{m.phone || "—"}</td>
                          <td className="text-ink-soft">{m.note}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  none
                )}
              </Row>
            </dl>
          ) : (
            <p className="text-xs text-ink-soft">住所・連絡先・家族はまだ登録されていません。{denied ? "" : "「登録する」で入れます。"}</p>
          ))}

        {edit && (
          <div className="space-y-3 rounded border border-ai/30 bg-sheet p-2.5">
            <div>
              <h4 className="mb-1 text-xs font-bold text-ink-soft">住所・電話・メール</h4>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                <label className="text-[11px] text-ink-soft">
                  郵便番号
                  <input value={draft.address.postal} onChange={(e) => setDraft({ ...draft, address: { ...draft.address, postal: e.target.value } })} placeholder="000-0000" inputMode="numeric" className={input} />
                </label>
                <label className="text-[11px] text-ink-soft">
                  都道府県
                  <input value={draft.address.prefecture} onChange={(e) => setDraft({ ...draft, address: { ...draft.address, prefecture: e.target.value } })} placeholder="架空県" className={input} />
                </label>
                <label className="text-[11px] text-ink-soft">
                  市区町村
                  <input value={draft.address.city} onChange={(e) => setDraft({ ...draft, address: { ...draft.address, city: e.target.value } })} placeholder="架空市" className={input} />
                </label>
                <label className="text-[11px] text-ink-soft">
                  番地・建物
                  <input value={draft.address.street} onChange={(e) => setDraft({ ...draft, address: { ...draft.address, street: e.target.value } })} placeholder="架空町1-2-3" className={input} />
                </label>
                <label className="text-[11px] text-ink-soft">
                  自宅電話
                  <input value={draft.phones.home} onChange={(e) => setDraft({ ...draft, phones: { ...draft.phones, home: e.target.value } })} placeholder="000-000-0000" inputMode="tel" className={input} />
                </label>
                <label className="text-[11px] text-ink-soft">
                  携帯
                  <input value={draft.phones.mobile} onChange={(e) => setDraft({ ...draft, phones: { ...draft.phones, mobile: e.target.value } })} placeholder="090-0000-0000" inputMode="tel" className={input} />
                </label>
                <label className="col-span-2 text-[11px] text-ink-soft">
                  メール
                  <input value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} placeholder="name@example.jp" inputMode="email" className={input} />
                </label>
              </div>
            </div>

            <div>
              <h4 className="mb-1 text-xs font-bold text-ink-soft">連絡先（上から順に連絡します。◉ が第一連絡先）</h4>
              <div className="space-y-1">
                {draft.contacts.map((c, i) => (
                  <div key={i} className="grid grid-cols-[auto_6rem_1fr_8rem_1fr_auto] items-center gap-1.5">
                    <input type="radio" name="primary-contact" aria-label={`第一連絡先にする（${i + 1}番目）`} checked={c.primary} onChange={() => setContact(i, { primary: true })} />
                    <input value={c.relation} onChange={(e) => setContact(i, { relation: e.target.value })} placeholder="続柄" aria-label={`連絡先${i + 1}の続柄`} className={input} />
                    <input value={c.name} onChange={(e) => setContact(i, { name: e.target.value })} placeholder="名前（架空）" aria-label={`連絡先${i + 1}の名前`} className={input} />
                    <input value={c.phone} onChange={(e) => setContact(i, { phone: e.target.value })} placeholder="090-0000-0000" inputMode="tel" aria-label={`連絡先${i + 1}の電話`} className={input} />
                    <input value={c.when} onChange={(e) => setContact(i, { when: e.target.value })} placeholder="連絡できる時間帯" aria-label={`連絡先${i + 1}の連絡できる時間帯`} className={input} />
                    <button type="button" onClick={() => setDraft({ ...draft, contacts: draft.contacts.filter((_, j) => j !== i) })} aria-label={`連絡先${i + 1}を消す`} className="rounded p-1 text-ink-faint hover:text-shu">
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
              <button type="button" onClick={() => setDraft({ ...draft, contacts: [...draft.contacts, emptyContact(draft.contacts.length === 0)] })} className={`${linkBtn} mt-1`}>
                <Plus size={12} />
                連絡先を足す
              </button>
            </div>

            <div>
              <h4 className="mb-1 text-xs font-bold text-ink-soft">家族</h4>
              <div className="space-y-1">
                {draft.family.map((m, i) => (
                  <div key={i} className="grid grid-cols-[6rem_1fr_4rem_auto_auto_8rem_1fr_auto] items-center gap-1.5">
                    <input value={m.relation} onChange={(e) => setFamily(i, { relation: e.target.value })} placeholder="続柄" aria-label={`家族${i + 1}の続柄`} className={input} />
                    <input value={m.name} onChange={(e) => setFamily(i, { name: e.target.value })} placeholder="名前（架空）" aria-label={`家族${i + 1}の名前`} className={input} />
                    <input value={m.age ?? ""} onChange={(e) => setFamily(i, { age: e.target.value === "" ? null : Number(e.target.value) })} placeholder="年齢" inputMode="numeric" aria-label={`家族${i + 1}の年齢`} className={`${input} text-right`} />
                    <label className="flex items-center gap-1 text-[11px] text-ink-soft">
                      <input type="checkbox" checked={m.cohabiting} onChange={(e) => setFamily(i, { cohabiting: e.target.checked })} />
                      同居
                    </label>
                    <label className="flex items-center gap-1 text-[11px] text-ink-soft">
                      <input type="checkbox" checked={m.keyPerson} onChange={(e) => setFamily(i, { keyPerson: e.target.checked })} />
                      キーパーソン
                    </label>
                    <input value={m.phone} onChange={(e) => setFamily(i, { phone: e.target.value })} placeholder="電話" inputMode="tel" aria-label={`家族${i + 1}の電話`} className={input} />
                    <input value={m.note} onChange={(e) => setFamily(i, { note: e.target.value })} placeholder="備考" aria-label={`家族${i + 1}の備考`} className={input} />
                    <button type="button" onClick={() => setDraft({ ...draft, family: draft.family.filter((_, j) => j !== i) })} aria-label={`家族${i + 1}を消す`} className="rounded p-1 text-ink-faint hover:text-shu">
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
              <button type="button" onClick={() => setDraft({ ...draft, family: [...draft.family, emptyFamily()] })} className={`${linkBtn} mt-1`}>
                <Plus size={12} />
                家族を足す
              </button>
            </div>

            <div>
              <h4 className="mb-1 text-xs font-bold text-ink-soft">公費・介護保険・かかりつけ</h4>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                <label className="text-[11px] text-ink-soft">
                  公費（制度名。複数は「・」で区切る）
                  <input value={draft.insurance.publicAid.join("・")} onChange={(e) => setDraft({ ...draft, insurance: { ...draft.insurance, publicAid: e.target.value.split(/[・,、]/) } })} placeholder="例：指定難病" className={input} />
                </label>
                <label className="text-[11px] text-ink-soft">
                  保険の備考（受付で見たもの）
                  <input value={draft.insurance.note} onChange={(e) => setDraft({ ...draft, insurance: { ...draft.insurance, note: e.target.value } })} placeholder="例：限度額適用認定証を確認" className={input} />
                </label>
                <label className="text-[11px] text-ink-soft">
                  介護保険（要介護度）
                  <select value={draft.care.careLevel} onChange={(e) => setDraft({ ...draft, care: { ...draft.care, careLevel: e.target.value as CareLevel } })} className={input}>
                    {CARE_LEVELS.map((l) => (
                      <option key={l} value={l}>
                        {l}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-[11px] text-ink-soft">
                  担当ケアマネジャー
                  <input value={draft.care.careManager} onChange={(e) => setDraft({ ...draft, care: { ...draft.care, careManager: e.target.value } })} placeholder="名前（架空）" className={input} />
                </label>
                <label className="text-[11px] text-ink-soft">
                  事業所
                  <input value={draft.care.careOffice} onChange={(e) => setDraft({ ...draft, care: { ...draft.care, careOffice: e.target.value } })} placeholder="例：架空市ケアプランセンター" className={input} />
                </label>
                <label className="text-[11px] text-ink-soft">
                  かかりつけ医（院名）
                  <input value={draft.care.familyDoctor} onChange={(e) => setDraft({ ...draft, care: { ...draft.care, familyDoctor: e.target.value } })} placeholder="例：架空町クリニック" className={input} />
                </label>
                <label className="text-[11px] text-ink-soft">
                  かかりつけ薬局
                  <input value={draft.care.pharmacy} onChange={(e) => setDraft({ ...draft, care: { ...draft.care, pharmacy: e.target.value } })} placeholder="例：架空薬局" className={input} />
                </label>
              </div>
            </div>

            {contacts && (
              <label className="block text-[11px] text-ink-soft">
                変更の理由（必ず）
                <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="例：長女から電話番号の変更の申し出" className={input} />
              </label>
            )}
            {problems.length > 0 && (
              <ul className="list-disc pl-5 text-xs text-shu">
                {problems.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            )}
            <div className="flex items-center gap-2">
              <button type="button" disabled={problems.length > 0} onClick={save} className="rounded bg-ink px-3 py-1 text-sm font-bold text-white disabled:opacity-40">
                {contacts ? "変更を保存" : "登録"}
              </button>
              <button type="button" onClick={() => setEdit(false)} className="text-xs text-ink-faint hover:text-ink">
                やめる
              </button>
              <span className="nums ml-auto text-[11px] text-ink-faint">
                {me.name}　今日 {nowTime}
              </span>
            </div>
            <p className="hint text-[11px] text-ink-faint">保存すると前の版が残り、誰が・いつ・なぜ変えたかが履歴に出ます。実在の人の名前・住所・電話は入れないでください（架空の病院の試作です）。</p>
          </div>
        )}
      </section>

      {/* 保険・制度 */}
      <section id="pi-insurance" aria-labelledby="pi-insurance-h" className="rounded-lg border border-rule bg-paper/50 p-3">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <h3 id="pi-insurance-h" className="text-sm font-bold">
            保険・制度
          </h3>
          <span className="ml-auto">{open("billing", "保険の登録（算定）を開く")}</span>
        </div>
        <dl>
          {insurance ? (
            <>
              <Row label="保険の種類" by={`${when(insurance.at)} ${insurance.by}（保険の登録・${insurance.action}）`}>
                <b>{insurance.insurance.kind}</b>
                <span className="ml-2 text-ink-soft">{insurance.insurance.relation}</span>
              </Row>
              <Row label="保険者番号・記号番号" by="保険の登録">
                <span className="nums">
                  {insurance.insurance.insurerNumber}　{[insurance.insurance.symbol, insurance.insurance.number, insurance.insurance.branch && `枝番 ${insurance.insurance.branch}`].filter(Boolean).join("・")}
                </span>
              </Row>
              <Row label="負担割合" by="保険の登録">
                <b className="nums">{insurance.insurance.rate / 10}割</b>
                <span className="ml-2 text-ink-soft">所得区分 {insurance.insurance.incomeClass}</span>
              </Row>
              <Row label="限度額の認定" by="保険の登録">
                {insurance.insurance.limitKnown ? "適用区分がわかっている（限度額適用認定証の提示、またはマイナ保険証での情報提供）" : <span className="text-yamabuki">わからない（認定証の提示かマイナ保険証での情報提供が要ります）</span>}
              </Row>
            </>
          ) : (
            <Row label="保険" by="未登録">
              <span className="text-yamabuki">未登録です。医事課が「算定」の保険の登録で入れます（それまで算定は年齢からの仮の保険で計算しています）。</span>
            </Row>
          )}
          <Row label="公費" by={regBy}>
            {contacts ? (contacts.insurance.publicAid.length ? contacts.insurance.publicAid.join("・") : "なし") : none}
          </Row>
          {contacts?.insurance.note && (
            <Row label="保険の備考" by={regBy}>
              {contacts.insurance.note}
            </Row>
          )}
          <Row label="介護保険" by={regBy}>
            {contacts ? contacts.care.careLevel : none}
            {anamnesis?.fields.careInsurance && <span className="ml-2 text-xs text-ink-faint">（情報収集では「{anamnesis.fields.careInsurance}」）</span>}
          </Row>
          <Row label="担当ケアマネジャー" by={regBy}>
            {contacts && (contacts.care.careManager || contacts.care.careOffice) ? [contacts.care.careManager, contacts.care.careOffice].filter(Boolean).join("　") : none}
          </Row>
          <Row label="かかりつけ医" by={regBy}>
            {text(contacts?.care.familyDoctor)}
          </Row>
          <Row label="かかりつけ薬局" by={regBy}>
            {text(contacts?.care.pharmacy)}
          </Row>
        </dl>
      </section>

      {/* 入院前の情報収集 */}
      <section id="pi-anamnesis" aria-labelledby="pi-anamnesis-h" className="rounded-lg border border-rule bg-paper/50 p-3">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <h3 id="pi-anamnesis-h" className="text-sm font-bold">
            入院前の情報収集（アナムネーシス）
          </h3>
          {anamnesis && (
            <span className="nums text-[11px] text-ink-faint">
              第{(anamnesis.earlier?.length ?? 0) + 1}版　{when(anamnesis.at)} {anamnesis.by}
            </span>
          )}
          <span className="ml-auto">{open("anamnesis", anamnesis ? "情報収集を開く" : "情報収集を始める")}</span>
        </div>
        {anamnesis ? (
          <div className="space-y-2">
            {ANAMNESIS_SECTIONS.map((s) => (
              <div key={s.title}>
                <h4 className="mb-0.5 text-xs font-bold text-ink-soft">{s.title}</h4>
                <dl>
                  {s.fields.map((x) => {
                    const v = answerText(anamnesis.fields, x.key);
                    return (
                      <Row key={x.key} label={x.label}>
                        {v ? <span className="whitespace-pre-wrap">{v}</span> : none}
                      </Row>
                    );
                  })}
                </dl>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-ink-soft">まだ聞き取っていません。入院のときに看護師が本人・家族から聞いて「情報収集」に書きます。</p>
        )}
      </section>

      {/* アレルギー・感染症・注意・事前指示 */}
      <section id="pi-alerts" aria-labelledby="pi-alerts-h" className="rounded-lg border border-rule bg-paper/50 p-3">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <h3 id="pi-alerts-h" className="text-sm font-bold">
            アレルギー・感染症・注意・事前指示
          </h3>
          <span className="ml-auto flex gap-1">
            {open("profile", "プロファイルを開く")}
            {open("directive", "事前指示を開く")}
          </span>
        </div>
        <dl>
          <Row label="アレルギー" by="プロファイル">
            {p.allergies.length ? <span className="text-shu">{p.allergies.join("、")}</span> : "なし"}
          </Row>
          <Row label="感染症" by="プロファイル">
            {p.infections.length ? <span className="text-fuji">{p.infections.join("、")}</span> : "なし"}
          </Row>
          <Row label="禁忌" by="プロファイル">
            {p.contraindications?.length ? <span className="text-shu">{p.contraindications.join("、")}</span> : "なし"}
          </Row>
          <Row label="注意" by="プロファイル・看護">
            {p.cautions.length ? <span className="text-yamabuki">{p.cautions.join("、")}</span> : "なし"}
          </Row>
          {p.pregnancy && (
            <Row label="妊娠中" by="医師・看護師">
              {p.pregnancy.weeks ? `${p.pregnancy.weeks}週` : "週数不明"}
            </Row>
          )}
          <Row label="事前指示" by={directive ? `${when(directive.decidedAt)} ${directive.by}${directive.discussedWith ? `（${directive.discussedWith}と）` : ""}` : "未確認"}>
            <b className={directive && directive.cpr !== "未確認" ? "text-shu" : "text-ink-faint"}>{bandLabel(directive)}</b>
          </Row>
        </dl>
      </section>

      {/* 登録の履歴 */}
      <section id="pi-history" aria-labelledby="pi-history-h" className="rounded-lg border border-rule bg-paper/50 p-3">
        <h3 id="pi-history-h" className="mb-1 text-sm font-bold">
          登録の履歴（連絡先・家族・公費・介護）
        </h3>
        {versions.length ? (
          <ol className="space-y-1 text-xs">
            {versions.map((v, i) => {
              const before = versions[i + 1];
              const changes = before ? contactsChanges(before, v) : [];
              return (
                <li key={`${v.registeredAt.day}-${v.registeredAt.time}-${i}`} className="border-b border-rule-soft pb-1 last:border-b-0">
                  <span className="nums">
                    第{versions.length - i}版　{when(v.registeredAt)} {v.registeredBy}
                  </span>
                  {v.reason && <span className="ml-2 text-ink-soft">理由：{v.reason}</span>}
                  {changes.length > 0 && (
                    <ul className="ml-4 list-disc text-ink-soft">
                      {changes.map((c) => (
                        <li key={c}>{c}</li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="text-xs text-ink-faint">まだ登録がありません。</p>
        )}
      </section>

      <footer className="space-y-1 text-[11px] text-ink-faint">
        <p>
          項目の並びは病院の電子カルテの仕様書に挙がる患者基本情報・患者プロファイルの項目に沿っています（
          {CONTACTS_SOURCES.map((s, i) => (
            <span key={s.url}>
              {i > 0 && "、"}
              <a href={s.url} target="_blank" rel="noreferrer" className="underline">
                {s.name}
              </a>
            </span>
          ))}
          ）。様式と、誰が登録・変更できるか（医事課・看護師・医師）は架空の病院の取り決めです。生年月日は、保険の登録がない患者では年齢から作った架空の日付です（{formatBirth(birth)} は {fmtDay(0)} 時点で {p.age}歳）。
        </p>
      </footer>
    </div>
  );
}

/** For the window's title bar: 「患者基本情報　佐倉 修」 */
export const patientInfoTitle = (p: Patient) => `患者基本情報　${p.name}`;
