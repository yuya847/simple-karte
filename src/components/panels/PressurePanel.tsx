"use client";

import { displayText } from "@/lib/display-text";
import { Camera } from "lucide-react";
import { useState } from "react";
import {
  DEPTHS,
  DEPTH_LABEL,
  DESIGN_ITEMS,
  PHOTO_MAX,
  SITES,
  areaOf,
  courseOf,
  designComplete,
  designText,
  designTotal,
  fitWithin,
  pocketCodeOf,
  samplePhoto,
  scoreProblems,
  siteLabel,
  sizeCodeOf,
  ulcerDue,
  type DesignScore,
  type Measure,
  type PressureUlcer,
  type Site,
  type UlcerPhoto,
} from "@/lib/pressure-course";
import { useMe } from "../RoleContext";

/** Make a picture smaller in the browser (the record keeps the small JPEG; the file itself is not kept). */
async function downsize(file: File): Promise<UlcerPhoto> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, ng) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => ng(new Error("画像を読めませんでした。"));
      i.src = url;
    });
    const { width, height } = fitWithin(img.naturalWidth, img.naturalHeight, PHOTO_MAX);
    const c = document.createElement("canvas");
    c.width = width;
    c.height = height;
    c.getContext("2d")!.drawImage(img, 0, 0, width, height);
    return { dataUrl: c.toDataURL("image/jpeg", 0.7), width, height, name: file.name };
  } finally {
    URL.revokeObjectURL(url);
  }
}

const STATE_STYLE = { 期限切れ: "bg-shu-soft text-shu", 今日まで: "bg-yamabuki-soft text-yamabuki", 期限内: "bg-sheet text-ink-soft", 治癒: "bg-wakatake-soft text-wakatake" } as const;

export function Sources() {
  return (
    null
  );
}

const num = (s: string) => (s.trim() === "" ? undefined : Number(s));
const measure = (l: string, w: string): Measure | undefined => {
  const a = num(l);
  const b = num(w);
  return a && b && a > 0 && b > 0 ? { lengthCm: a, widthCm: b } : undefined;
};

