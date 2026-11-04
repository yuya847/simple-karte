"use client";

// 患者プロファイル: allergies, infections, contraindications, blood type, height and weight, and help needed,
// each changed with who and when (the change log keeps every version). Who may change what follows
// roles.ts (架空の病院の取り決め).

import { Trash2 } from "lucide-react";
import { useState } from "react";
import {
  ALLERGY_TYPES,
  BODY_JUMP,
  BODY_LIMITS,
  CARE_CHOICES,
  CARE_KEYS,
  LIST_LABEL,
  PROFILE_ACTION,
  PROFILE_SOURCES,
  allergyText,
  applyProfile,
  bloodChanged,
  bloodText,
  bodyProblems,
  careNow,
  checkedBy,
  itemProblems,
  lastChange,
  listItems,
  profileHistory,
  type AllergyType,
  type ListKind,
  type ProfileChange,
  type ProfileInput,
} from "@/lib/profile";
import type { Patient } from "@/lib/types";
import { DenyNote, useDeny } from "../RoleContext";



const ALLERGENS = ["NSAIDs", "解熱鎮痛薬", "ペニシリン系", "セフェム系", "ヨード造影剤", "ガドリニウム造影剤", "ラテックス", "卵", "牛乳", "小麦", "そば", "落花生", "えび", "かに"];
const REACTIONS = ["蕁麻疹", "発疹", "喘息発作", "呼吸困難", "アナフィラキシー", "嘔吐", "血圧低下"];
const INFECTIONS = ["MRSA", "ESBL産生菌", "CRE（カルバペネム耐性腸内細菌目細菌）", "MDRP（多剤耐性緑膿菌）", "CD（クロストリディオイデス・ディフィシル）", "HBV", "HCV", "HIV", "梅毒", "結核", "インフルエンザ", "COVID-19", "疥癬", "ノロウイルス"];

const input = "rounded border border-rule bg-sheet px-1.5 py-0.5 text-[13px] outline-none focus:border-ai";

export function ProfilePanel({ base, log, fmtDay, onChange }: { base: Patient; log: ProfileChange[]; fmtDay: (d: number) => string; onChange: (c: ProfileInput) => void }) {
  const deny = useDeny();
  const now = applyProfile(base, log);
  const when = (at: { day: number; time: string }) => `${at.day === 0 ? "今日" : fmtDay(at.day)} ${at.time}`;
  const history = profileHistory(base, log);

  return (
    <div className="space-y-4 text-[13px]">
      <p className="hint text-xs text-ink-soft">ここで登録・変更すると、患者の帯・病棟マップ・ラベル・食事の一覧と、オーダの確認（アレルギー）にすぐ反映されます。変更は消えずに下の「変更の履歴」に残ります。</p>

      <ListSection kind="allergy" base={base} log={log} when={when} onChange={onChange} denied={deny(PROFILE_ACTION.allergy)} />
      <ListSection kind="infection" base={base} log={log} when={when} onChange={onChange} denied={deny(PROFILE_ACTION.infection)} />
      <ListSection kind="contra" base={base} log={log} when={when} onChange={onChange} denied={deny(PROFILE_ACTION.contra)} />

      <BloodSection now={now} last={lastChange(log, base.id, "blood")} when={when} onChange={onChange} denied={deny(PROFILE_ACTION.blood)} />
      <BodySection now={now} last={lastChange(log, base.id, "body")} when={when} onChange={onChange} denied={deny(PROFILE_ACTION.body)} />
      <CareSection log={log} patientId={base.id} when={when} onChange={onChange} denied={deny(PROFILE_ACTION.care)} />

      <section>
        <h3 className="mb-1 text-sm font-bold">変更の履歴</h3>
        {history.length === 0 ? (
          <p className="text-xs text-ink-faint">この患者のプロファイルはまだ変えていません（いまの内容は架空の記録です）。</p>
        ) : (
          <ol className="space-y-1 border-l-2 border-rule pl-2 text-[12px]">
            {history.map(({ change, text }) => (
              <li key={change.id}>
                <span className="nums text-ink-faint">
                  {when(change.at)} {change.by}（{change.role}）
                </span>
                <div>{text}</div>
              </li>
            ))}
          </ol>
        )}
      </section>

      <p className="hint text-[10px] text-ink-faint">
        誰が何を登録・変更するか、身長・体重の範囲と「前回との差が大きい」の目安、介助の選択肢は架空の病院の取り決めです。項目の根拠：
        {PROFILE_SOURCES.map((s, i) => (
          <a key={s.url} href={s.url} target="_blank" rel="noreferrer" className="underline">
            {i > 0 ? "、" : ""}
            {s.name}
          </a>
        ))}
      </p>
    </div>
  );
}

