"use client";

import { ExamCalendar } from "../ExamCalendar";
import { todayInTokyo, type CalendarDate } from "@/lib/dates";
import { firstExamSlot, takenExams, examSlotAvailable, type ExamPerson } from "@/lib/exam-slots";
import { defaultRoom, roomsFor, type RisDesk } from "@/lib/ris";
import { useMe } from "../RoleContext";
import { DoctorField, ImagingConsentPrint } from "../ImagingConsent";
import { consentDefaults } from "@/lib/imaging-consent";
import { Search } from "lucide-react";
import { useState } from "react";
import { TabChoice } from "../TabChoice";
import { consentFor as consentCodeFor, findConsent } from "@/lib/consent";
import type { Draft } from "@/lib/drafts";
import {
  CONSENT_FORMS,
  CONSENT_STATES,
  CONTRASTS,
  CONTRAST_RULES,
  CT_MODES,
  CT_PHASES,
  CT_RECONS,
  CT_SLICES_MM,
  EXAM_SOURCES,
  MODALITIES,
  MRI_SEQUENCES,
  REGION_GROUPS,
  SIDES,
  agentsFor,
  contrastFacts,
  defaultPosition,
  emptyConsent,
  emptyImaging,
  findAgent,
  findRegion,
  positionsFor,
  regionsFor,
  searchRegions,
  usesContrast,
  type ConsentForm,
  type Contrast,
  type CtMethod,
  type CtMode,
  type ExamPatientFacts,
  type ImagingDraft,
  type Modality,
  type MriSequence,
  type Position,
  type RegionGroup,
  type Side,
} from "@/lib/exams";
import { imagingDraftText } from "@/lib/format";
import type { DayOffset, OrderEntry } from "@/lib/types";

const field = "rounded border border-rule bg-sheet px-1.5 py-1 text-[13px] text-ink outline-none focus:border-ai";
const chip = (on: boolean, dashed = false) => `rounded-md border px-2 py-1 ${on ? "border-ai bg-ai font-bold text-white" : dashed ? "border-dashed border-rule text-ink-faint" : "border-rule hover:border-ai"}`;

const emptyCt = (): CtMethod => ({ mode: "通常", phases: [], sliceMm: null, recon: [], range: null });
const toggle = <T,>(xs: T[], x: T) => (xs.includes(x) ? xs.filter((y) => y !== x) : [...xs, x]);

/**
 * Imaging order: modality → group of the body (頭頸部／体幹／脊椎／上肢／下肢) or a word to search → region.
 * Picking a region fills in the standard views and position of the master; the doctor changes the side, the
 * position, the views (checked one by one), the contrast and method (CT・MRI), the contrast medium, the consent
 * and the conditions. The line below shows the order as it will read. Nothing is suggested: the master lists what
 * this hospital does, the doctor decides every item, and the checks on the draft (eGFR, allergy, metal, consent) stop
 * what is missing. `facts` and `activeOrders` (optional) let the panel show the contrast checks here as well.
 */
import { orderDefaults } from "@/lib/order-defaults";