/** One DESIGN-R®2020 assessment: every item chosen by the nurse; code adds up and checks the sizes. */
function AssessForm({ nowTime, onSave, onCancel }: { nowTime: string; onSave: (a: { score: DesignScore; size?: Measure; pocket?: Measure; photo?: UlcerPhoto; note: string }) => void; onCancel: () => void }) {
  const [s, setS] = useState<Partial<DesignScore>>({});
  const [len, setLen] = useState("");
  const [wid, setWid] = useState("");
  const [pl, setPl] = useState("");
  const [pw, setPw] = useState("");
  const [photo, setPhoto] = useState<UlcerPhoto | undefined>();
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const size = measure(len, wid);
  const pocket = measure(pl, pw);
  const problems = scoreProblems(s, size, pocket);
  const done = designComplete(s);
  const pick = (k: keyof DesignScore, v: string) => setS((x) => ({ ...x, [k]: v }));
  const box = "w-16 rounded border border-rule bg-paper px-1.5 py-1 text-right text-[13px]";
  return (
    <div className="space-y-2 rounded-md border border-ai/40 bg-paper p-2 text-[12px]">
      <label className="flex flex-wrap items-center gap-2">
        <b className="w-28 shrink-0">深さ（Depth）</b>
        <select value={s.depth ?? ""} onChange={(e) => pick("depth", e.target.value)} aria-label="深さ" className="rounded border border-rule bg-sheet px-1 py-1">
          <option value="">（選ぶ）</option>
          {DEPTHS.map((d) => (
            <option key={d} value={d}>
              {DEPTH_LABEL[d]}
            </option>
          ))}
        </select>
        <span className="text-[11px] text-ink-faint">深さの点数は合計に加えません</span>
      </label>
      <div className="nums flex flex-wrap items-end gap-2 text-ink-soft">
        <label className="flex flex-col">
          長径 cm
          <input value={len} onChange={(e) => setLen(e.target.value)} inputMode="decimal" aria-label="長径（cm）" className={box} />
        </label>
        <label className="flex flex-col">
          短径 cm
          <input value={wid} onChange={(e) => setWid(e.target.value)} inputMode="decimal" aria-label="短径（cm）" className={box} />
        </label>
        <label className="flex flex-col">
          ポケット長径
          <input value={pl} onChange={(e) => setPl(e.target.value)} inputMode="decimal" aria-label="ポケットの長径（cm）" className={box} />
        </label>
        <label className="flex flex-col">
          ポケット短径
          <input value={pw} onChange={(e) => setPw(e.target.value)} inputMode="decimal" aria-label="ポケットの短径（cm）" className={box} />
        </label>
        {size && (
          <span className="pb-1">
            面積 {areaOf(size)}cm² → {sizeCodeOf(areaOf(size))}
            {pocket && `　ポケット ${Math.round((areaOf(pocket) - areaOf(size)) * 10) / 10}cm² → ${pocketCodeOf(areaOf(pocket), areaOf(size))}`}
          </span>
        )}
      </div>
      {DESIGN_ITEMS.map((it) => (
        <div key={it.key} className="flex flex-wrap items-start gap-1.5">
          <span className="w-28 shrink-0 pt-0.5">
            <b>{it.name}</b>
            {it.how && <span className="block text-[10px] text-ink-faint">{it.how}</span>}
          </span>
          <div role="radiogroup" aria-label={it.name} className="flex flex-1 flex-wrap gap-1">
            {it.grades.map((g) => (
              <button
                key={g.code}
                type="button"
                role="radio"
                aria-checked={s[it.key] === g.code}
                onClick={() => pick(it.key, g.code)}
                className={`rounded border px-1.5 py-0.5 text-left text-[11px] ${s[it.key] === g.code ? "border-ink bg-ink text-white" : "border-rule bg-sheet hover:border-ai"}`}
              >
                <b className="nums">{g.code}</b>（{g.points}）{g.label}
              </button>
            ))}
          </div>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-2">
        <b className="w-28 shrink-0">写真</b>
        <label className="flex cursor-pointer items-center gap-1 rounded border border-rule bg-sheet px-2 py-1 hover:border-ai">
          <Camera size={13} />
          写真を取り込む
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              setErr(null);
              try {
                setPhoto(await downsize(f));
              } catch (x) {
                setErr(x instanceof Error ? x.message : "画像を読めませんでした。");
              }
            }}
          />
        </label>
        {([1, 2, 3] as const).map((n) => (
          <button key={n} type="button" onClick={() => setPhoto(samplePhoto(n))} className="rounded border border-dashed border-rule px-2 py-1 text-ink-soft hover:border-ai">
            見本{n}
          </button>
        ))}
        {photo && (
          <span className="flex items-center gap-1">
            {/* eslint-disable-next-line @next/next/no-img-element -- a data URL kept in the record */}
            <img src={photo.dataUrl} alt={photo.sample ? "見本（図形）" : "取り込んだ写真"} width={64} height={Math.round((64 * photo.height) / photo.width)} className="rounded border border-rule" />
            <span className="nums text-[11px] text-ink-faint">
              {photo.width}×{photo.height}px{photo.sample ? "" : ""}
            </span>
            <button type="button" onClick={() => setPhoto(undefined)} className="rounded border border-rule px-1.5 text-[11px]">
              外す
            </button>
          </span>
        )}
      </div>
      <p className="text-[11px] font-bold text-shu">このデモは患者です。実在の患者の写真は入れないでください。</p>

      {err && <p className="text-shu">{err}</p>}
      <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="観察したこと（色・におい・周りの皮膚など）" aria-label="観察したこと" className="w-full rounded border border-rule bg-sheet px-2 py-1" />
      {problems.map((p) => (
        <p key={p} className="text-yamabuki">
          {p}
        </p>
      ))}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={!done}
          onClick={() => done && onSave({ score: s, size, pocket, photo, note: note.trim() })}
          className="rounded-md bg-ai px-3 py-1 font-bold text-white disabled:opacity-40"
        >
          評価を記録（{nowTime}）
        </button>
        <button type="button" onClick={onCancel} className="rounded-md border border-rule px-3 py-1">
          やめる
        </button>
        <span className="nums text-ink-soft">{displayText(done ? `${designText(s)}　合計 ${designTotal(s)}点` : "深さと6つの項目を選ぶと合計が出ます")}</span>
      </div>
    </div>
  );
}

function NewUlcerForm({ onSave, onCancel }: { onSave: (u: { site: Site; siteNote?: string; daysAgo: number; origin: PressureUlcer["origin"] }) => void; onCancel: () => void }) {
  const [site, setSite] = useState<Site | null>(null);
  const [siteNote, setSiteNote] = useState("");
  const [ago, setAgo] = useState("0");
  const [origin, setOrigin] = useState<PressureUlcer["origin"] | null>(null);
  const daysAgo = Number(ago);
  const ok = !!site && !!origin && Number.isInteger(daysAgo) && daysAgo >= 0 && (site !== "その他" || !!siteNote.trim());
  return (
    <div className="space-y-2 rounded-md border border-ai/40 bg-paper p-2 text-[12px]">
      <div className="flex flex-wrap items-center gap-1">
        <b className="w-20">部位</b>
        {SITES.map((x) => (
          <button key={x} type="button" aria-pressed={site === x} onClick={() => setSite(x)} className={`rounded border px-2 py-0.5 ${site === x ? "border-ink bg-ink text-white" : "border-rule bg-sheet"}`}>
            {x}
          </button>
        ))}
        <input value={siteNote} onChange={(e) => setSiteNote(e.target.value)} placeholder={site === "その他" ? "部位を書く" : "右・左など（任意）"} aria-label="部位の補足" className="w-36 rounded border border-rule bg-sheet px-2 py-0.5" />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <b className="w-20">発生日</b>
        <input value={ago} onChange={(e) => setAgo(e.target.value)} inputMode="numeric" aria-label="何日前に見つけたか" className="w-12 rounded border border-rule bg-sheet px-1.5 py-0.5 text-right" />
        日前（今日は0）
        <b className="ml-3">発生</b>
        {(["院内発生", "持ち込み"] as const).map((x) => (
          <button key={x} type="button" aria-pressed={origin === x} onClick={() => setOrigin(x)} className={`rounded border px-2 py-0.5 ${origin === x ? "border-ink bg-ink text-white" : "border-rule bg-sheet"}`}>
            {x}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <button type="button" disabled={!ok} onClick={() => ok && onSave({ site: site!, siteNote: siteNote.trim() || undefined, daysAgo, origin: origin! })} className="rounded-md bg-ai px-3 py-1 font-bold text-white disabled:opacity-40">
          褥瘡を登録
        </button>
        <button type="button" onClick={onCancel} className="rounded-md border border-rule px-3 py-1">
          やめる
        </button>
      </div>
    </div>
  );
}

/**
 * 褥瘡の経過（DESIGN-R®2020）for one patient: each pressure injury with its course (scores, total, size, photo),
 * a new assessment, and 治癒. The nurse chooses every score; code adds up and checks. Nothing is decided by AI.
 */
export function PressurePanel({ patientId, ulcers, nowTime, fmtDay, newId, canRecord, onChange }: { patientId: string; ulcers: PressureUlcer[]; nowTime: string; fmtDay: (d: number) => string; newId: () => string; canRecord: boolean; onChange: (u: PressureUlcer, what: string) => void }) {
  const me = useMe();
  const [adding, setAdding] = useState(false);
  const [assessing, setAssessing] = useState<string | null>(null);
  const mine = ulcers.filter((u) => u.patientId === patientId);
  const at = { day: 0, time: nowTime };
  return (
    <div className="space-y-3 text-[13px]">
      {mine.length === 0 && !adding && <p className="text-ink-soft">この患者の褥瘡の記録はありません。</p>}
      {mine.map((u) => {
        const due = ulcerDue(u);
        const course = courseOf(u);
        return (
          <section key={u.id} className="rounded-md border border-rule bg-sheet p-2">
            <header className="mb-1 flex flex-wrap items-baseline gap-2">
              <b className="text-[14px]">{siteLabel(u)}</b>
              <span className="text-[12px] text-ink-soft">
                {u.origin}　発生日 {fmtDay(u.foundOn)}
              </span>
              <span className={`rounded px-1.5 text-[11px] font-bold ${STATE_STYLE[due.state]}`}>{due.state === "治癒" ? `治癒 ${fmtDay(u.healed!.day)}` : `次の評価 ${fmtDay(due.dueOn)}（${due.state}）`}</span>
              {canRecord && !u.healed && (
                <span className="ml-auto flex gap-1">
                  <button type="button" onClick={() => setAssessing(u.id)} className="rounded border border-ai px-2 py-0.5 text-[12px] text-ai hover:bg-ai hover:text-white">
                    評価を記録
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm(`${siteLabel(u)}の褥瘡を「治癒」として記録しますか。`)) onChange({ ...u, healed: { ...at, by: me.name } }, `${siteLabel(u)}の褥瘡を治癒とした`);
                    }}
                    className="rounded border border-rule px-2 py-0.5 text-[12px]"
                  >
                    治癒とする
                  </button>
                </span>
              )}
            </header>
            {assessing === u.id && (
              <AssessForm
                nowTime={nowTime}
                onCancel={() => setAssessing(null)}
                onSave={(a) => {
                  onChange({ ...u, assessments: [...u.assessments, { id: newId(), at, by: me.name, ...a }] }, `${siteLabel(u)} ${designText(a.score)}（合計${designTotal(a.score)}点）${a.photo ? "・写真あり" : ""}`);
                  setAssessing(null);
                }}
              />
            )}
            {course.length === 0 ? (
              <p className="text-[12px] text-yamabuki">DESIGN-R®2020 の評価がまだです。</p>
            ) : (
              <table className="nums w-full border-collapse text-[12px]">
                <thead>
                  <tr className="border-b border-rule text-left text-ink-soft">
                    <th className="px-1 py-1">日時</th>
                    <th className="px-1">DESIGN-R®2020</th>
                    <th className="px-1 text-right">合計</th>
                    <th className="px-1">大きさ</th>
                    <th className="px-1">写真</th>
                    <th className="px-1">観察・記録者</th>
                  </tr>
                </thead>
                <tbody>
                  {course.map((a, i) => {
                    const t = designTotal(a.score);
                    const before = i > 0 ? designTotal(course[i - 1].score) : undefined;
                    return (
                      <tr key={a.id} className="border-b border-rule-soft align-top">
                        <td className="whitespace-nowrap px-1 py-1">
                          {fmtDay(a.at.day)} {a.at.time}
                        </td>
                        <td className="px-1 font-bold">{displayText(designText(a.score))}</td>
                        <td className="px-1 text-right">
                          <b>{t}</b>
                          {before !== undefined && t !== before && <span className={t < before ? "ml-1 text-wakatake" : "ml-1 text-shu"}>{t < before ? `▼${before - t}` : `▲${t - before}`}</span>}
                        </td>
                        <td className="px-1">{a.size ? `${a.size.lengthCm}×${a.size.widthCm}cm（${areaOf(a.size)}cm²）` : "—"}</td>
                        <td className="px-1">
                          {a.photo ? (
                            <a href={a.photo.dataUrl} target="_blank" rel="noreferrer" title={a.photo.sample ? "見本（図形）" : "取り込んだ写真"}>
                              {/* eslint-disable-next-line @next/next/no-img-element -- a data URL kept in the record */}
                              <img src={a.photo.dataUrl} alt={a.photo.sample ? "見本（図形）" : "取り込んだ写真"} width={56} height={Math.round((56 * a.photo.height) / a.photo.width)} className="rounded border border-rule" />
                            </a>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-1">
                          {a.note && <div>{displayText(a.note)}</div>}
                          <div className="text-[11px] text-ink-faint">{displayText(a.by)}</div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </section>
        );
      })}
      {adding ? (
        <NewUlcerForm
          onCancel={() => setAdding(false)}
          onSave={(x) => {
            onChange({ id: newId(), patientId, site: x.site, siteNote: x.siteNote, foundOn: -x.daysAgo, origin: x.origin, by: me.name, assessments: [] }, `${x.site}${x.siteNote ? `（${x.siteNote}）` : ""}の褥瘡を登録（${x.origin}）`);
            setAdding(false);
          }}
        />
      ) : (
        canRecord && (
          <button type="button" onClick={() => setAdding(true)} className="rounded-md border border-dashed border-ai px-3 py-1 text-ai hover:bg-ai-soft">
            ＋ 褥瘡を登録
          </button>
        )
      )}


      <Sources />
    </div>
  );
}

/* Help migration source (references and dynamic wording):
<ul >
      {[PRESSURE_SOURCES.form, PRESSURE_SOURCES.rule, PRESSURE_SOURCES.scale].map((s) => (
        <li key={s.url + s.label}>
          <a href={s.url} target="_blank" rel="noreferrer" >
            {s.label}
          </a>
        </li>
      ))}
      <li>{PRESSURE_RULES.interval}</li>
      <li>{PRESSURE_RULES.photo}</li>
    </ul>
<span >（コードで計算）</span>
<p >写真は端末の中で長い辺 {PHOTO_MAX}px の JPEG に縮小してから記録に入れます（元のファイルとその撮影情報は記録に残りません）。</p>
<p >深さと6つの項目は看護師・医師が選びます。コードは合計点（深さを除く）を足し、測った大きさと選んだ点数が合わないときに知らせ、次の評価の日を出します。</p>
<a href={PRESSURE_SOURCES.scale.url} target="_blank" rel="noreferrer" >
        <ExternalLink size={12} />
        各項目の定義は日本褥瘡学会の「DESIGN-R®2020 褥瘡経過評価用」を見る
      </a>
*/
