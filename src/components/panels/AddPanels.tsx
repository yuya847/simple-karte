"use client";

import { Search } from "lucide-react";
import { useState } from "react";
import { newProcedureDraft, type Draft, type LabDraft } from "@/lib/drafts";
import { DRUGS, LAB_TESTS, ORAL_DRUGS, ORDER_SETS, WARD_RULES, findOralDrug, labInfo } from "@/lib/master";
import { USAGES } from "@/lib/rx";
import { MODALITIES, PHYSIO, REGIONS, emptyImaging, emptyPhysio, type Modality } from "@/lib/exams";
import { PROCEDURES, findProcDrug } from "@/lib/procedures";

/** Browse the injection master. Picking a drug puts its name into the instruction box to finish by voice or keys. */
export function AddInjectionPanel({ onPick }: { onPick: (text: string) => void }) {
  const [q, setQ] = useState("");
  const list = DRUGS.filter((d) => !q || [d.name, ...d.aliases].some((a) => a.includes(q)));
  return (
    <div>
      <label className="mb-3 flex items-center gap-2 rounded-md border border-rule px-2 py-1.5">
        <Search size={14} className="text-ink-faint" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="薬の名前・略称" className="flex-1 bg-transparent text-sm outline-none" autoFocus />
      </label>
      <p className="mb-2 text-xs text-ink-soft">選ぶと指示の欄に名前が入ります。量・回数・速度は続けて話すか打ってください。</p>
      <ul className="divide-y divide-rule-soft">
        {list.map((d) => (
          <li key={d.code}>
            <button type="button" onClick={() => onPick(d.aliases[0] ?? d.name)} className="nums flex w-full items-baseline gap-2 px-1 py-2 text-left text-sm hover:bg-paper">
              <span className="font-bold">{d.name}</span>
              <span className="text-xs text-ink-soft">{d.package}</span>
              <span className="ml-auto text-[11px] text-ink-faint">{d.aliases.slice(0, 3).join("・")}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Pick lab items one by one (grouped like a lab's test guide) or a hospital set, and a draw time.
 * Each item shows its material and container (after the SRL 総合検査案内); it becomes a draft
 * that goes through the same checks.
 */
export function AddLabPanel({ onAdd, newId }: { onAdd: (d: Draft) => void; newId: () => string }) {
  const [picked, setPicked] = useState<string[]>([]);
  const toggle = (code: string) => setPicked((p) => (p.includes(code) ? p.filter((c) => c !== code) : [...p, code]));

  const make = (when: "now" | "morning_routine"): LabDraft => ({
    id: newId(),
    origin: "manual",
    sourceText: "（マスターから選択）",
    comment: null,
    kind: "lab",
    tests: picked.map((code) => ({ code, said: code })),
    collect: { day: when === "now" ? 0 : 1, when, time: null, beforeDose: null },
    priority: null,
    cultureSets: null,
    duplicateOk: false,
  });

  const groups = [...new Set(LAB_TESTS.map((t) => t.group).filter((g) => g && g !== "セット"))] as string[];
  const containers = [...new Set(picked.map((c) => labInfo(c).container))];
  const notes = picked.flatMap((c) => (labInfo(c).note ? [`${LAB_TESTS.find((t) => t.code === c)?.abbr ?? c}：${labInfo(c).note}`] : []));

  return (
    <div className="space-y-3 text-[13px]">
      <section>
        <h3 className="mb-1 text-xs font-bold text-ink-soft">院内セット（架空の病院）</h3>
        <div className="flex flex-wrap gap-1.5">
          {[...ORDER_SETS.map((s) => ({ code: s.code, label: s.name, sub: s.labCodes.map((c) => LAB_TESTS.find((t) => t.code === c)?.abbr).join("・") })), { code: "LAB-CHEM", label: "生化学（病棟定期セット）", sub: "13項目" }].map((x) => (
            <button
              key={x.code}
              type="button"
              title={x.sub}
              onClick={() => toggle(x.code)}
              className={`rounded-md border px-2 py-1 ${picked.includes(x.code) ? "border-ai bg-ai font-bold text-white" : "border-rule hover:border-ai"}`}
            >
              {x.label}
            </button>
          ))}
        </div>
      </section>
      {groups.map((g) => (
        <section key={g}>
          <h3 className="mb-1 text-xs font-bold text-ink-soft">{g}</h3>
          <div className="flex flex-wrap gap-1">
            {LAB_TESTS.filter((t) => t.group === g).map((t) => (
              <button
                key={t.code}
                type="button"
                title={`${t.name}　${labInfo(t.code).material}・${labInfo(t.code).container}・${labInfo(t.code).tat}`}
                onClick={() => toggle(t.code)}
                className={`nums min-w-12 rounded border px-1.5 py-0.5 text-[12px] ${picked.includes(t.code) ? "border-ai bg-ai font-bold text-white" : "border-rule hover:border-ai"}`}
              >
                {t.abbr ?? t.name}
              </button>
            ))}
          </div>
        </section>
      ))}
      {picked.length > 0 && (
        <div className="rounded-md bg-paper px-2 py-1.5 text-[12px]">
          <div>
            <b>{picked.length}項目</b>　容器：{containers.join("・")}
          </div>
          {notes.map((n) => (
            <div key={n} className="text-yamabuki">
              {n}
            </div>
          ))}
        </div>
      )}
      <div className="sticky bottom-0 flex gap-2 border-t border-rule bg-sheet pt-3">
        <button type="button" disabled={!picked.length} onClick={() => onAdd(make("now"))} className="flex-1 rounded-md border border-ai px-3 py-2 text-sm text-ai disabled:opacity-40">
          今すぐ（至急）
        </button>
        <button type="button" disabled={!picked.length} onClick={() => onAdd(make("morning_routine"))} className="flex-1 rounded-md bg-ai px-3 py-2 text-sm font-bold text-white disabled:opacity-40">
          明日朝の定時（{WARD_RULES.routineDrawTime}）
        </button>
      </div>
      <p className="text-[11px] text-ink-faint">項目の分け方・材料・容器（SRL の容器記号）・所要日数は SRL「総合検査案内 2026-2027」を参考にしました。院内か外注かは架空の病院の設定です。結果の基準範囲は JCCLS 共用基準範囲（なければ SRL の値）です。</p>
    </div>
  );
}

/**
 * Pick a procedure from the master. It becomes a draft right away; the checks ask for what the
 * item needs (器具・流量、部位・範囲・深さ、回数), each with choices for the doctor.
 */
export function AddProcedurePanel({ onAdd, newId }: { onAdd: (d: Draft) => void; newId: () => string }) {
  return (
    <div>
      <p className="mb-2 text-xs text-ink-soft">選ぶと右に下書きができます。足りないところ（流量・部位・範囲・回数など）は下書きの上で選ぶか、話して足してください。</p>
      <ul className="divide-y divide-rule-soft">
        {PROCEDURES.map((p) => (
          <li key={p.code}>
            <button type="button" onClick={() => onAdd(newProcedureDraft(p.code, newId()))} className="flex w-full items-baseline gap-2 px-1 py-2 text-left text-sm hover:bg-paper">
              <span className="font-bold">{p.name}</span>
              {p.uses && <span className="text-xs text-ink-soft">{findProcDrug(p.uses.code)?.name}</span>}
              <span className="ml-auto truncate text-[11px] text-ink-faint">{p.aliases.slice(0, 3).join("・")}</span>
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[11px] text-ink-faint">処置の項目と院内の取り決めは架空の病院のものです。算定のコードと点数は公式の医科診療行為マスターから読みます。</p>
    </div>
  );
}

interface RpRow {
  drugCode: string;
  daily: string;
}
interface Rp {
  rows: RpRow[];
  usage: string;
  days: string;
  category: "定期" | "臨時";
  prn: string;
  maxPerDay: string;
}
const newRp = (): Rp => ({ rows: [], usage: "", days: "7", category: "定期", prn: "", maxPerDay: "" });

/**
 * Oral prescriptions by Rp: search the master (前方一致 / 部分一致), put drugs in an Rp, give
 * the daily amount (1日量), usage and days. The amount per dose (1回量) is worked out and shown.
 * Each Rp becomes a draft and goes through the same checks (errors / warnings to 承知).
 */
export function AddRxPanel({ onAdd, newId }: { onAdd: (d: Draft[]) => void; newId: () => string }) {
  const [q, setQ] = useState("");
  const [prefix, setPrefix] = useState(false);
  const [rps, setRps] = useState<Rp[]>([newRp()]);
  const [cur, setCur] = useState(0);
  const norm = (s: string) => s.normalize("NFKC").toLowerCase();
  const list = ORAL_DRUGS.filter((d) => !q || [d.name, ...d.aliases].some((a) => (prefix ? norm(a).startsWith(norm(q)) : norm(a).includes(norm(q)))));
  const upd = (i: number, patch: Partial<Rp>) => setRps((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const usage = (u: string) => (u === "頓用" ? [] : USAGES.find((x) => x.label === u)?.timings ?? null);

  const toDraft = (rp: Rp): Draft => {
    const timings = rp.usage ? usage(rp.usage) : null;
    const prn = rp.usage === "頓用";
    return {
      id: newId(),
      origin: "manual",
      sourceText: "（Rp 入力）",
      comment: null,
      kind: "prescription",
      category: prn ? null : rp.category,
      items: rp.rows.map((r) => ({ drugCode: r.drugCode, said: findOralDrug(r.drugCode)?.name ?? r.drugCode, daily: prn ? null : Number(r.daily) || null, perDose: prn ? Number(r.daily) || null : null })),
      timings,
      prn: prn ? rp.prn.trim() || null : null,
      maxPerDay: prn ? Number(rp.maxPerDay) || null : null,
      days: prn ? null : Number(rp.days) || null,
      start: { day: null, timing: null },
      acks: [],
    };
  };
  const ready = rps.filter((r) => r.rows.length);
  return (
    <div className="space-y-3 text-[13px]">
      <div className="flex items-center gap-2">
        <label className="flex flex-1 items-center gap-2 rounded-md border border-rule px-2 py-1.5">
          <Search size={14} className="text-ink-faint" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="薬の名前・略称" className="flex-1 bg-transparent text-sm outline-none" autoFocus />
        </label>
        <div role="radiogroup" className="flex rounded-md border border-rule p-0.5 text-[11px]">
          {[
            [true, "前方一致"],
            [false, "部分一致"],
          ].map(([v, l]) => (
            <button key={String(l)} type="button" role="radio" aria-checked={prefix === v} onClick={() => setPrefix(v as boolean)} className={`rounded px-1.5 py-0.5 ${prefix === v ? "bg-ink text-white" : "text-ink-soft"}`}>
              {l as string}
            </button>
          ))}
        </div>
      </div>
      <ul className="max-h-40 divide-y divide-rule-soft overflow-y-auto rounded border border-rule-soft">
        {list.map((d) => (
          <li key={d.code}>
            <button
              type="button"
              onClick={() => upd(cur, { rows: [...rps[cur].rows, { drugCode: d.code, daily: "" }] })}
              className="flex w-full items-baseline gap-2 px-2 py-1.5 text-left hover:bg-paper"
            >
              <b>{d.name}</b>
              <span className="text-xs text-ink-soft">
                {d.strength}／{d.unit}
              </span>
              <span className="ml-auto text-[11px] text-ink-faint">Rp{cur + 1} に入れる</span>
            </button>
          </li>
        ))}
      </ul>

      {rps.map((rp, i) => {
        const timings = rp.usage ? usage(rp.usage) : null;
        const prn = rp.usage === "頓用";
        return (
          <section key={i} onClick={() => setCur(i)} className={`rounded-md border p-2 ${cur === i ? "border-ai" : "border-rule"}`}>
            <div className="mb-1 text-[11px] font-bold text-ink-soft">Rp{i + 1}</div>
            {rp.rows.length === 0 && <p className="text-[12px] text-ink-faint">上の一覧から薬を選ぶと、この Rp に入ります。</p>}
            <table className="w-full">
              <tbody>
                {rp.rows.map((r, k) => {
                  const m = findOralDrug(r.drugCode)!;
                  const n = Number(r.daily);
                  const per = timings && timings.length && n ? Math.round((n / timings.length) * 100) / 100 : null;
                  return (
                    <tr key={k} className="align-baseline">
                      <td className="py-0.5 font-bold">
                        {m.name} {m.strength}
                      </td>
                      <td className="whitespace-nowrap py-0.5 text-right">
                        {prn ? "1回" : "1日"}
                        <input
                          value={r.daily}
                          onChange={(e) => upd(i, { rows: rp.rows.map((x, j) => (j === k ? { ...x, daily: e.target.value } : x)) })}
                          inputMode="decimal"
                          className="mx-1 w-12 rounded border border-rule bg-paper px-1 text-right"
                        />
                        {m.unit}
                        {per !== null && !prn && (
                          <span className="block text-[11px] text-ai">
                            1回{per}
                            {m.unit}
                          </span>
                        )}
                      </td>
                      <td className="w-6 text-right">
                        <button type="button" onClick={() => upd(i, { rows: rp.rows.filter((_, j) => j !== k) })} className="text-ink-faint hover:text-shu" aria-label="外す">
                          ×
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[12px]">
              <select value={rp.usage} onChange={(e) => upd(i, { usage: e.target.value })} className="rounded border border-rule bg-paper px-1 py-0.5">
                <option value="">用法を選ぶ</option>
                {USAGES.map((u) => (
                  <option key={u.label}>{u.label}</option>
                ))}
                <option>頓用</option>
              </select>
              {prn ? (
                <>
                  <input value={rp.prn} onChange={(e) => upd(i, { prn: e.target.value })} placeholder="条件（疼痛時など）" className="w-28 rounded border border-rule bg-paper px-1 py-0.5" />
                  1日
                  <input value={rp.maxPerDay} onChange={(e) => upd(i, { maxPerDay: e.target.value })} inputMode="numeric" className="w-8 rounded border border-rule bg-paper px-1 py-0.5 text-right" />
                  回まで
                </>
              ) : (
                <>
                  <input value={rp.days} onChange={(e) => upd(i, { days: e.target.value })} inputMode="numeric" className="w-10 rounded border border-rule bg-paper px-1 py-0.5 text-right" />
                  日分
                  <select value={rp.category} onChange={(e) => upd(i, { category: e.target.value as Rp["category"] })} className="rounded border border-rule bg-paper px-1 py-0.5">
                    <option>定期</option>
                    <option>臨時</option>
                  </select>
                </>
              )}
            </div>
          </section>
        );
      })}
      <div className="sticky bottom-0 flex gap-2 border-t border-rule bg-sheet pt-3">
        <button
          type="button"
          onClick={() => {
            setRps((r) => [...r, newRp()]);
            setCur(rps.length);
          }}
          className="rounded-md border border-rule px-3 py-2 text-sm text-ink-soft"
        >
          Rp を足す
        </button>
        <button type="button" disabled={!ready.length} onClick={() => onAdd(ready.map(toDraft))} className="flex-1 rounded-md bg-ai px-3 py-2 text-sm font-bold text-white disabled:opacity-40">
          下書きにする（{ready.length} Rp）
        </button>
      </div>
      <p className="text-[11px] text-ink-faint">1回量は1日量 ÷ 回数でコードが出します。チェック（割り切れない量・重複・アレルギー・極量）は右の下書きに出ます。重複・アレルギー・極量は、承知コメントを付けて確定できます。</p>
    </div>
  );
}

/**
 * Imaging order: pick the modality, then the region (only regions this hospital does for that
 * modality), and say why. Views, contrast, date and transport are asked on the draft with choices,
 * and the safety checks (eGFR, contrast allergy, MRI metal, pregnancy) run there.
 */
export function AddImagingPanel({ onAdd, newId }: { onAdd: (d: Draft) => void; newId: () => string }) {
  const [modality, setModality] = useState<Modality>("X線");
  const [region, setRegion] = useState<string | null>(null);
  const [purpose, setPurpose] = useState("");
  const regions = REGIONS.filter((r) => r.modalities.includes(modality));
  return (
    <div className="space-y-3 text-[13px]">
      <div role="radiogroup" aria-label="種類" className="flex flex-wrap gap-1">
        {MODALITIES.map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={modality === m}
            onClick={() => {
              setModality(m);
              setRegion(null);
            }}
            className={`rounded-md border px-3 py-1.5 ${modality === m ? "border-ai bg-ai font-bold text-white" : "border-rule text-ink-soft hover:border-ai"}`}
          >
            {m}
          </button>
        ))}
      </div>
      <div>
        <h3 className="mb-1 text-xs font-bold text-ink-soft">部位（{modality}）</h3>
        <div className="grid grid-cols-3 gap-1.5">
          {regions.map((r) => (
            <button
              key={r.code}
              type="button"
              onClick={() => setRegion(r.code)}
              className={`rounded-md border px-2 py-2 ${region === r.code ? "border-ai bg-ai-soft font-bold text-ai" : "border-rule hover:border-ai"}`}
            >
              {r.name}
            </button>
          ))}
        </div>
      </div>
      <label className="flex flex-col gap-1 text-xs text-ink-soft">
        目的（臨床診断・知りたいこと）
        <input value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="例：肺炎の経過" className="rounded-md border border-rule bg-paper px-2 py-1.5 text-[13px] text-ink outline-none focus:border-ai" />
      </label>
      <button
        type="button"
        disabled={!region}
        onClick={() => onAdd({ ...emptyImaging(newId(), modality), region, purpose: purpose.trim() || null })}
        className="w-full rounded-md bg-ai px-3 py-2 text-sm font-bold text-white disabled:opacity-40"
      >
        下書きにする
      </button>
      <p className="text-[11px] text-ink-faint">撮影の方向・単純か造影か・日時・移動は、右の下書きで選びます。造影なら腎機能（eGFR はコードで計算）・造影剤アレルギー、MRI なら体内金属の確認が出ます。部位と検査の組み合わせは架空の病院のものです。</p>
    </div>
  );
}

/** Physiological tests: pick the test and say why; place, date and transport are asked on the draft. */
export function AddPhysioPanel({ onAdd, newId }: { onAdd: (d: Draft) => void; newId: () => string }) {
  const [test, setTest] = useState<string | null>(null);
  const [purpose, setPurpose] = useState("");
  return (
    <div className="space-y-3 text-[13px]">
      <ul className="divide-y divide-rule-soft rounded border border-rule-soft">
        {PHYSIO.map((p) => (
          <li key={p.code}>
            <button type="button" onClick={() => setTest(p.code)} className={`flex w-full items-baseline gap-2 px-2 py-2 text-left ${test === p.code ? "bg-ai-soft font-bold text-ai" : "hover:bg-paper"}`}>
              {p.name}
              <span className="ml-auto text-[11px] font-normal text-ink-faint">{p.bedside ? "ベッドサイド可" : "検査室"}</span>
            </button>
          </li>
        ))}
      </ul>
      <label className="flex flex-col gap-1 text-xs text-ink-soft">
        目的
        <input value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="例：心機能評価" className="rounded-md border border-rule bg-paper px-2 py-1.5 text-[13px] text-ink outline-none focus:border-ai" />
      </label>
      <button
        type="button"
        disabled={!test}
        onClick={() => onAdd({ ...emptyPhysio(newId(), test), purpose: purpose.trim() || null })}
        className="w-full rounded-md bg-ai px-3 py-2 text-sm font-bold text-white disabled:opacity-40"
      >
        下書きにする
      </button>
    </div>
  );
}