export function AddImagingPanel({
  patientId = "",
  today = todayInTokyo(),
  examPeople = [],
  ris = {},
  onAdd,
  newId,
  facts = null,
  activeOrders = [],
  fmtDay = (d: DayOffset) => (d === 0 ? "今日" : d < 0 ? `${-d}日前` : `${d}日後`),
  doctor,
}: {
  patientId?: string;
  today?: CalendarDate;
  examPeople?: ExamPerson[];
  ris?: RisDesk;
  onAdd: (d: Draft) => void;
  newId: () => string;
  facts?: ExamPatientFacts | null;
  activeOrders?: OrderEntry[];
  fmtDay?: (d: DayOffset) => string;
  /** The name put in 「説明した医師」 when the consent was taken by the person ordering. */
  doctor?: string;
}) {
  const me = useMe();
  const explainingDoctor = doctor || me.name;
  const [modality, setModality] = useState<Modality>("X線");
  const [room, setRoom] = useState(defaultRoom("X線"));
  const taken = takenExams(examPeople, room, ris);
  const [group, setGroup] = useState<RegionGroup>("体幹");
  const [query, setQuery] = useState("");
  const [d, setD] = useState<ImagingDraft>(() => {
    const draft = emptyImaging("preview", "X線");
    const now = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit" }).format(new Date());
    const time = orderDefaults(patientId, "定期", now).imagingTime;
    return time ? { ...draft, when: { day: 0, time: null, priority: "至急" } } : { ...draft, when: firstExamSlot("XR1", takenExams(examPeople, "XR1", ris), today) };
  });
  const patch = (p: Partial<ImagingDraft>) => setD((x) => ({ ...x, ...p }));

  const region = d.region ? findRegion(d.region) : undefined;
  const xray = modality === "X線" || modality === "ポータブルX線";
  const tomo = modality === "CT" || modality === "MRI";
  const groups = REGION_GROUPS.filter((g) => regionsFor(modality).some((r) => r.group === g));
  const shown = query.trim() ? searchRegions(modality, query) : regionsFor(modality).filter((r) => r.group === group);
  const contrast = usesContrast(d);
  const consentCode = tomo && contrast ? consentCodeFor({ type: "imaging", modality, contrast: d.contrast ?? "造影" }) : null;
  const f = tomo && contrast ? contrastFacts(modality, facts, activeOrders, fmtDay) : null;

  const pickModality = (m: Modality) => {
    setModality(m);
    const nextRoom = defaultRoom(m);
    setRoom(nextRoom);
    setQuery("");
    setD({ ...emptyImaging("preview", m), purpose: d.purpose, comment: d.comment, when: d.when.priority === "至急" ? d.when : firstExamSlot(nextRoom, takenExams(examPeople, nextRoom, ris), today) });
    if (!regionsFor(m).some((r) => r.group === group)) setGroup(REGION_GROUPS.find((g) => regionsFor(m).some((r) => r.group === g))!);
  };
  const pickRegion = (code: string) => {
    const r = findRegion(code)!;
    patch({
      region: code,
      regionSaid: "",
      side: r.sided ? d.side : null,
      views: xray ? [...(r.defaultViews ?? [])] : null,
      position: defaultPosition(modality, r),
      ct: modality === "CT" ? (d.ct ?? emptyCt()) : null,
      mri: modality === "MRI" ? (d.mri ?? { sequences: [] }) : null,
    });
  };
  const setContrast = (c: Contrast) => patch({ contrast: c, agent: c === "単純" ? null : d.agent, consent: c === "単純" ? null : (d.consent ?? emptyConsent()) });
  const setMode = (mode: CtMode) => {
    const ct = { ...(d.ct ?? emptyCt()), mode, phases: mode === "ダイナミック" ? (d.ct?.phases ?? []) : [] };
    // CTA and dynamic use a contrast medium; the doctor still picks which contrast line (造影／単純＋造影).
    const c: Contrast | null = mode === "CTA（血管）" ? (d.contrast && d.contrast !== "単純" ? d.contrast : "造影") : mode === "ダイナミック" ? (d.contrast && d.contrast !== "単純" ? d.contrast : "単純＋造影") : d.contrast;
    patch({ ct, contrast: c, consent: c && c !== "単純" ? (d.consent ?? emptyConsent()) : d.consent });
  };

  const missing = [!examSlotAvailable(room, d.when, taken, today) && "空き枠", !d.region && "部位", region?.sided && !d.side && "左右", xray && d.region && !d.views?.length && "方向（1つ以上）", tomo && d.region && !d.contrast && "単純か造影か"].filter(Boolean) as string[];
  const preview = d.region ? imagingDraftText({ ...d, modality }) : "";

  return (
    <div className="space-y-3 text-[13px]">
      <div role="radiogroup" aria-label="種類" className="flex flex-wrap gap-1">
        {MODALITIES.map((m) => (
          <button key={m} type="button" role="radio" aria-checked={modality === m} onClick={() => pickModality(m)} className={`rounded-md border px-3 py-1.5 ${modality === m ? "border-ai bg-ai font-bold text-white" : "border-rule text-ink-soft hover:border-ai"}`}>
            {m}
          </button>
        ))}
      </div>

      {/* 部位：区分か検索 → 部位 */}
      <section>
        <div className="flex flex-wrap items-center gap-2">
          <TabChoice label="部位の区分" options={groups.map((g) => ({ value: g, label: g }))} value={query.trim() ? null : group} onChange={(g) => { setGroup(g); setQuery(""); }} />
          <label className="flex items-center gap-1 rounded-md border border-rule bg-sheet px-2 py-1">
            <Search size={14} className="text-ink-faint" aria-hidden />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="部位を検索（手関節・ひざ）" aria-label="部位を検索" className="w-40 bg-transparent text-[13px] outline-none" />
          </label>
        </div>
        <div className="mt-1.5 grid grid-cols-3 gap-1.5" role="listbox" aria-label={`部位（${modality}）`}>
          {shown.map((r) => (
            <button key={r.code} type="button" role="option" aria-selected={d.region === r.code} onClick={() => pickRegion(r.code)} className={`rounded-md border px-2 py-2 ${d.region === r.code ? "border-ai bg-ai-soft font-bold text-ai" : "border-rule hover:border-ai"}`}>
              {r.name}
              {r.sided && <span className="ml-1 text-[10px] font-normal text-ink-faint">左右</span>}
            </button>
          ))}
          {shown.length === 0 && <p className="col-span-3 text-xs text-ink-faint">「{query}」に当たる部位は、{modality}のマスターにありません。</p>}
        </div>
      </section>

      {region && (
        <section className="space-y-2 rounded-md border border-rule bg-paper/60 p-2">
          {region.sided && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="w-14 text-xs font-bold text-ink-soft">左右</span>
              <div role="radiogroup" aria-label="左右" className="flex gap-1">
                {SIDES.map((s: Side) => (
                  <button key={s} type="button" role="radio" aria-checked={d.side === s} onClick={() => patch({ side: s })} className={chip(d.side === s)}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-14 text-xs font-bold text-ink-soft">体位</span>
            <div role="radiogroup" aria-label="体位" className="flex flex-wrap gap-1">
              {positionsFor(modality).map((p: Position) => (
                <button key={p} type="button" role="radio" aria-checked={d.position === p} onClick={() => patch({ position: p })} className={chip(d.position === p)}>
                  {p}
                </button>
              ))}
              {modality === "ポータブルX線" && <span className="self-center text-xs text-ink-faint">病室で撮影</span>}
            </div>
          </div>
          {xray && region.views && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="w-14 text-xs font-bold text-ink-soft">方向</span>
              <div role="group" aria-label="方向" className="flex flex-wrap gap-1">
                {region.views.map((v) => {
                  const on = d.views?.includes(v) ?? false;
                  return (
                    <button key={v} type="button" aria-pressed={on} onClick={() => patch({ views: toggle(d.views ?? [], v) })} className={chip(on)}>
                      {v}
                    </button>
                  );
                })}
              </div>
              <span className="nums text-xs text-ink-soft">{d.views?.length ?? 0}方向</span>
            </div>
          )}

          {tomo && (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <span className="w-14 text-xs font-bold text-ink-soft">造影</span>
                <div role="radiogroup" aria-label="造影" className="flex flex-wrap gap-1">
                  {CONTRASTS.map((c) => (
                    <button key={c} type="button" role="radio" aria-checked={d.contrast === c} onClick={() => setContrast(c)} className={chip(d.contrast === c)}>
                      {c}
                    </button>
                  ))}
                </div>
              </div>
              {modality === "CT" && (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="w-14 text-xs font-bold text-ink-soft">方法</span>
                    <div role="radiogroup" aria-label="撮影の方法" className="flex flex-wrap gap-1">
                      {CT_MODES.map((m) => (
                        <button key={m} type="button" role="radio" aria-checked={d.ct?.mode === m} onClick={() => setMode(m)} className={chip(d.ct?.mode === m)}>
                          {m}
                        </button>
                      ))}
                    </div>
                  </div>
                  {d.ct?.mode === "ダイナミック" && (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="w-14 text-xs font-bold text-ink-soft">相</span>
                      <div role="group" aria-label="相" className="flex flex-wrap gap-1">
                        {CT_PHASES.map((p) => (
                          <button key={p} type="button" aria-pressed={d.ct?.phases.includes(p)} onClick={() => patch({ ct: { ...d.ct!, phases: toggle(d.ct!.phases, p) } })} className={chip(!!d.ct?.phases.includes(p))}>
                            {p}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="w-14 text-xs font-bold text-ink-soft">条件</span>
                    <label className="flex items-center gap-1 text-xs">
                      スライス厚
                      <select value={d.ct?.sliceMm ?? ""} onChange={(e) => patch({ ct: { ...(d.ct ?? emptyCt()), sliceMm: e.target.value ? Number(e.target.value) : null } })} aria-label="スライス厚" className={field}>
                        <option value="">放射線部に任せる</option>
                        {CT_SLICES_MM.map((s) => (
                          <option key={s} value={s}>
                            {s} mm
                          </option>
                        ))}
                      </select>
                    </label>
                    <div role="group" aria-label="再構成" className="flex flex-wrap gap-1">
                      {CT_RECONS.map((r) => (
                        <button key={r} type="button" aria-pressed={d.ct?.recon.includes(r)} onClick={() => patch({ ct: { ...(d.ct ?? emptyCt()), recon: toggle(d.ct?.recon ?? [], r) } })} className={chip(!!d.ct?.recon.includes(r))}>
                          {r}
                        </button>
                      ))}
                    </div>
                    <input value={d.ct?.range ?? ""} onChange={(e) => patch({ ct: { ...(d.ct ?? emptyCt()), range: e.target.value || null } })} placeholder="範囲（例：横隔膜上〜恥骨結合）" aria-label="撮影の範囲" className={`${field} w-56`} />
                  </div>
                </>
              )}
              {modality === "MRI" && (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="w-14 text-xs font-bold text-ink-soft">撮像</span>
                    <div role="group" aria-label="撮像" className="flex flex-wrap gap-1">
                      {MRI_SEQUENCES.map((s: MriSequence) => (
                        <button key={s} type="button" aria-pressed={d.mri?.sequences.includes(s)} onClick={() => patch({ mri: { sequences: toggle(d.mri?.sequences ?? [], s) } })} className={chip(!!d.mri?.sequences.includes(s))}>
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="w-14 text-xs font-bold text-ink-soft">磁性体</span>
                    <div role="radiogroup" aria-label="ペースメーカー・体内金属" className="flex flex-wrap gap-1">
                      {["なし（確認済み）", "あり（MRI 対応を確認済み）"].map((a) => (
                        <button key={a} type="button" role="radio" aria-checked={d.answers.metal === a} onClick={() => patch({ answers: { ...d.answers, metal: a } })} className={chip(d.answers.metal === a)}>
                          ペースメーカー・体内金属：{a}
                        </button>
                      ))}
                    </div>
                    <div role="radiogroup" aria-label="閉所恐怖" className="flex flex-wrap gap-1">
                      {["閉所恐怖なし", "閉所恐怖あり（放射線部に伝える）"].map((a) => (
                        <button key={a} type="button" role="radio" aria-checked={d.answers.claustrophobia === a} onClick={() => patch({ answers: { ...d.answers, claustrophobia: a } })} className={chip(d.answers.claustrophobia === a)}>
                          {a}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
              {contrast && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="w-14 text-xs font-bold text-ink-soft">造影剤</span>
                  <select value={d.agent?.code ?? ""} onChange={(e) => patch({ agent: e.target.value ? { code: e.target.value, mL: findAgent(e.target.value)?.mlOptions[0] ?? null } : null })} aria-label="造影剤" className={field}>
                    <option value="">放射線部に任せる</option>
                    {agentsFor(modality).map((a) => (
                      <option key={a.code} value={a.code}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                  {d.agent && (
                    <select value={d.agent.mL ?? ""} onChange={(e) => patch({ agent: { ...d.agent!, mL: e.target.value ? Number(e.target.value) : null } })} aria-label="量" className={field}>
                      <option value="">量は放射線部に任せる</option>
                      {(findAgent(d.agent.code)?.mlOptions ?? []).map((m) => (
                        <option key={m} value={m}>
                          {m} mL
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}
            </>
          )}

          {/* 造影の前の確認（カルテから。判断は医師） */}
          {f && (
            <div className="rounded border border-rule-soft bg-sheet p-2 text-xs">
              <b>造影の前の確認（カルテから）</b>
              <ul className="mt-1 space-y-0.5">
                <li className={f.egfrLow || f.stale || f.egfr === null ? "font-bold text-shu" : ""}>
                  腎機能：{f.egfrText}
                  {f.egfrLow && `　eGFR ${CONTRAST_RULES.egfrAsk} 未満`}
                  {f.stale && `　Cre の測定から ${CONTRAST_RULES.creStaleDays} 日超`}
                </li>
                <li className={f.allergy ? "font-bold text-shu" : ""}>{f.agent}のアレルギー歴：{f.allergy ?? "カルテに記載なし"}</li>
                <li className={f.asthma ? "font-bold text-shu" : ""}>喘息：{f.asthma ?? "カルテに記載なし"}</li>
                {modality === "CT" && <li className={f.biguanides.length ? "font-bold text-yamabuki" : ""}>ビグアナイド系の内服：{f.biguanides.length ? `${f.biguanides.join("、")}（造影の前後の一時休薬の案内。休薬の要否と日数は医師が決めます）` : "内服オーダになし"}</li>}
                {facts && facts.sex === "女" && facts.age >= 12 && facts.age <= 55 && <li>妊娠の可能性：下書きの確認で答えます</li>}
                {!facts && <li className="text-ink-faint">患者の値が渡されていないときは、下書きの確認で出ます。</li>}
              </ul>
              <p className="hint mt-1 text-[11px] text-ink-faint">
                eGFR はコードで計算（日本腎臓学会の推算式）。閾値 {CONTRAST_RULES.egfrAsk}  は院内の確認基準です。指針（ヨード：{EXAM_SOURCES.iodine.label}、ガドリニウム：{EXAM_SOURCES.gadolinium.label}）は eGFR {CONTRAST_RULES.egfrGuideline} 未満を特に注意としています。ビグアナイドの案内の出典：{EXAM_SOURCES.biguanide.label}。
              </p>
            </div>
          )}

          {/* 造影剤使用の説明と同意 */}
          {contrast && consentCode && (
            <div className="rounded border border-rule-soft bg-sheet p-2 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <b>造影剤使用の説明と同意</b><ImagingConsentPrint draft={d} />
                <div role="radiogroup" aria-label="同意の取得" className="flex gap-1">
                  {CONSENT_STATES.map((s) => (
                    <button key={s} type="button" role="radio" aria-checked={(d.consent?.state ?? "未取得") === s} onClick={() => patch({ consent: consentDefaults(d.consent, s, explainingDoctor, new Date()) })} className={chip((d.consent?.state ?? "未取得") === s)}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
              {d.consent?.state === "取得済み" && (
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <input value={d.consent.at ?? ""} onChange={(e) => patch({ consent: { ...d.consent!, at: e.target.value || null } })} placeholder="取得日時（例：11/3 15:00）" aria-label="取得日時" className={`${field} w-40`} />
                  <DoctorField value={d.consent.by ?? ""} onChange={(by) => patch({ consent: { ...d.consent!, by: by || null } })} />
                  <select value={d.consent.form ?? ""} onChange={(e) => patch({ consent: { ...d.consent!, form: (e.target.value || null) as ConsentForm | null } })} aria-label="同意書の有無・保管" className={field}>
                    <option value="">同意書の有無・保管</option>
                    {CONSENT_FORMS.map((x) => (
                      <option key={x} value={x}>
                        {x}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {d.consent?.state === "同意しない" && <input value={d.consent.reason ?? ""} onChange={(e) => patch({ consent: { ...d.consent!, reason: e.target.value || null } })} placeholder="同意しない理由" aria-label="同意しない理由" className={`${field} mt-1 w-full`} />}
              {(d.consent?.state ?? "未取得") === "未取得" && <p className="mt-1 text-ink-soft">未取得のままでも下書きにできます。確定の前の確認で「同意書を用意する」を選ぶと、様式「{findConsent(consentCode).title}」の下書きが同意書の一覧（右端ツール「同意書」）にできます。</p>}
              {d.consent?.state === "同意しない" && <p className="mt-1 font-bold text-shu">同意がないと造影のオーダは確定できません。単純に変えるか、下書きを消します。</p>}
            </div>
          )}

          <label className="flex flex-col gap-1 text-xs text-ink-soft">
            条件の備考（荷重位・機能撮影・体幹の固定 など）
            <input value={d.note ?? ""} onChange={(e) => patch({ note: e.target.value || null })} placeholder="例：荷重位で。体幹の固定あり" className={field} />
          </label>
        </section>
      )}

      {roomsFor(modality).length > 1 ? <label>撮影室<select value={room} onChange={(e) => { const r = roomsFor(modality).find((r) => r.key === e.target.value)!; setRoom(r.key); patch({ when: firstExamSlot(r.key, takenExams(examPeople, r.key, ris), today) }); }}>{roomsFor(modality).map((r) => <option key={r.key} value={r.key}>{r.room}</option>)}</select></label> : <p>{roomsFor(modality)[0].room}</p>}
      <ExamCalendar key={room} kind={room} today={today} taken={taken} value={d.when} onChange={(when) => patch({ when })} />

      <label className="flex flex-col gap-1 text-xs text-ink-soft">
        目的（臨床診断・知りたいこと）
        <input value={d.purpose ?? ""} onChange={(e) => patch({ purpose: e.target.value || null })} placeholder="例：肺炎の経過" className={field} />
      </label>

      {preview && (
        <p className="rounded-md border border-ai/40 bg-ai-soft/40 px-2 py-1.5 font-bold text-ink" aria-label="オーダの文">
          {preview}
        </p>
      )}
      <button type="button" disabled={missing.length > 0} onClick={() => { if (missing.length) return; onAdd({ ...d, id: newId(), modality, purpose: d.purpose?.trim() || null, note: d.note?.trim() || null }); }} className="w-full rounded-md bg-ai px-3 py-2 text-sm font-bold text-white disabled:opacity-40">
        保存する{missing.length > 0 && `（${missing.join("・")}を選ぶ）`}
      </button>
      <p className="hint text-[11px] text-ink-faint">
        部位を選ぶと、マスターの標準の方向と体位が入ります。変えるときは押し直します。日時はここでも選べます。移動・読影は右の下書きで選びます。造影なら腎機能・造影剤アレルギー・喘息・ビグアナイド・同意、MRI なら体内金属の確認が下書きに出ます。{EXAM_SOURCES.naming}
        造影剤の一般名と量は院内の採用品から選び、製品と本数は放射線部が記録します。
      </p>
    </div>
  );
}