function Head({ title, denied, action }: { title: string; denied: string | null; action: Parameters<typeof DenyNote>[0]["action"] }) {
  return (
    <div className="mb-1 flex flex-wrap items-center gap-2">
      <h3 className="text-sm font-bold">{title}</h3>
      {denied && <DenyNote action={action} />}
    </div>
  );
}

function ListSection({ kind, base, log, when, onChange, denied }: { kind: ListKind; base: Patient; log: ProfileChange[]; when: (at: { day: number; time: string }) => string; onChange: (c: ProfileInput) => void; denied: string | null }) {
  const items = listItems(base, log, kind);
  const [type, setType] = useState<AllergyType>("薬");
  const [what, setWhat] = useState("");
  const [extra, setExtra] = useState("");
  const [removing, setRemoving] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const text = kind === "allergy" ? allergyText(type, what, extra) : what.trim() ? (extra.trim() ? `${what.trim()}（${extra.trim()}）` : what.trim()) : "";
  const problems = itemProblems(kind, text, items.map((i) => i.text));
  const reach = text ? checkedBy(kind === "contra" ? `禁忌：${text}` : text) : [];
  const tone = kind === "infection" ? "border-fuji/30 bg-fuji-soft/40" : "border-shu/30 bg-shu-soft/40";
  return (
    <section>
      <Head title={LIST_LABEL[kind]} denied={denied} action={PROFILE_ACTION[kind]} />
      <ul className="space-y-1">
        {items.map((i) => {
          const by = kind === "infection" ? [] : checkedBy(i.text);
          return (
            <li key={i.text} className={`rounded-md border px-2 py-1 ${tone}`}>
              <div className="flex items-center gap-2">
                <b>{i.text}</b>
                <span className="nums text-[11px] text-ink-faint">{i.since ? `${when(i.since.at)} ${i.since.by}` : "前からの記録（架空）"}</span>
                {!denied && removing !== i.text && (
                  <button type="button" onClick={() => (setRemoving(i.text), setReason(""))} aria-label={`${i.text}を外す`} title="外す（理由を書きます）" className="ml-auto rounded p-1 text-ink-faint hover:bg-sheet hover:text-shu">
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
              {kind !== "infection" && (
                <div className="text-[11px] text-ink-soft">{by.length ? `オーダの確認に使われます：${by.join("、")}` : "オーダの確認に当たる言葉がありません（帯と一覧の表示だけ）"}</div>
              )}
              {removing === i.text && (
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="外す理由（例：本人に再確認、誤登録）" aria-label="外す理由" className={`${input} min-w-48 flex-1`} />
                  <button type="button" onClick={() => setRemoving(null)} className="rounded border border-rule px-2 py-0.5 text-[11px]">
                    やめる
                  </button>
                  <button
                    type="button"
                    disabled={!reason.trim()}
                    onClick={() => {
                      onChange({ kind, op: "削除", text: i.text, reason: reason.trim() });
                      setRemoving(null);
                    }}
                    className="rounded bg-shu px-2 py-0.5 text-[11px] font-bold text-white disabled:opacity-40"
                  >
                    外す
                  </button>
                </div>
              )}
            </li>
          );
        })}
        {items.length === 0 && <li className="text-xs text-ink-faint">なし</li>}
      </ul>
      {!denied && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 rounded-md border border-dashed border-rule px-2 py-1.5">
          {kind === "allergy" && (
            <select value={type} onChange={(e) => setType(e.target.value as AllergyType)} aria-label="アレルギーの区分" className={input}>
              {ALLERGY_TYPES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          )}
          <input
            value={what}
            onChange={(e) => setWhat(e.target.value)}
            list={`profile-${kind}-what`}
            placeholder={kind === "allergy" ? "物質・薬の分類（例：NSAIDs）" : kind === "infection" ? "感染症（例：MRSA）" : "禁忌（例：NSAIDs、MRI）"}
            aria-label={`${LIST_LABEL[kind]}の内容`}
            className={`${input} w-48`}
          />
          <input
            value={extra}
            onChange={(e) => setExtra(e.target.value)}
            list={kind === "allergy" ? "profile-allergy-reaction" : undefined}
            placeholder={kind === "allergy" ? "症状（例：蕁麻疹）" : kind === "infection" ? "検体・部位（例：血液）" : "理由（例：腎機能低下、ペースメーカー）"}
            aria-label={kind === "allergy" ? "症状" : kind === "infection" ? "検体・部位" : "禁忌の理由"}
            className={`${input} w-44`}
          />
          <button
            type="button"
            disabled={problems.length > 0}
            onClick={() => {
              onChange({ kind, op: "追加", text });
              setWhat("");
              setExtra("");
            }}
            className="rounded bg-ink px-2 py-0.5 text-[12px] font-bold text-white disabled:opacity-30"
          >
            登録
          </button>
          {text && <span className="w-full text-[11px] text-ink-soft">登録される文：{kind === "contra" ? `禁忌 ${text}` : text}{kind !== "infection" && `　${reach.length ? `→ オーダの確認に使われます：${reach.join("、")}` : "→ オーダの確認に当たる言葉がありません"}`}</span>}
          {text && problems.length > 0 && <span className="w-full text-[11px] text-yamabuki">{problems.join(" ")}</span>}
          {kind === "allergy" && <span className="hint w-full text-[11px] text-ink-faint">薬は分類名（NSAIDs・解熱鎮痛薬など）で書くと、内服のオーダで確認が出ます。造影剤は「造影剤」を含めると造影の画像検査で確認が出ます。</span>}
          <datalist id={`profile-${kind}-what`}>
            {(kind === "allergy" ? ALLERGENS : kind === "infection" ? INFECTIONS : ["NSAIDs", "ヨード造影剤", "ガドリニウム造影剤", "MRI"]).map((x) => (
              <option key={x} value={x} />
            ))}
          </datalist>
          {kind === "allergy" && (
            <datalist id="profile-allergy-reaction">
              {REACTIONS.map((x) => (
                <option key={x} value={x} />
              ))}
            </datalist>
          )}
        </div>
      )}
    </section>
  );
}

function BloodSection({ now, last, when, onChange, denied }: { now: Patient; last?: Extract<ProfileChange, { kind: "blood" }>; when: (at: { day: number; time: string }) => string; onChange: (c: ProfileInput) => void; denied: string | null }) {
  const [abo, setAbo] = useState<"A" | "B" | "O" | "AB">(now.blood?.abo ?? "A");
  const [rh, setRh] = useState<"+" | "-">(now.blood?.rh ?? "+");
  const [checks, setChecks] = useState(now.blood?.checks ?? 1);
  const [antibody, setAntibody] = useState<"陰性" | "陽性" | "">(now.blood?.antibody ?? "");
  const [reason, setReason] = useState("");
  const [open, setOpen] = useState(false);
  const next = { abo, rh, checks, ...(antibody ? { antibody } : {}) };
  const changed = bloodChanged(now.blood, next);
  return (
    <section>
      <Head title="血液型" denied={denied} action={PROFILE_ACTION.blood} />
      <div className="flex flex-wrap items-center gap-2">
        <b className="nums">{bloodText(now.blood)}</b>
        <span className="nums text-[11px] text-ink-faint">{last ? `${when(last.at)} ${last.by}` : "前からの記録（架空）"}</span>
        {!denied && !open && (
          <button type="button" onClick={() => setOpen(true)} className="ml-auto rounded border border-rule px-2 py-0.5 text-[11px]">
            登録・変更
          </button>
        )}
      </div>
      <p className="hint text-[11px] text-ink-faint">輸血のオーダは、ここの血液型と「確認した検体の数」（別々に採った検体で2回）を確かめます。</p>
      {open && !denied && (
        <div className="mt-1 flex flex-wrap items-center gap-1.5 rounded-md border border-dashed border-rule px-2 py-1.5">
          <select value={abo} onChange={(e) => setAbo(e.target.value as typeof abo)} aria-label="ABO" className={input}>
            {(["A", "B", "O", "AB"] as const).map((x) => (
              <option key={x} value={x}>
                {x}型
              </option>
            ))}
          </select>
          <select value={rh} onChange={(e) => setRh(e.target.value as typeof rh)} aria-label="RhD" className={input}>
            <option value="+">Rh(+)</option>
            <option value="-">Rh(−)</option>
          </select>
          <label className="flex items-center gap-1 text-[12px]">
            確認した検体
            <select value={checks} onChange={(e) => setChecks(Number(e.target.value))} aria-label="確認した検体の数" className={input}>
              <option value={1}>1回</option>
              <option value={2}>2回</option>
            </select>
          </label>
          <label className="flex items-center gap-1 text-[12px]">
            不規則抗体
            <select value={antibody} onChange={(e) => setAntibody(e.target.value as typeof antibody)} aria-label="不規則抗体" className={input}>
              <option value="">未検査</option>
              <option value="陰性">陰性</option>
              <option value="陽性">陽性</option>
            </select>
          </label>
          {changed && (
            <span className="w-full text-[11px] font-bold text-shu">
              登録済みの血液型（{now.blood?.abo}型 Rh({now.blood?.rh === "+" ? "+" : "−"})）と違います。理由を書いてください。
              <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="理由（例：検査結果の転記を誤った）" aria-label="血液型を変える理由" className={`${input} ml-1 w-64 font-normal`} />
            </span>
          )}
          <button type="button" onClick={() => setOpen(false)} className="ml-auto rounded border border-rule px-2 py-0.5 text-[11px]">
            やめる
          </button>
          <button
            type="button"
            disabled={changed && !reason.trim()}
            onClick={() => {
              onChange({ kind: "blood", blood: next, ...(changed ? { reason: reason.trim() } : {}) });
              setOpen(false);
              setReason("");
            }}
            className="rounded bg-ink px-2 py-0.5 text-[12px] font-bold text-white disabled:opacity-30"
          >
            登録
          </button>
        </div>
      )}
    </section>
  );
}

function BodySection({ now, last, when, onChange, denied }: { now: Patient; last?: Extract<ProfileChange, { kind: "body" }>; when: (at: { day: number; time: string }) => string; onChange: (c: ProfileInput) => void; denied: string | null }) {
  const [h, setH] = useState(String(now.heightCm));
  const [w, setW] = useState(String(now.weightKg));
  const [ok, setOk] = useState(false);
  const hn = Number(h.normalize("NFKC"));
  const wn = Number(w.normalize("NFKC"));
  const pr = bodyProblems(hn, wn, now);
  const same = hn === now.heightCm && wn === now.weightKg;
  return (
    <section>
      <Head title="身長・体重" denied={denied} action={PROFILE_ACTION.body} />
      <div className="flex flex-wrap items-center gap-2">
        <b className="nums">
          {now.heightCm}cm・{now.weightKg}kg
        </b>
        <span className="nums text-[11px] text-ink-faint">{last ? `${when(last.at)} ${last.by}` : "前からの記録（架空）"}</span>
      </div>
      <p className="hint text-[11px] text-ink-faint">帯の BMI・推定CCr、注射の体重あたりの量、テンプレートの計算はこの値を使います。</p>
      {!denied && (
        <div className="mt-1 flex flex-wrap items-center gap-1.5 rounded-md border border-dashed border-rule px-2 py-1.5">
          <label className="flex items-center gap-1">
            身長
            <input value={h} onChange={(e) => (setH(e.target.value), setOk(false))} inputMode="decimal" aria-label="身長" className={`${input} nums w-16 text-right`} />
            cm
          </label>
          <label className="flex items-center gap-1">
            体重
            <input value={w} onChange={(e) => (setW(e.target.value), setOk(false))} inputMode="decimal" aria-label="体重" className={`${input} nums w-16 text-right`} />
            kg
          </label>
          <button
            type="button"
            disabled={same || pr.stop.length > 0 || (pr.confirm.length > 0 && !ok)}
            onClick={() => {
              onChange({ kind: "body", heightCm: hn, weightKg: wn });
              setOk(false);
            }}
            className="rounded bg-ink px-2 py-0.5 text-[12px] font-bold text-white disabled:opacity-30"
          >
            登録
          </button>
          {pr.stop.length > 0 && <span className="w-full text-[11px] font-bold text-shu">{pr.stop.join(" ")}</span>}
          {pr.confirm.length > 0 && (
            <label className="flex w-full items-center gap-1 text-[11px] text-yamabuki">
              <input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} className="accent-yamabuki" />
              {pr.confirm.join(" ")}測り直し・単位を確かめた
            </label>
          )}
          <span className="w-full text-[10px] text-ink-faint">
            範囲：身長 {BODY_LIMITS.heightCm.join("〜")}cm・体重 {BODY_LIMITS.weightKg.join("〜")}kg。前回から身長 {BODY_JUMP.heightCm}cm・体重 {BODY_JUMP.weightRatio * 100}% を超えて違うときは確かめる<span className="hint">（架空の病院の取り決め）</span>
          </span>
        </div>
      )}
    </section>
  );
}

function CareSection({ log, patientId, when, onChange, denied }: { log: ProfileChange[]; patientId: string; when: (at: { day: number; time: string }) => string; onChange: (c: ProfileInput) => void; denied: string | null }) {
  const now = careNow(log, patientId);
  return (
    <section>
      <Head title="介助（移動・食事・排泄・入浴）" denied={denied} action={PROFILE_ACTION.care} />
      <p className="hint mb-1 text-[11px] text-ink-faint">押すとすぐ登録されます。「自立」以外は帯の注意に出ます。入院時の情報収集（アナムネ）で答えた内容もここに入ります。</p>
      <div className="space-y-1">
        {CARE_KEYS.map((k) => (
          <div key={k} className="flex flex-wrap items-center gap-1.5">
            <span className="w-10 shrink-0 text-[12px] text-ink-soft">{k}</span>
            <div role="radiogroup" aria-label={`介助（${k}）`} className="flex flex-wrap gap-1">
              {CARE_CHOICES[k].map((v) => {
                const on = now[k]?.value === v;
                return (
                  <button
                    key={v}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    disabled={!!denied}
                    onClick={() => !on && onChange({ kind: "care", key: k, value: v })}
                    className={`rounded-md border px-2 py-0.5 text-[12px] pointer-coarse:py-1.5 ${on ? "border-ink bg-ink font-bold text-white" : "border-rule bg-sheet text-ink-soft hover:text-ink disabled:opacity-50"}`}
                  >
                    {v}
                  </button>
                );
              })}
            </div>
            <span className="nums text-[11px] text-ink-faint">{now[k] ? `${when(now[k]!.at)} ${now[k]!.by}` : "未登録"}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
