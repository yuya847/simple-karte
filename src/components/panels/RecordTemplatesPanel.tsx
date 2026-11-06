"use client";

// テンプレート: records with a fixed shape (身体的拘束・救急医療管理加算の根拠・IC・転倒・急変 …). Pick one, fill
// the form, and the note is put together by code in the fixed wording — into the note box, or confirmed
// straight away as a note headed 【テンプレート名】. ★ puts a template on the right rail's お気に入り so it opens
// in one press. Own templates are shared with the note box's テンプレート (kept per person in this browser).

import { displayText } from "@/lib/display-text";
import { Copy, ExternalLink, PencilLine, Plus, Star, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { fieldKey, parseTemplate, type NoteTemplate, type TemplateValues } from "@/lib/note-templates";
import { pinOfTemplate, togglePin, useRail } from "@/lib/rail";
import { buildRecord, findRecordTemplate, loadMyRecordTemplates, recordProblems, recordTemplatesFor, saveMyRecordTemplates, startRecordValues, type LinkedPanel, type RecordFacts, type RecordTemplate } from "@/lib/record-templates";
import { FieldInput, TemplateEditor } from "../NoteTemplates";
import { DenyNote, useDeny, useMe } from "../RoleContext";

type View = { kind: "list" } | { kind: "fill"; t: NoteTemplate } | { kind: "edit"; t: NoteTemplate | null; seed: string; name: string };

interface Props {
  facts: Omit<RecordFacts, "me">;
  /** Open straight into this template's form (from a pinned tile on the rail). */
  initialId?: string | null;
  /** Puts the text into the note box (confirmed later with the note). */
  onInsert: (text: string, template: { templateId: string; templateName: string }) => void;
  /** Confirms the text as a note of its own now. */
  onConfirm: (text: string, name: string, templateId: string) => void;
  /** Opens the record a template goes with (身体的拘束・褥瘡の経過). */
  onOpenPanel: (p: LinkedPanel) => void;
}

const isRecord = (t: NoteTemplate): t is RecordTemplate => "short" in t;

export function RecordTemplatesPanel({ facts: given, initialId = null, onInsert, onConfirm, onOpenPanel }: Props) {
  const me = useMe();
  const facts: RecordFacts = { ...given, me };
  const [mine, setMine] = useState<NoteTemplate[]>(() => loadMyRecordTemplates(me.name));
  const [saved, setSaved] = useState<boolean | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [view, setView] = useState<View>(() => {
    const t = initialId ? findRecordTemplate(initialId, loadMyRecordTemplates(me.name)) : undefined;
    return t ? { kind: "fill", t } : { kind: "list" };
  });
  const [rail, putRail] = useRail(me.name);
  const offered = recordTemplatesFor(me.role, mine);
  const store = (list: NoteTemplate[]) => {
    setMine(list);
    setSaved(saveMyRecordTemplates(me.name, list));
  };
  const pinned = (t: NoteTemplate) => rail.pins.includes(pinOfTemplate(t.id));
  const star = (t: NoteTemplate) => (
    <button
      type="button"
      onClick={() => putRail({ ...rail, pins: togglePin(rail.pins, pinOfTemplate(t.id)) })}
      aria-pressed={pinned(t)}
      aria-label={pinned(t) ? `${t.name}を右の道具から外す` : `${t.name}を右の道具に出す`}
      title={pinned(t) ? "右端のお気に入りから外す" : "右端のお気に入りに出す（1回で開けます）"}
      className={`rounded p-1 pointer-coarse:p-1.5 ${pinned(t) ? "text-yamabuki" : "text-ink-faint hover:text-yamabuki"}`}
    >
      <Star size={14} fill={pinned(t) ? "currentColor" : "none"} />
    </button>
  );
  const row = "flex items-center gap-1 rounded-md border border-rule bg-sheet px-1 py-0.5";
  const iconBtn = "rounded p-1 text-ink-faint hover:bg-paper hover:text-ink pointer-coarse:p-1.5";

  return (
    <div className="space-y-3 text-[13px]">
      {view.kind !== "list" && (
        <button type="button" onClick={() => setView({ kind: "list" })} className="text-xs text-ink-soft underline">
          一覧に戻る
        </button>
      )}
      {done && view.kind === "list" && <p className="rounded-md border border-wakatake/40 bg-wakatake-soft/40 px-2 py-1 text-xs text-ink">{done}</p>}

      {view.kind === "list" && (
        <>

          <section>
            <div className="mb-1 text-[11px] text-ink-faint">
              この病院のテンプレート
            </div>
            {offered.builtIn.length === 0 ? (
              <p className="text-xs text-ink-faint">この職種のテンプレートはありません。自分のテンプレートは作れます。</p>
            ) : (
              <ul className="space-y-1">
                {offered.builtIn.map((t) => (
                  <li key={t.id} className={row}>
                    <button type="button" onClick={() => setView({ kind: "fill", t })} className="min-w-0 flex-1 rounded px-1.5 py-1 text-left hover:bg-paper">
                      <span className="font-bold">{t.name}</span>
                      <span className="ml-2 text-[11px] text-ink-soft">{t.about}</span>
                    </button>
                    {star(t)}
                    <button type="button" onClick={() => setView({ kind: "edit", t: null, seed: t.body, name: `${t.name}（自分用）` })} title="複製して自分用に直す" aria-label={`${t.name}を複製して自分用に直す`} className={iconBtn}>
                      <Copy size={13} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section>
            <div className="mb-1 text-[11px] text-ink-faint">自分のテンプレート（{me.name}・この端末のみに保存。記事の「テンプレート」と同じもの）</div>
            <ul className="space-y-1">
              {mine.map((t) => (
                <li key={t.id} className={row}>
                  <button type="button" onClick={() => setView({ kind: "fill", t })} className="min-w-0 flex-1 rounded px-1.5 py-1 text-left font-bold hover:bg-paper">
                    {t.name}
                  </button>
                  {star(t)}
                  <button type="button" onClick={() => setView({ kind: "edit", t, seed: t.body, name: t.name })} title="直す" aria-label={`${t.name}を直す`} className={iconBtn}>
                    <PencilLine size={13} />
                  </button>
                  <button type="button" onClick={() => store(mine.filter((x) => x.id !== t.id))} title="消す" aria-label={`${t.name}を消す`} className="rounded p-1 text-ink-faint hover:bg-shu-soft hover:text-shu pointer-coarse:p-1.5">
                    <Trash2 size={13} />
                  </button>
                </li>
              ))}
            </ul>
            <button type="button" onClick={() => setView({ kind: "edit", t: null, seed: "", name: "" })} className="mt-1 inline-flex items-center gap-1 rounded-md border border-dashed border-ai/60 px-2 py-1 text-xs text-ai hover:bg-sheet">
              <Plus size={12} />
              自分のテンプレートを作る
            </button>
            {saved === false && <p className="mt-1 text-[11px] text-yamabuki">この端末に保存できませんでした（ブラウザの設定）。ページを閉じるまでは使えます。</p>}
          </section>
        </>
      )}

      {view.kind === "fill" && (
        <RecordForm
          key={view.t.id}
          t={view.t}
          facts={facts}
          star={star(view.t)}
          onOpenPanel={onOpenPanel}
          onInsert={(text) => {
            onInsert(text, { templateId: view.t.id, templateName: view.t.name });
            setDone(`「${view.t.name}」を右の記事に入れました。直してから記事を確定してください。`);
            setView({ kind: "list" });
          }}
          onConfirm={(text) => {
            onConfirm(text, view.t.name, view.t.id);
            setDone(`「${view.t.name}」を記事として確定しました。左の経過に入りました。`);
            setView({ kind: "list" });
          }}
        />
      )}

      {view.kind === "edit" && (
        <TemplateEditor
          key={view.t?.id ?? `new-${view.name}`}
          start={view}
          others={mine}
          onSave={(name, body) => {
            const t: NoteTemplate = view.t ? { ...view.t, name, body } : { id: crypto.randomUUID(), name, body, roles: [me.role], by: me.name };
            store(view.t ? mine.map((x) => (x.id === t.id ? t : x)) : [...mine, t]);
            setView({ kind: "fill", t });
          }}
        />
      )}
    </div>
  );
}

function RecordForm({ t, facts, star, onInsert, onConfirm, onOpenPanel }: { t: NoteTemplate; facts: RecordFacts; star: React.ReactNode; onInsert: (text: string) => void; onConfirm: (text: string) => void; onOpenPanel: (p: LinkedPanel) => void }) {
  const deny = useDeny()("note");
  const parsed = useMemo(() => parseTemplate(t.body), [t.body]);
  const [values, setValues] = useState<TemplateValues>(() => startRecordValues(t, facts));
  const text = buildRecord(t, values, facts);
  const problems = recordProblems(t, values);
  const rec = isRecord(t) ? t : null;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-bold">{t.name}</h3>
        {star}
        <span className="text-[11px] text-ink-faint">{displayText(t.by ? `自分のテンプレート（${t.by}）` : "この病院のテンプレート")}</span>
        {rec?.link && (
          <button type="button" onClick={() => onOpenPanel(rec.link!.panel)} className="ml-auto inline-flex items-center gap-1 rounded-md border border-rule bg-sheet px-2 py-0.5 text-xs text-ink-soft hover:text-ink">
            <ExternalLink size={12} />
            {rec.link.label}
          </button>
        )}
      </div>
      {rec?.about && <p className="text-[12px] text-ink-soft">{rec.about}</p>}


      <div className="divide-y divide-rule-soft rounded-md border border-rule bg-paper/60 px-2 py-1">
        {parsed.fields.map((f) => (
          <FieldInput key={fieldKey(f)} f={f} values={values} set={(k, v) => setValues((s) => ({ ...s, [k]: v }))} facts={facts} fields={parsed.fields} />
        ))}
        {parsed.fields.length === 0 && <p className="py-1 text-xs text-ink-faint">入力の欄はありません（本文がそのまま入ります）。</p>}
      </div>
      <details open className="rounded-md border border-rule-soft bg-sheet px-2 py-1">
        <summary className="cursor-pointer text-[11px] text-ink-soft">記事に入る文（見本）</summary>
        <pre className="nums mt-1 whitespace-pre-wrap font-[inherit] text-[12px] leading-relaxed">{displayText(text)}</pre>
      </details>
      {problems.length > 0 && (
        <ul className="text-[11px] text-yamabuki">
          {problems.map((p) => (
            <li key={p}>・{p}</li>
          ))}
        </ul>
      )}
      <DenyNote action="note" />
      <div className="flex flex-wrap items-center justify-end gap-2">
        <button type="button" disabled={!!deny} onClick={() => onInsert(text)} className="rounded-md border border-ai px-3 py-1 text-xs font-bold text-ai hover:bg-sheet disabled:opacity-40">
          記事に入れる
        </button>
        <button type="button" disabled={!!deny || problems.length > 0} onClick={() => onConfirm(text)} title={problems.length ? "項目を埋めると確定できます" : "この文をそのまま記事として確定します"} className="rounded-md bg-ai px-3 py-1 text-xs font-bold text-white hover:bg-ai/90 disabled:opacity-40">
          記事として確定
        </button>
      </div>

    </div>
  );
}

/* Help migration source (references and dynamic wording):
<p >決まった型の記録です。選ぶと項目（チェック・選択・数値・時刻・自由記載）が出て、埋めると決まった形の文になります。「記事に入れる」で右の記事に入り、「記事として確定」でそのまま経過に残ります。★ を押すと右端の道具のお気に入りに並び、1回で開けます。文はコードが組み、AI は使いません。</p>
<p >{rec.hint}</p>
<p >{rec.rule}</p>
<p >
          出典：
          {rec.sources.map((s, i) => (
            <span key={s.url + i}>
              {i > 0 && "／"}
              <a href={s.url} target="_blank" rel="noreferrer" >
                {s.label}
              </a>
            </span>
          ))}
        </p>
*/
